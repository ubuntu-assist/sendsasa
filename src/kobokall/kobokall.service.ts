import { Injectable } from '@nestjs/common'
import { LocalTransfer } from './kobokall-remittance.schema'
import { pawapayService } from '../pawapay/pawapay.service'
import { calculateFee } from '../common/fee'
import { sendTextMessage, WhatsAppService } from '../whatsapp/whatsapp.service'
import { sendMoMoReceipt } from '../services/receipt-generator.service'
import { User } from '../models/User'
import type { CreateKoboKallDto } from '../types'
import logger from '../utils/logger'

const OPERATOR_LABELS: Record<string, string> = {
  MTN_MOMO_CMR: 'MTN MoMo',
  ORANGE_CMR: 'Orange Money',
}

function operatorLabel(code: string): string {
  return OPERATOR_LABELS[code] ?? code
}

@Injectable()
export class KoboKallService {
  async initiateTransfer(senderPhone: string, dto: CreateKoboKallDto): Promise<void> {
    const [senderOperator, recipientOperator] = await Promise.all([
      pawapayService.predictCorrespondent(senderPhone),
      pawapayService.predictCorrespondent(dto.recipientPhone),
    ])

    const amount = Math.round(dto.amount)
    const fee = calculateFee(amount)
    const netAmount = amount - fee
    const transferId = pawapayService.generateId()

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

    await User.findOneAndUpdate(
      { phoneNumber: senderPhone },
      { momotrustContext: `KOBOKALL:${transferId}`, momotrustContextUpdatedAt: new Date() },
    )

    await WhatsAppService.sendMessage({
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
            { type: 'reply', reply: { id: `kobokall_confirm:${transferId}`, title: '✅ Confirm' } },
            { type: 'reply', reply: { id: `kobokall_cancel:${transferId}`, title: '❌ Cancel' } },
          ],
        },
      },
    })

    logger.info(`[KoboKall] Transfer ${transferId} initiated: ${senderPhone} → ${dto.recipientPhone}`)
  }

  async confirmTransfer(transferId: string, phone: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ transferId })
    if (!transfer || (transfer as any).senderPhone !== phone) { return }
    if ((transfer as any).status !== 'INITIATED') { return }

    const depositId = pawapayService.generateId()
    ;(transfer as any).depositId = depositId
    ;(transfer as any).status = 'PROCESSING'
    await (transfer as any).save()

    await sendTextMessage(phone, `⏳ *Transfer in progress...*\n\nAccept the USSD prompt on your phone.`)

    const result = await pawapayService.initiateDeposit(
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
      await sendTextMessage(phone, `❌ *Transfer rejected*\n\n${result.rejectionReason ?? ''}\nPlease try again.`)
    }

    logger.info(`[KoboKall] Transfer ${transferId} deposit initiated, status: ${result.status}`)
  }

  async onDepositCompleted(depositId: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ depositId })
    if (!transfer) { return }
    if ((transfer as any).status !== 'PROCESSING') { return }

    ;(transfer as any).status = 'DEPOSIT_CONFIRMED'
    const payoutId = pawapayService.generateId()
    ;(transfer as any).payoutId = payoutId
    await (transfer as any).save()

    const result = await pawapayService.initiatePayout(
      payoutId,
      (transfer as any).recipientPhone,
      (transfer as any).netAmount,
      'MoMoTransfer',
      (transfer as any).transferId,
    )

    if (result.status === 'REJECTED') {
      ;(transfer as any).status = 'FAILED'
      ;(transfer as any).failureCode = result.rejectionReason ?? 'PAYOUT_REJECTED'
      await (transfer as any).save()

      const refundId = pawapayService.generateId()
      await pawapayService.initiateRefund(
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

    logger.info(`[KoboKall] Payout initiated for transfer ${(transfer as any).transferId}, status: ${result.status}`)
  }

  async onDepositFailed(depositId: string, failureCode: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ depositId })
    if (!transfer) { return }
    if ((transfer as any).status !== 'PROCESSING') { return }

    ;(transfer as any).status = 'FAILED'
    ;(transfer as any).failureCode = failureCode
    await (transfer as any).save()

    await sendTextMessage(
      (transfer as any).senderPhone,
      `❌ *Transfer failed*\n\nCode: ${failureCode}\nPlease try again.`,
    )

    logger.info(`[KoboKall] Deposit failed for transfer ${(transfer as any).transferId}: ${failureCode}`)
  }

  async onPayoutCompleted(payoutId: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ payoutId })
    if (!transfer) { return }
    if ((transfer as any).status !== 'DEPOSIT_CONFIRMED') { return }

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

    sendMoMoReceipt((transfer as any).senderPhone, {
      type: 'transfer',
      referenceId: (transfer as any).transferId,
      dateTime: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      amount: (transfer as any).amount,
      fee: (transfer as any).fee,
      netAmount: (transfer as any).netAmount,
      senderPhone: (transfer as any).senderPhone,
      recipientPhone: (transfer as any).recipientPhone,
      senderOperator: (transfer as any).senderOperator,
      recipientOperator: (transfer as any).recipientOperator,
    }).catch(() => {})

    logger.info(`[KoboKall] Transfer ${(transfer as any).transferId} completed`)
  }

  async onPayoutFailed(payoutId: string, failureCode: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ payoutId })
    if (!transfer) { return }
    if ((transfer as any).status !== 'DEPOSIT_CONFIRMED') { return }

    ;(transfer as any).status = 'FAILED'
    ;(transfer as any).failureCode = failureCode
    await (transfer as any).save()

    const refundId = pawapayService.generateId()
    await pawapayService.initiateRefund(
      refundId,
      (transfer as any).depositId,
      (transfer as any).amount,
      'MoMoRefund',
    )

    await sendTextMessage(
      (transfer as any).senderPhone,
      `❌ *Transfer failed*\n\nCode: ${failureCode}\nA refund of ${(transfer as any).amount.toLocaleString()} XAF will be returned to your account.`,
    )

    logger.info(`[KoboKall] Payout failed for transfer ${(transfer as any).transferId}: ${failureCode}`)
  }

  async cancelTransfer(transferId: string, phone: string): Promise<void> {
    const transfer = await LocalTransfer.findOne({ transferId })
    if (!transfer || (transfer as any).senderPhone !== phone) { return }
    if ((transfer as any).status !== 'INITIATED') { return }

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

  async executeTransfer(senderPhone: string, recipientPhone: string, amount: number): Promise<void> {
    const [senderOperator, recipientOperator] = await Promise.all([
      pawapayService.predictCorrespondent(senderPhone),
      pawapayService.predictCorrespondent(recipientPhone),
    ])

    const roundedAmount = Math.round(amount)
    const fee = calculateFee(roundedAmount)
    const netAmount = roundedAmount - fee
    const transferId = pawapayService.generateId()
    const depositId = pawapayService.generateId()

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

    await User.findOneAndUpdate(
      { phoneNumber: senderPhone },
      { momotrustContext: `KOBOKALL:${transferId}`, momotrustContextUpdatedAt: new Date() },
    )

    await sendTextMessage(senderPhone, `⏳ *Transfer in progress...*\n\nAccept the USSD prompt on your phone.`)

    const result = await pawapayService.initiateDeposit(
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
      await sendTextMessage(senderPhone, `❌ *Transfer rejected*\n\n${result.rejectionReason ?? ''}\nPlease try again.`)
    }

    logger.info(`[KoboKall] Transfer ${transferId} executing: ${senderPhone} → ${recipientPhone}`)
  }

  async handleMessage(phone: string, message: string, transferId: string): Promise<void> {
    if (message.trim().toLowerCase() === 'cancel') {
      await this.cancelTransfer(transferId, phone)
    }
  }
}

export const kobokallService = new KoboKallService()
