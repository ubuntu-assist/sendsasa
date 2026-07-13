import { Injectable } from '@nestjs/common'
import { LocalTransfer } from './kobokall-remittance.schema'
import { PawapayService } from '@payments/pawapay/pawapay.service'
import { calculateFee } from '@common/helpers/fee'
import {
  sendTextMessage,
  sendCtaUrlButton,
  sendMessage,
} from '@messaging/whatsapp/whatsapp.service'
import { appEmitter, EVENTS } from '@shared/app-emitter'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { UserRepository } from '@domain/repositories/user.repository'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'
import { PaymentRailService } from '@shared/payment-rail.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import type { CreateKoboKallDto } from '@app/types'
import logger from '@common/utils/logger'

const OPERATOR_LABELS: Record<string, string> = {
  MTN_MOMO_CMR: 'MTN MoMo',
  ORANGE_CMR: 'Orange Money',
}

function operatorLabel(code: string): string {
  return OPERATOR_LABELS[code] ?? code
}

@Injectable()
export class KoboKallService {
  constructor(
    private readonly stellarService: StellarService,
    private readonly stellarAnchor: StellarAnchorService,
    private readonly paymentRailService: PaymentRailService,
    private readonly fxRate: FxRateService,
    private readonly pawapay: PawapayService,
    private readonly users: UserRepository,
  ) {}

