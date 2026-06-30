import { Injectable, OnModuleInit } from '@nestjs/common'
import { Deal } from './deal.schema'
import { Dispute } from './dispute.schema'
import { generateShortCode } from '@common/helpers/short-code'
import { calculateFee } from '@common/helpers/fee'
import { GeminiService } from '@shared/gemini.service'
import { sendTextMessage, sendCtaUrlButton } from '@messaging/whatsapp/whatsapp.service'
import { sendMoMoReceipt } from '@shared/receipt-generator.service'
import { User } from '@models/User'
import { SorobanTrustlockService } from '@blockchain/stellar/soroban-trustlock.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'
import { HorizonIndexerService } from '@blockchain/stellar/horizon-indexer.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'
import { PaymentRailService } from '@shared/payment-rail.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import type { CreateDealDto, FileDisputeDto } from '@app/types'
import logger from '@common/utils/logger'

@Injectable()
export class TrustLockService implements OnModuleInit {
  constructor(
    private readonly gemini: GeminiService,
    private readonly sorobanTrustlock: SorobanTrustlockService,
    private readonly stellarAnchor: StellarAnchorService,
    private readonly pawapayService: PawapayService,
    private readonly paymentRailService: PaymentRailService,
    private readonly fxRate: FxRateService,
    // Optional: not present when manually instantiated outside NestJS DI
    private readonly horizonIndexer?: HorizonIndexerService,
  ) {}

  onModuleInit() {
    if (!this.horizonIndexer) return
    // Listen for Soroban auto_release events so TrustLock state machine
    // advances even when the buyer never explicitly confirms delivery
    this.horizonIndexer.onContractEvent(async (event) => {
      const topic0 = String(event.topic?.[0] ?? '')
      if (topic0.includes('auto_release') || topic0.includes('released')) {
        await this._handleSorobanReleasedEvent(event.txHash)
      }
    })
  }

  // ─── Deal Creation ─────────────────────────────────────────────────────────

  async createDeal(
    buyerPhone: string,
    data: CreateDealDto,
  ): Promise<typeof Deal.prototype> {
    const amount = Math.round(Number(data.amount))
    const fee = calculateFee(amount)
    const amountToSeller = amount - fee
    const shortCode = generateShortCode()
    const expiresAt = new Date(Date.now() + 7 * 24 * 3600_000)

    const deal = await Deal.create({
      shortCode,
      buyerPhone,
      sellerPhone: data.sellerPhone,
      title: data.title,
      description: data.description,
      category: data.category,
      amount,
      fee,
      amountToSeller,
      expiresAt,
    })

    const dealId = String((deal as any)._id)
    const maskedSeller = `****${data.sellerPhone.slice(-4)}`

    await sendTextMessage(
      buyerPhone,
      `✅ *Deal created!*\n\n` +
        `📦 ${data.title}\n` +
        `💰 Amount: ${amount.toLocaleString()} XAF\n` +
        `💸 Fee: ${fee.toLocaleString()} XAF\n` +
        `👤 Seller: ${maskedSeller}\n` +
        `🔑 Code: *${shortCode}*\n\n` +
        `Type *PAY ${shortCode}* to secure the funds.`,
    )

    await this._sendDealButtons(buyerPhone, dealId, data.title, amount, shortCode)

    logger.info(`[TrustLock] Deal created: ${shortCode} (${buyerPhone} → ${data.sellerPhone})`)
    return deal
  }

  private async _sendDealButtons(
    phone: string,
    dealId: string,
    title: string,
    amount: number,
    shortCode: string,
  ) {
    const { WhatsAppService } = await import('@messaging/whatsapp/whatsapp.service')
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `*${title}* — ${amount.toLocaleString()} XAF\nCode: ${shortCode}`,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: { id: `trustlock_pay:${dealId}`, title: '💳 Pay now' },
            },
            {
              type: 'reply',
              reply: { id: `trustlock_cancel:${dealId}`, title: '❌ Cancel' },
            },
          ],
        },
      },
    })
  }

  // ─── Payment Initiation (Stellar / Circle SEP-24) ─────────────────────────

  async initiatePayment(dealId: string, buyerPhone: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || String((deal as any).buyerPhone) !== buyerPhone) return
    if ((deal as any).status !== 'PENDING_PAYMENT') {
      await sendTextMessage(buyerPhone, '⚠️ This deal can no longer be paid.')
      return
    }

    const buyer = await User.findOne({ phoneNumber: buyerPhone }).select(
      'stellar_public_key operatingRegion',
    )
    if (!buyer) return

    const shortCode = (deal as any).shortCode
    const rail = this.paymentRailService.getRail(buyer)

    if (rail === 'pawapay') {
      // Cameroon — MTN / Orange MoMo via pawaPay
      const depositId = this.pawapayService.generateId()
      ;(deal as any).pawapayDepositId = depositId
      ;(deal as any).status = 'PAYMENT_PROCESSING'
      await (deal as any).save()

      try {
        const result = await this.pawapayService.initiateDeposit(
          depositId,
          buyerPhone,
          (deal as any).amount,
          'TrustLock',
          String((deal as any)._id),
        )
        if (result.status === 'REJECTED') {
          ;(deal as any).status = 'PENDING_PAYMENT'
          ;(deal as any).pawapayDepositId = undefined
          await (deal as any).save()
          await sendTextMessage(
            buyerPhone,
            `❌ Payment rejected${result.rejectionReason ? `: ${result.rejectionReason}` : ''}.\nPlease try again. Code: *${shortCode}*`,
          )
          return
        }
      } catch (err: any) {
        logger.error(`[TrustLock] pawaPay deposit failed for ${shortCode}: ${err?.message}`)
        ;(deal as any).status = 'PENDING_PAYMENT'
        ;(deal as any).pawapayDepositId = undefined
        await (deal as any).save()
        await sendTextMessage(
          buyerPhone,
          `❌ Payment initiation failed. Please try again.\nCode: *${shortCode}*`,
        )
        return
      }

      await sendTextMessage(
        buyerPhone,
        `⏳ *Payment in progress...*\n\nAccept the USSD prompt on your phone.\nAmount: ${(deal as any).amount.toLocaleString()} XAF\nCode: *${shortCode}*`,
      )
      logger.info(`[TrustLock] pawaPay deposit initiated for deal ${shortCode}: depositId=${depositId}`)
      return
    }

    // Stellar / Circle SEP-24 path (Europe, North America, Other)
    if (!buyer.stellar_public_key) {
      await sendTextMessage(
        buyerPhone,
        '⚠️ No Stellar wallet found. Please set up your wallet first.',
      )
      return
    }

    const fallbackRate = await this.fxRate.getUSDtoXAF()
    const sep38Rate = await this.stellarAnchor.getXafPerUsdc((deal as any).amount / fallbackRate)
    const xafPerUsdc = sep38Rate ?? fallbackRate
    const usdcAmount = parseFloat(((deal as any).amount / xafPerUsdc).toFixed(7))
    const rateLabel = sep38Rate ? 'live · Stellar' : 'live'

    let interactiveUrl: string
    let sep24Id: string
    try {
      const result = await this.stellarAnchor.initiateCircleDeposit(
        buyer.stellar_public_key,
        'USD',
        usdcAmount,
      )
      interactiveUrl = result.interactiveUrl
      sep24Id = result.sep24Id
    } catch (err: any) {
      logger.error(
        `[TrustLock] SEP-24 initiation failed for ${shortCode}: ${err?.message}`,
      )
      await sendTextMessage(
        buyerPhone,
        `❌ Payment initiation failed. Please try again.\nCode: *${shortCode}*`,
      )
      return
    }

    ;(deal as any).sep24TransactionId = sep24Id
    ;(deal as any).status = 'PAYMENT_PROCESSING'
    await (deal as any).save()

    await sendCtaUrlButton(
      buyerPhone,
      `⏳ *Complete your USDC payment*\n\n` +
        `Amount: ${usdcAmount.toFixed(2)} USDC (~${(deal as any).amount.toLocaleString()} XAF)\n` +
        `Rate: 1 USDC = ${Math.round(xafPerUsdc).toLocaleString()} XAF (${rateLabel})\n` +
        `Code: *${shortCode}*\n\n` +
        `Funds are automatically locked in escrow once confirmed.`,
      'Pay Now',
      interactiveUrl,
    )

    logger.info(
      `[TrustLock] SEP-24 deposit initiated for deal ${shortCode}: sep24Id=${sep24Id}`,
    )

    // Poll Circle anchor every 30s until deposit completes or times out
    this._pollSep24Completion(dealId, sep24Id, buyer.stellar_public_key)
  }

  private _pollSep24Completion(
    dealId: string,
    sep24Id: string,
    buyerPublicKey: string,
  ): void {
    let attempts = 0
    const MAX_ATTEMPTS = 60 // 60 × 30s = 30 minutes

    const interval = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval)
        logger.error(`[TrustLock] SEP-24 poll timeout for sep24Id=${sep24Id}`)
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

        if (txStatus.status === 'completed' && txStatus.stellar_transaction_id) {
          clearInterval(interval)
          await this.onStellarDepositConfirmed(
            dealId,
            buyerPublicKey,
            txStatus.stellar_transaction_id,
          )
        } else if (
          ['error', 'expired', 'refunded', 'no_market'].includes(txStatus.status)
        ) {
          clearInterval(interval)
          await this.onStellarDepositFailed(dealId, txStatus.status)
        }
      } catch (err: any) {
        logger.error(
          `[TrustLock] SEP-24 poll error for ${sep24Id}: ${err?.message}`,
        )
      }
    }, 30_000)
  }

  async onStellarDepositConfirmed(
    dealId: string,
    buyerPublicKey: string,
    stellarTxHash: string,
  ): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || (deal as any).status !== 'PAYMENT_PROCESSING') return

    const seller = await User.findOne({
      phoneNumber: (deal as any).sellerPhone,
    }).select('stellar_public_key')
    const sellerPublicKey = seller?.stellar_public_key ?? ''

    const xafToUsdcRate = await this.fxRate.getUSDtoXAF()
    const usdcAmount = parseFloat(((deal as any).amount / xafToUsdcRate).toFixed(7))
    const shortCode = (deal as any).shortCode

    ;(deal as any).stellarDepositTxHash = stellarTxHash

    let lockTxHash: string | undefined
    try {
      lockTxHash = await this.sorobanTrustlock.lock(
        buyerPublicKey,
        sellerPublicKey,
        usdcAmount,
      )
      ;(deal as any).stellarLockTxHash = lockTxHash
    } catch (err: any) {
      logger.error(
        `[TrustLock] Soroban lock failed for deal ${shortCode}: ${err?.message}`,
      )
      ;(deal as any).status = 'MANUAL_REVIEW'
      await (deal as any).save()
      await sendTextMessage(
        (deal as any).buyerPhone,
        `⚠️ Payment received but escrow lock failed. Our team will secure your funds.\nCode: *${shortCode}*`,
      )
      return
    }

    ;(deal as any).status = 'ACTIVE'
    await (deal as any).save()

    await sendTextMessage(
      (deal as any).buyerPhone,
      `🔒 *Funds secured in escrow!*\n\n${(deal as any).amount.toLocaleString()} XAF locked on Stellar.\nCode: *${shortCode}*`,
    )
    await this._sendDeliveryButtons(
      (deal as any).buyerPhone,
      dealId,
      (deal as any).title,
      shortCode,
    )
    await sendTextMessage(
      (deal as any).sellerPhone,
      `🔔 *New TrustLock deal!*\n\n${(deal as any).amount.toLocaleString()} XAF secured for: ${(deal as any).title}\n` +
        `Code: *${shortCode}*\n\nDeliver to receive your payment.`,
    )

    logger.info(
      `[TrustLock] Soroban lock confirmed for deal ${shortCode} (lock tx: ${lockTxHash})`,
    )
  }

  async onStellarDepositFailed(dealId: string, reason: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || (deal as any).status !== 'PAYMENT_PROCESSING') return
    ;(deal as any).status = 'CANCELLED'
    await (deal as any).save()
    await sendTextMessage(
      (deal as any).buyerPhone,
      `❌ SEP-24 payment ${reason}. Deal *${(deal as any).shortCode}* cancelled.`,
    )
    logger.info(
      `[TrustLock] SEP-24 deposit failed (${reason}) for deal ${(deal as any).shortCode}`,
    )
  }

  // ─── Lisk TrustLock (EVM smart contract — incubation demo showpiece) ────────

  /**
   * Lock USDC equivalent in the TrustLock.sol contract on Lisk.
   * Called after the buyer's MoMo payment succeeds (pawaPay deposit confirmed).
   * The platform admin wallet converts XAF → USDC and calls contract.lock().
   */
  async lockOnLisk(dealId: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || (deal as any).status !== 'PAYMENT_PROCESSING') return

    const shortCode = (deal as any).shortCode
    const lockRate = await this.fxRate.getUSDtoXAF()
    const usdcAmount = ((deal as any).amount / lockRate).toFixed(6)
    const expiresAt = (deal as any).expiresAt as Date

    const seller = await User.findOne({ phoneNumber: (deal as any).sellerPhone }).select('lisk_address evm_address')
    const sellerLiskAddress = seller?.lisk_address ?? seller?.evm_address
    if (!sellerLiskAddress) {
      logger.info(`[TrustLock] Seller has no Lisk address for deal ${shortCode} — skipping Lisk lock`)
      return
    }

    try {
      const { LiskTrustlockService } = await import('@blockchain/lisk/lisk-trustlock.service')
      const liskTrustlock = new LiskTrustlockService()
      const lockTxHash = await liskTrustlock.lockDeal(shortCode, sellerLiskAddress, usdcAmount, expiresAt)
      ;(deal as any).liskLockTxHash = lockTxHash
      ;(deal as any).status = 'ACTIVE'
      await (deal as any).save()

      const blockscoutUrl = `https://blockscout.lisk.com/tx/${lockTxHash}`
      await sendTextMessage(
        (deal as any).buyerPhone,
        `🔒 *Funds secured on Lisk!*\n\n${(deal as any).amount.toLocaleString()} XAF (~${usdcAmount} USDC) locked in smart contract.\nCode: *${shortCode}*\n\n🔗 ${blockscoutUrl}`,
      )
      await this._sendDeliveryButtons((deal as any).buyerPhone, dealId, (deal as any).title, shortCode)
      await sendTextMessage(
        (deal as any).sellerPhone,
        `🔔 *New TrustLock deal!*\n\nFunds secured on Lisk for: ${(deal as any).title}\nCode: *${shortCode}*\n\nDeliver to receive your payment.`,
      )
      logger.info(`[TrustLock] Lisk lock confirmed for deal ${shortCode}: ${lockTxHash}`)
    } catch (err: any) {
      logger.error(`[TrustLock] Lisk lock failed for deal ${shortCode}: ${err?.message}`)
      ;(deal as any).status = 'MANUAL_REVIEW'
      await (deal as any).save()
      await sendTextMessage(
        (deal as any).buyerPhone,
        `⚠️ Payment received but on-chain escrow failed. Our team will secure your funds.\nCode: *${shortCode}*`,
      )
    }
  }

  // ─── Legacy pawaPay deposit handlers (in-flight deals) ────────────────────

  async onDepositCompleted(pawapayDepositId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayDepositId })
    if (!deal || (deal as any).status !== 'PAYMENT_PROCESSING') return
    ;(deal as any).status = 'ACTIVE'
    await (deal as any).save()

    const shortCode = (deal as any).shortCode
    const amount = (deal as any).amount

    await sendTextMessage(
      (deal as any).buyerPhone,
      `🔒 *Funds secured!*\n\n${amount.toLocaleString()} XAF secured. The seller has been notified.\nCode: *${shortCode}*`,
    )
    await this._sendDeliveryButtons(
      (deal as any).buyerPhone,
      String((deal as any)._id),
      (deal as any).title,
      shortCode,
    )
    await sendTextMessage(
      (deal as any).sellerPhone,
      `🔔 *New MoMo Trust deal!*\n\n${amount.toLocaleString()} XAF secured for: ${(deal as any).title}\nCode: *${shortCode}*\n\nDeliver to receive your payment.`,
    )
    logger.info(`[TrustLock] Deposit completed for deal ${shortCode}`)
  }

  async onDepositFailed(pawapayDepositId: string, code: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayDepositId })
    if (!deal || (deal as any).status !== 'PAYMENT_PROCESSING') return
    ;(deal as any).status = 'CANCELLED'
    await (deal as any).save()
    await sendTextMessage(
      (deal as any).buyerPhone,
      `❌ Payment failed${code ? ` (${code})` : ''}.\n\nDeal *${(deal as any).shortCode}* has been cancelled. No amount charged.`,
    )
    logger.info(
      `[TrustLock] Deposit failed for deal ${(deal as any).shortCode}: ${code}`,
    )
  }

  // ─── Delivery Confirmation (Soroban release) ──────────────────────────────

  private async _sendDeliveryButtons(
    phone: string,
    dealId: string,
    title: string,
    shortCode: string,
  ) {
    const { WhatsAppService } = await import('@messaging/whatsapp/whatsapp.service')
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text: `📦 *Have you received your order?*\n${title} · Code: ${shortCode}`,
        },
        action: {
          buttons: [
            {
              type: 'reply',
              reply: {
                id: `trustlock_confirm:${dealId}`,
                title: '✅ Confirm delivery',
              },
            },
            {
              type: 'reply',
              reply: {
                id: `trustlock_dispute:${dealId}`,
                title: '⚠️ Report issue',
              },
            },
          ],
        },
      },
    })
  }

  async confirmDelivery(dealId: string, buyerPhone: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || String((deal as any).buyerPhone) !== buyerPhone) return
    if ((deal as any).status !== 'ACTIVE') {
      await sendTextMessage(
        buyerPhone,
        '⚠️ This deal cannot be confirmed at this time.',
      )
      return
    }

    const buyer = await User.findOne({ phoneNumber: buyerPhone }).select(
      'stellar_public_key lisk_address evm_address',
    )

    // Lisk path: release via TrustLock.sol on Lisk
    if ((deal as any).liskLockTxHash) {
      ;(deal as any).status = 'RELEASING'
      await (deal as any).save()
      await sendTextMessage(buyerPhone, `✅ Delivery confirmed! Releasing USDC to seller on Lisk...`)
      try {
        const { LiskTrustlockService } = await import('@blockchain/lisk/lisk-trustlock.service')
        const liskTrustlock = new LiskTrustlockService()
        const releaseTxHash = await liskTrustlock.releaseDeal((deal as any).shortCode, buyerPhone)
        ;(deal as any).liskReleaseTxHash = releaseTxHash
        ;(deal as any).status = 'COMPLETED'
        ;(deal as any).completedAt = new Date()
        await (deal as any).save()
        const blockscoutUrl = `https://blockscout.lisk.com/tx/${releaseTxHash}`
        await sendTextMessage(buyerPhone, `🎉 Deal complete! Funds released on Lisk.\n🔗 ${blockscoutUrl}`)
        await this._onDealCompleted(deal as any)
      } catch (err: any) {
        logger.error(`[TrustLock] Lisk release failed for deal ${(deal as any).shortCode}: ${err?.message}`)
        ;(deal as any).status = 'ACTIVE'
        await (deal as any).save()
        await sendTextMessage(buyerPhone, `❌ Release failed. Please try again or contact support.`)
      }
      return
    }

    // Stellar path: release via Soroban contract
    if (buyer?.stellar_public_key && (deal as any).stellarLockTxHash) {
      ;(deal as any).status = 'RELEASING'
      await (deal as any).save()
      await sendTextMessage(
        buyerPhone,
        `✅ Delivery confirmed! Releasing USDC to seller on Stellar...`,
      )

      try {
        const releaseTxHash = await this.sorobanTrustlock.release(
          buyer.stellar_public_key,
        )
        ;(deal as any).stellarReleaseTxHash = releaseTxHash
        ;(deal as any).status = 'COMPLETED'
        ;(deal as any).completedAt = new Date()
        await (deal as any).save()
        await this._onDealCompleted(deal as any)
      } catch (err: any) {
        logger.error(
          `[TrustLock] Soroban release failed for deal ${(deal as any).shortCode}: ${err?.message}`,
        )
        ;(deal as any).status = 'ACTIVE'
        await (deal as any).save()
        await sendTextMessage(
          buyerPhone,
          `❌ Release failed. Please try again or contact support.`,
        )
      }
      return
    }

    // Fallback: pawaPay payout for legacy deals without Stellar lock
    const { pawapayService } = await import('@payments/pawapay/pawapay.service')
    const payoutId = pawapayService.generateId()
    ;(deal as any).pawapayPayoutId = payoutId
    ;(deal as any).status = 'RELEASING'
    await (deal as any).save()
    await sendTextMessage(buyerPhone, `✅ Delivery confirmed! Sending payment to seller...`)

    const result = await pawapayService.initiatePayout(
      payoutId,
      (deal as any).sellerPhone,
      (deal as any).amountToSeller,
      `MoMo Trust ${(deal as any).shortCode}`.slice(0, 22),
      dealId,
    )
    if (result.status === 'REJECTED') {
      ;(deal as any).status = 'ACTIVE'
      ;(deal as any).pawapayPayoutId = undefined
      await (deal as any).save()
      await sendTextMessage(
        buyerPhone,
        `❌ Seller payment rejected. ${result.rejectionReason ?? ''}\nPlease contact support.`,
      )
    }
  }

  private async _onDealCompleted(deal: any): Promise<void> {
    const amount = deal.amountToSeller
    await sendTextMessage(deal.buyerPhone, '🎉 Deal complete! Payment released to seller.')
    await sendTextMessage(
      deal.sellerPhone,
      `💸 ${amount.toLocaleString()} XAF received!\nDeal: *${deal.shortCode}*`,
    )

    sendMoMoReceipt(deal.buyerPhone, {
      type: 'escrow',
      referenceId: deal.shortCode,
      dateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      amount: deal.amount,
      fee: deal.fee,
      netAmount: deal.amountToSeller,
      recipientPhone: deal.sellerPhone,
      title: deal.title,
      category: deal.category,
    }).catch(() => {})

    await User.findOneAndUpdate(
      { phoneNumber: deal.buyerPhone },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )
    logger.info(`[TrustLock] Deal completed: ${deal.shortCode}`)
  }

  // Legacy pawaPay payout handler
  async onPayoutCompleted(pawapayPayoutId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayPayoutId })
    if (!deal || (deal as any).status !== 'RELEASING') return
    ;(deal as any).status = 'COMPLETED'
    ;(deal as any).completedAt = new Date()
    await (deal as any).save()
    await this._onDealCompleted(deal as any)
  }

  // ─── Dispute & AI Adjudication ────────────────────────────────────────────

  async openDisputeFromFlow(
    shortCode: string,
    phone: string,
    reason: string,
    description: string,
    media: unknown,
  ): Promise<void> {
    const deal = await Deal.findOne({ shortCode })
    if (!deal) throw new Error(`Deal not found: ${shortCode}`)
    const dealId = String((deal as any)._id)

    const dispute = await this.fileDispute(dealId, phone, { reason, description })
    const disputeId = String((dispute as any)._id)

    const rawUrls: string[] = []
    if (Array.isArray(media)) {
      for (const item of media as Array<{ cdn_url?: string; id?: string }>) {
        const url = item?.cdn_url ?? item?.id
        if (url) rawUrls.push(url)
      }
    } else if (media && typeof media === 'object') {
      const m = media as { cdn_url?: string; id?: string }
      const url = m.cdn_url ?? m.id
      if (url) rawUrls.push(url)
    }

    if (rawUrls.length > 0) {
      const { uploadFromUrl } = await import('@shared/cloudinary.service')
      const persistedUrls = await Promise.all(
        rawUrls.map((url) => uploadFromUrl(url)),
      )

      const reloaded = await Dispute.findById(disputeId)
      if (reloaded) {
        ;(reloaded as any).evidenceUrls.push(...persistedUrls)
        await (reloaded as any).save()
      }
      await this.adjudicateDispute(disputeId)
    }
  }

  async fileDispute(
    dealId: string,
    phone: string,
    data: FileDisputeDto,
  ): Promise<typeof Dispute.prototype> {
    const deal = await Deal.findById(dealId)
    if (
      !deal ||
      (String((deal as any).buyerPhone) !== phone &&
        String((deal as any).sellerPhone) !== phone)
    ) {
      throw new Error('Deal not found or unauthorized')
    }

    ;(deal as any).status = 'DISPUTED'
    await (deal as any).save()

    const dispute = await Dispute.create({
      dealId,
      filedByPhone: phone,
      reason: data.reason,
      description: data.description,
      evidenceUrls: [],
    })

    const disputeId = String((dispute as any)._id)
    await User.findOneAndUpdate(
      { phoneNumber: phone },
      {
        momotrustContext: `DISPUTE:${disputeId}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    await sendTextMessage(
      phone,
      `⚠️ Dispute opened. Send photos as evidence.\n\nDeal code: *${(deal as any).shortCode}*`,
    )
    logger.info(`[TrustLock] Dispute filed for deal ${(deal as any).shortCode}`)
    return dispute
  }

  async receiveEvidence(
    disputeId: string,
    phone: string,
    mediaIdOrText: string,
  ): Promise<void> {
    const dispute = await Dispute.findById(disputeId)
    if (!dispute) return

    if (mediaIdOrText && mediaIdOrText.length > 0) {
      ;(dispute as any).evidenceUrls.push(mediaIdOrText)
      await (dispute as any).save()
      await sendTextMessage(
        phone,
        `📎 Evidence received (${(dispute as any).evidenceUrls.length}). Type *VERDICT* when done.`,
      )
    }

    if (
      mediaIdOrText.toLowerCase() === 'verdict' ||
      (dispute as any).evidenceUrls.length >= 3
    ) {
      await this.adjudicateDispute(disputeId)
    }
  }

  async adjudicateDispute(disputeId: string): Promise<void> {
    const dispute = await Dispute.findById(disputeId)
    if (!dispute) return

    const deal = await Deal.findById((dispute as any).dealId)
    if (!deal) return

    const verdict = await this.gemini.adjudicateDispute({
      dealTitle: (deal as any).title,
      dealAmount: (deal as any).amount,
      buyerReason:
        (dispute as any).reason + ' ' + ((dispute as any).description ?? ''),
      evidenceUrls: (dispute as any).evidenceUrls,
    })

    ;(dispute as any).aiVerdict = verdict.verdict
    ;(dispute as any).aiReasoning = verdict.reasoning
    ;(dispute as any).aiConfidence = verdict.confidence
    await (dispute as any).save()

    const pct = Math.round(verdict.confidence * 100)

    if (verdict.verdict === 'REFUND' && verdict.confidence >= 0.75) {
      await sendTextMessage(
        (deal as any).buyerPhone,
        `🤖 Refund recommended (${pct}%). ${verdict.reasoning}`,
      )
      await this.refundBuyer(String((deal as any)._id))
    } else if (verdict.verdict === 'RELEASE' && verdict.confidence >= 0.75) {
      await sendTextMessage(
        (deal as any).buyerPhone,
        `🤖 Release of funds recommended (${pct}%). ${verdict.reasoning}`,
      )
      await this.confirmDelivery(
        String((deal as any)._id),
        (deal as any).buyerPhone,
      )
    } else {
      ;(deal as any).status = 'MANUAL_REVIEW'
      await (deal as any).save()
      await sendTextMessage(
        (deal as any).buyerPhone,
        `🤖 Manual review required. Our team will contact you within 24h.`,
      )
      await sendTextMessage(
        (deal as any).sellerPhone,
        `🤖 Manual review required for deal *${(deal as any).shortCode}*. Our team will contact you within 24h.`,
      )
    }

    logger.info(
      `[TrustLock] AI verdict for dispute ${disputeId}: ${verdict.verdict} (${pct}%)`,
    )
  }

  // ─── Refund (Soroban refund) ───────────────────────────────────────────────

  async refundBuyer(dealId: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal) return

    const buyer = await User.findOne({
      phoneNumber: (deal as any).buyerPhone,
    }).select('stellar_public_key lisk_address evm_address')

    // Lisk path: refund via TrustLock.sol adminRefund (admin calls this)
    if ((deal as any).liskLockTxHash) {
      ;(deal as any).status = 'REFUNDING'
      await (deal as any).save()
      try {
        const { LiskTrustlockService } = await import('@blockchain/lisk/lisk-trustlock.service')
        const liskTrustlock = new LiskTrustlockService()
        const refundTxHash = await liskTrustlock.adminRefund((deal as any).shortCode)
        ;(deal as any).liskRefundTxHash = refundTxHash
        ;(deal as any).status = 'REFUNDED'
        await (deal as any).save()
        await this._onDealRefunded(deal as any)
      } catch (err: any) {
        logger.error(`[TrustLock] Lisk refund failed for deal ${(deal as any).shortCode}: ${err?.message}`)
        ;(deal as any).status = 'MANUAL_REVIEW'
        await (deal as any).save()
        await sendTextMessage(
          (deal as any).buyerPhone,
          `⚠️ Automated refund failed. Our team will process your refund manually within 24h.\nCode: *${(deal as any).shortCode}*`,
        )
      }
      return
    }

    // Stellar path: refund via Soroban contract
    if (buyer?.stellar_public_key && (deal as any).stellarLockTxHash) {
      ;(deal as any).status = 'REFUNDING'
      await (deal as any).save()

      try {
        const refundTxHash = await this.sorobanTrustlock.refund(
          buyer.stellar_public_key,
        )
        ;(deal as any).stellarRefundTxHash = refundTxHash
        ;(deal as any).status = 'REFUNDED'
        await (deal as any).save()
        await this._onDealRefunded(deal as any)
      } catch (err: any) {
        logger.error(
          `[TrustLock] Soroban refund failed for deal ${(deal as any).shortCode}: ${err?.message}`,
        )
        ;(deal as any).status = 'MANUAL_REVIEW'
        await (deal as any).save()
        await sendTextMessage(
          (deal as any).buyerPhone,
          `⚠️ Automated refund failed. Our team will process your refund manually within 24h.\nCode: *${(deal as any).shortCode}*`,
        )
      }
      return
    }

    // Fallback: pawaPay refund for legacy deals without Stellar lock
    if (!(deal as any).pawapayDepositId) {
      logger.error(
        `[TrustLock] Cannot refund deal ${(deal as any).shortCode}: no depositId`,
      )
      return
    }
    const { pawapayService } = await import('@payments/pawapay/pawapay.service')
    const refundId = pawapayService.generateId()
    ;(deal as any).pawapayRefundId = refundId
    ;(deal as any).status = 'REFUNDING'
    await (deal as any).save()
    await pawapayService.initiateRefund(
      refundId,
      (deal as any).pawapayDepositId,
      (deal as any).amount,
      `Refund ${(deal as any).shortCode}`.slice(0, 22),
    )
    logger.info(`[TrustLock] Refund initiated for deal ${(deal as any).shortCode}`)
  }

  private async _onDealRefunded(deal: any): Promise<void> {
    await sendTextMessage(
      deal.buyerPhone,
      `↩️ *Refund processed!*\n\n${deal.amount.toLocaleString()} XAF (USDC) refunded on Stellar.\nDeal: *${deal.shortCode}*`,
    )
    sendMoMoReceipt(deal.buyerPhone, {
      type: 'refund',
      referenceId: deal.shortCode,
      dateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      amount: deal.amount,
      title: deal.title,
    }).catch(() => {})
    await User.findOneAndUpdate(
      { phoneNumber: deal.buyerPhone },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )
    logger.info(`[TrustLock] Refund completed for deal ${deal.shortCode}`)
  }

  // Legacy pawaPay refund handler
  async onRefundCompleted(pawapayRefundId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayRefundId })
    if (!deal || (deal as any).status !== 'REFUNDING') return
    ;(deal as any).status = 'REFUNDED'
    await (deal as any).save()
    await this._onDealRefunded(deal as any)
  }

  // ─── Soroban auto_release event handler ───────────────────────────────────

  private async _handleSorobanReleasedEvent(txHash: string): Promise<void> {
    // Match deals currently in RELEASING state (auto_release fires after 72h)
    const deal = await Deal.findOne({
      status: 'RELEASING',
      stellarReleaseTxHash: { $exists: false },
    })
    if (!deal) return
    ;(deal as any).stellarReleaseTxHash = txHash
    ;(deal as any).status = 'COMPLETED'
    ;(deal as any).completedAt = new Date()
    await (deal as any).save()
    await this._onDealCompleted(deal as any)
  }

  // ─── Message handler ──────────────────────────────────────────────────────

  async handleMessage(
    phone: string,
    message: string,
    contextId: string,
  ): Promise<void> {
    const text = message.trim().toLowerCase()
    const deal = await Deal.findById(contextId).catch(() => null)
    if (!deal) return

    if (text === 'verdict' && String((deal as any).status) === 'DISPUTED') {
      const dispute = await Dispute.findOne({
        dealId: contextId,
        filedByPhone: phone,
      })
      if (dispute) await this.adjudicateDispute(String((dispute as any)._id))
    }
  }

  // ─── Lookups ──────────────────────────────────────────────────────────────

  async getDealByDepositId(id: string): Promise<typeof Deal.prototype | null> {
    return Deal.findOne({ pawapayDepositId: id })
  }

  async getDealByPayoutId(id: string): Promise<typeof Deal.prototype | null> {
    return Deal.findOne({ pawapayPayoutId: id })
  }

  async getDealByRefundId(id: string): Promise<typeof Deal.prototype | null> {
    return Deal.findOne({ pawapayRefundId: id })
  }
}

export const trustlockService = new TrustLockService(
  new (require('../../shared/services/gemini.service').GeminiService)(),
  new (require('../../blockchain/stellar/soroban-trustlock.service').SorobanTrustlockService)(),
  new (require('../../blockchain/stellar/stellar-anchor.service').StellarAnchorService)(),
  new (require('../../payments/pawapay/pawapay.service').PawapayService)(),
  new (require('../../shared/services/payment-rail.service').PaymentRailService)(),
  fxRateService,
  // HorizonIndexerService omitted — onModuleInit not called outside NestJS DI
)