  async initiateTransfer(
    senderPhone: string,
    dto: CreateKoboKallDto,
  ): Promise<void> {
    const sender = await this.users.findByPhone(senderPhone)
    if (!sender) return

    if (this.paymentRailService.getRail(sender) === 'stellar') {
      await this._initiateStellarTransfer(senderPhone, dto, sender)
      return
    }

    const [senderOperator, recipientOperator] = await Promise.all([
      this.pawapay.predictCorrespondent(senderPhone),
      this.pawapay.predictCorrespondent(dto.recipientPhone),
    ])

    const amount = Math.round(dto.amount)
    const fee = calculateFee(amount)
    const netAmount = amount - fee
    const transferId = this.pawapay.generateId()

    await LocalTransfer.create({
      transferId,
      senderPhone,
      recipientPhone: dto.recipientPhone,
      amount,
      fee,
      netAmount,
      senderOperator,
      recipientOperator,
      status: 'INITIATED',
    })

    await this.users.setContext(senderPhone, { type: 'KOBOKALL', id: String(transferId) })

    await sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: senderPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text:
            `📲 *MoMo Transfer*\n\n` +
            `📤 You send: ${amount.toLocaleString()} XAF\n` +
            `📱 Recipient: ${dto.recipientPhone}\n` +
            `📶 ${operatorLabel(senderOperator)} → ${operatorLabel(recipientOperator)}\n` +
            `💰 They receive: ${netAmount.toLocaleString()} XAF\n\n` +
            `Do you confirm this transfer?`,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `kobokall_confirm:${transferId}`,
                title: '✅ Confirm',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `kobokall_cancel:${transferId}`,
                title: '❌ Cancel',
              },
            },
          ],
        },
      },
    })

    logger.info(
      `[KoboKall] Transfer ${transferId} initiated: ${senderPhone} → ${dto.recipientPhone}`,
    )
  }

  async confirmTransfer(transferId: string, phone: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ transferId })
    if (!transfer || (transfer as any).senderPhone !== phone) {
      return
    }
    if ((transfer as any).status !== 'INITIATED') {
      return
    }

    const depositId = this.pawapay.generateId()
    ;(transfer as any).depositId = depositId
    ;(transfer as any).status = 'PROCESSING'
    await (transfer as any).save()

    await sendTextMessage(
      phone,
      `⏳ *Transfer in progress...*\n\nAccept the USSD prompt on your phone.`,
    )

    const result = await this.pawapay.initiateDeposit(
      depositId,
      phone,
      (transfer as any).amount,
      'MoMoTransfer',
      transferId,
    )

    if (result.status === 'REJECTED') {
      ;(transfer as any).status = 'FAILED'
      ;(transfer as any).failureCode = result.rejectionReason ?? 'REJECTED'
      await (transfer as any).save()
      await sendTextMessage(
        phone,
        `❌ *Transfer rejected*\n\n${result.rejectionReason ?? ''}\nPlease try again.`,
      )
    }

    logger.info(
      `[KoboKall] Transfer ${transferId} deposit initiated, status: ${result.status}`,
    )
  }

  async onDepositCompleted(depositId: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ depositId })
    if (!transfer) {
      return
    }
    if ((transfer as any).status !== 'PROCESSING') {
      return
    }

    ;(transfer as any).status = 'DEPOSIT_CONFIRMED'
    const payoutId = this.pawapay.generateId()
    ;(transfer as any).payoutId = payoutId
    await (transfer as any).save()

    const result = await this.pawapay.initiatePayout(
      payoutId,
      (transfer as any).recipientPhone,
      (transfer as any).netAmount,
      'MoMoTransfer',
      (transfer as any).transferId,
    )

    if (result.status === 'REJECTED') {
      ;(transfer as any).status = 'FAILED'
      ;(transfer as any).failureCode =
        result.rejectionReason ?? 'PAYOUT_REJECTED'
      await (transfer as any).save()

      const refundId = this.pawapay.generateId()
      await this.pawapay.initiateRefund(
        refundId,
        depositId,
        (transfer as any).amount,
        'MoMoRefund',
      )

      await sendTextMessage(
        (transfer as any).senderPhone,
        `❌ *Transfer failed*\n\nPayout to ${(transfer as any).recipientPhone} was rejected. A refund of ${(transfer as any).amount.toLocaleString()} XAF will be returned to your account.`,
      )
    }

    logger.info(
      `[KoboKall] Payout initiated for transfer ${(transfer as any).transferId}, status: ${result.status}`,
    )
  }

  async onDepositFailed(depositId: string, failureCode: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ depositId })
    if (!transfer) {
      return
    }
    if ((transfer as any).status !== 'PROCESSING') {
      return
    }

    ;(transfer as any).status = 'FAILED'
    ;(transfer as any).failureCode = failureCode
    await (transfer as any).save()

    await sendTextMessage(
      (transfer as any).senderPhone,
      `❌ *Transfer failed*\n\nCode: ${failureCode}\nPlease try again.`,
    )

    logger.info(
      `[KoboKall] Deposit failed for transfer ${(transfer as any).transferId}: ${failureCode}`,
    )
  }

  async onPayoutCompleted(payoutId: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ payoutId })
    if (!transfer) {
      return
    }
    if ((transfer as any).status !== 'DEPOSIT_CONFIRMED') {
      return
    }

    ;(transfer as any).status = 'COMPLETED'
    await (transfer as any).save()

    await sendTextMessage(
      (transfer as any).senderPhone,
      `✅ *Transfer confirmed!*\n\n${(transfer as any).netAmount.toLocaleString()} XAF sent to ${(transfer as any).recipientPhone}.\n\nThank you for using SendSasa!`,
    )

    await sendTextMessage(
      (transfer as any).recipientPhone,
      `💰 *You received ${(transfer as any).netAmount.toLocaleString()} XAF* from ****${String((transfer as any).senderPhone).slice(-4)} via SendSasa.`,
    )

    appEmitter.emit(EVENTS.RECEIPT_SEND, {
      phone: (transfer as any).senderPhone,
      data: {
        type: 'transfer',
        referenceId: (transfer as any).transferId,
        dateTime: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        amount: (transfer as any).amount,
        fee: (transfer as any).fee,
        netAmount: (transfer as any).netAmount,
        senderPhone: (transfer as any).senderPhone,
        recipientPhone: (transfer as any).recipientPhone,
        senderOperator: (transfer as any).senderOperator,
        recipientOperator: (transfer as any).recipientOperator,
      },
    })

    await this.users.setContext((transfer as any).senderPhone, null)

    logger.info(`[KoboKall] Transfer ${(transfer as any).transferId} completed`)
  }

  async onPayoutFailed(payoutId: string, failureCode: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ payoutId })
    if (!transfer) {
      return
    }
    if ((transfer as any).status !== 'DEPOSIT_CONFIRMED') {
      return
    }

    ;(transfer as any).status = 'FAILED'
    ;(transfer as any).failureCode = failureCode
    await (transfer as any).save()

    const refundId = this.pawapay.generateId()
    await this.pawapay.initiateRefund(
      refundId,
      (transfer as any).depositId,
      (transfer as any).amount,
      'MoMoRefund',
    )

    await sendTextMessage(
      (transfer as any).senderPhone,
      `❌ *Transfer failed*\n\nCode: ${failureCode}\nA refund of ${(transfer as any).amount.toLocaleString()} XAF will be returned to your account.`,
    )

    logger.info(
      `[KoboKall] Payout failed for transfer ${(transfer as any).transferId}: ${failureCode}`,
    )
  }

  async cancelTransfer(transferId: string, phone: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ transferId })
    if (!transfer || (transfer as any).senderPhone !== phone) {
      return
    }
    if ((transfer as any).status !== 'INITIATED') {
      return
    }

    ;(transfer as any).status = 'CANCELLED'
    await (transfer as any).save()

    await sendTextMessage(phone, `↩️ Transfer cancelled.`)
    logger.info(`[KoboKall] Transfer ${transferId} cancelled`)
  }

  async getTransferByDepositId(depositId: string) {
    return LocalTransfer.findOne({ depositId })
  }

  async getTransferByPayoutId(payoutId: string) {
    return LocalTransfer.findOne({ payoutId })
  }

  async executeTransfer(
    senderPhone: string,
    recipientPhone: string,
    amount: number,
  ): Promise<void> {
    const [senderOperator, recipientOperator] = await Promise.all([
      this.pawapay.predictCorrespondent(senderPhone),
      this.pawapay.predictCorrespondent(recipientPhone),
    ])

    const roundedAmount = Math.round(amount)
    const fee = calculateFee(roundedAmount)
    const netAmount = roundedAmount - fee
    const transferId = this.pawapay.generateId()
    const depositId = this.pawapay.generateId()

    await LocalTransfer.create({
      transferId,
      senderPhone,
      recipientPhone,
      amount: roundedAmount,
      fee,
      netAmount,
      senderOperator,
      recipientOperator,
      depositId,
      status: 'PROCESSING',
    })

    await this.users.setContext(senderPhone, { type: 'KOBOKALL', id: String(transferId) })

    await sendTextMessage(
      senderPhone,
      `⏳ *Transfer in progress...*\n\nAccept the USSD prompt on your phone.`,
    )

    const result = await this.pawapay.initiateDeposit(
      depositId,
      senderPhone,
      roundedAmount,
      'MoMoTransfer',
      transferId,
    )

    if (result.status === 'REJECTED') {
      await LocalTransfer.findOneAndUpdate(
        { transferId },
        { status: 'FAILED', failureCode: result.rejectionReason ?? 'REJECTED' },
      )
      await sendTextMessage(
        senderPhone,
        `❌ *Transfer rejected*\n\n${result.rejectionReason ?? ''}\nPlease try again.`,
      )
    }

    logger.info(
      `[KoboKall] Transfer ${transferId} executing: ${senderPhone} → ${recipientPhone}`,
    )
  }

  async handleMessage(
    phone: string,
    message: string,
    transferId: string,
  ): Promise<void> {
    if (message.trim().toLowerCase() === 'cancel') {
      await this.cancelTransfer(transferId, phone)
    }
  }

  // ─── Stellar Path (Europe / North America / Other) ─────────────────────────

  private async _initiateStellarTransfer(
    senderPhone: string,
    dto: CreateKoboKallDto,
    sender: { stellar_public_key?: string },
  ): Promise<void> {
    if (!sender.stellar_public_key) {
      await sendTextMessage(
        senderPhone,
        '⚠️ No Stellar wallet found. Please set up your wallet first.',
      )
      return
    }

    const amount = Math.round(dto.amount)
    const fee = calculateFee(amount)
    const netAmount = amount - fee
    const fallbackRate = await this.fxRate.getUSDtoXAF()
    const sep38Rate = await this.stellarAnchor.getXafPerUsdc(
      amount / fallbackRate,
    )
    const xafPerUsdc = sep38Rate ?? fallbackRate
    const usdcAmount = parseFloat((amount / xafPerUsdc).toFixed(7))
    const rateLabel = sep38Rate ? 'live · Stellar' : 'live'
    const transferId = this.pawapay.generateId()

    const transfer = await LocalTransfer.create({
      transferId,
      senderPhone,
      recipientPhone: dto.recipientPhone,
      amount,
      fee,
      netAmount,
      railType: 'stellar',
      status: 'STELLAR_PENDING_ONRAMP',
    })

    let interactiveUrl: string
    let sep24Id: string
    try {
      const result = await this.stellarAnchor.initiateCircleDeposit(
        sender.stellar_public_key,
        'USD',
        usdcAmount,
      )
      interactiveUrl = result.interactiveUrl
      sep24Id = result.sep24Id
    } catch (err: any) {
      logger.error(
        `[KoboKall] SEP-24 initiation failed for ${transferId}: ${err?.message}`,
      )
      ;(transfer as any).status = 'FAILED'
      await (transfer as any).save()
      await sendTextMessage(
        senderPhone,
        '❌ Payment initiation failed. Please try again.',
      )
      return
    }

    ;(transfer as any).sep24TransactionId = sep24Id
    await (transfer as any).save()

    await sendCtaUrlButton(
      senderPhone,
      `⏳ *Complete your payment*\n\n` +
        `You send: ${usdcAmount.toFixed(2)} USDC (~${amount.toLocaleString()} XAF)\n` +
        `Rate: 1 USDC = ${Math.round(xafPerUsdc).toLocaleString()} XAF (${rateLabel})\n` +
        `Recipient: ${dto.recipientPhone}\n` +
        `They receive: ~${netAmount.toLocaleString()} XAF\n\n` +
        `Complete payment and funds are sent automatically.`,
      'Pay Now',
      interactiveUrl,
    )

    logger.info(
      `[KoboKall] Stellar SEP-24 initiated for transfer ${transferId}: sep24Id=${sep24Id}`,
    )

    this._pollStellarSep24(String((transfer as any)._id), sep24Id, senderPhone)
  }

  private _pollStellarSep24(
    transferMongoId: string,
    sep24Id: string,
    senderPhone: string,
  ): void {
    let attempts = 0
    const MAX = 60

    const interval = setInterval(async () => {
      attempts++
      if (attempts > MAX) {
        clearInterval(interval)
        logger.error(`[KoboKall] SEP-24 poll timeout for ${sep24Id}`)
        return
      }

      try {
        const jwt = await this.stellarAnchor.getSep10Jwt(
          this.stellarAnchor.circleAnchorUrl,
        )
        const txStatus = await this.stellarAnchor.getSep24TransactionStatus(
          this.stellarAnchor.circleAnchorUrl,
          jwt,
          sep24Id,
        )

        if (txStatus.status === 'completed') {
          clearInterval(interval)
          await this._executeOnafriqOffRamp(transferMongoId, senderPhone)
        } else if (
          ['error', 'expired', 'refunded', 'no_market'].includes(
            txStatus.status,
          )
        ) {
          clearInterval(interval)
          await LocalTransfer.findByIdAndUpdate(transferMongoId, {
            status: 'FAILED',
            failureCode: txStatus.status,
          })
          await sendTextMessage(
            senderPhone,
            `❌ Payment ${txStatus.status}. Please try again.`,
          )
        }
      } catch (err: any) {
        logger.error(
          `[KoboKall] SEP-24 poll error for ${sep24Id}: ${err?.message}`,
        )
      }
    }, 30_000)
  }

  private async _executeOnafriqOffRamp(
    transferMongoId: string,
    senderPhone: string,
  ): Promise<void> {
    const transfer = await LocalTransfer.findById(transferMongoId)
    if (!transfer) return

    const offRampRate = await this.fxRate.getUSDtoXAF()
    const netUsdcAmount = parseFloat(
      ((transfer as any).netAmount / offRampRate).toFixed(7),
    )

    let offRamp: {
      sep31TransactionId: string
      onafriqStellarAccount: string
      stellarMemo: string
    }
    try {
      offRamp = await this.stellarAnchor.prepareOnafriqOffRamp({
        recipientPhone: (transfer as any).recipientPhone,
        recipientCountryCode: 'CM',
        usdcAmount: netUsdcAmount,
        localCurrencyCode: 'XAF',
      })
    } catch (err: any) {
      logger.error(`[KoboKall] Onafriq off-ramp prep failed: ${err?.message}`)
      ;(transfer as any).status = 'FAILED'
      await (transfer as any).save()
      await sendTextMessage(
        senderPhone,
        '❌ Transfer routing failed. Please contact support.',
      )
      return
    }

    ;(transfer as any).sep31TransactionId = offRamp.sep31TransactionId
    ;(transfer as any).status = 'STELLAR_ROUTING'
    await (transfer as any).save()

    try {
      await this.stellarService.pathPaymentStrictSend(
        offRamp.onafriqStellarAccount,
        netUsdcAmount,
        netUsdcAmount * 0.98,
        offRamp.stellarMemo,
      )
    } catch (err: any) {
      logger.error(`[KoboKall] pathPaymentStrictSend failed: ${err?.message}`)
      ;(transfer as any).status = 'FAILED'
      await (transfer as any).save()
      await sendTextMessage(
        senderPhone,
        '❌ Transfer submission failed. Please contact support.',
      )
      return
    }

    this._pollStellarSep31(
      transferMongoId,
      offRamp.sep31TransactionId,
      senderPhone,
    )
  }

  private _pollStellarSep31(
    transferMongoId: string,
    sep31Id: string,
    senderPhone: string,
  ): void {
    let attempts = 0
    const MAX = 120

    const interval = setInterval(async () => {
      attempts++
      if (attempts > MAX) {
        clearInterval(interval)
        logger.error(`[KoboKall] SEP-31 poll timeout for ${sep31Id}`)
        return
      }

      try {
        const status = await this.stellarAnchor.getSep31Status(sep31Id)

        if (status.status === 'completed') {
          clearInterval(interval)
          const transfer = await LocalTransfer.findById(transferMongoId)
          if (!transfer) return
          ;(transfer as any).status = 'COMPLETED'
          await (transfer as any).save()

          await sendTextMessage(
            senderPhone,
            `✅ *Transfer confirmed!*\n\n${(transfer as any).netAmount.toLocaleString()} XAF sent to ${(transfer as any).recipientPhone}.\n\nThank you for using SendSasa!`,
          )
          await sendTextMessage(
            (transfer as any).recipientPhone,
            `💰 *You received ${(transfer as any).netAmount.toLocaleString()} XAF* from ****${String(senderPhone).slice(-4)} via SendSasa.`,
          )
          logger.info(
            `[KoboKall] Stellar transfer ${(transfer as any).transferId} completed`,
          )
        } else if (['error', 'refunded'].includes(status.status)) {
          clearInterval(interval)
          await LocalTransfer.findByIdAndUpdate(transferMongoId, {
            status: 'FAILED',
            failureCode: status.status,
          })
          await sendTextMessage(
            senderPhone,
            `❌ Transfer failed (${status.status}). Please contact support.`,
          )
        }
      } catch (err: any) {
        logger.error(
          `[KoboKall] SEP-31 poll error for ${sep31Id}: ${err?.message}`,
        )
      }
    }, 30_000)
  }
}

export const kobokallService = new KoboKallService(
  new (require('../../blockchain/stellar/stellar.service').StellarService)(),
  new (require('../../blockchain/stellar/stellar-anchor.service').StellarAnchorService)(),
  new (require('../../shared/services/payment-rail.service').PaymentRailService)(),
  fxRateService,
  new (require('../../payments/pawapay/pawapay.service').PawapayService)(),
  new (require('../../domain/repositories/user.repository').UserRepository)(),
)
