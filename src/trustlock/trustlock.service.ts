import { Injectable } from '@nestjs/common'
import { Deal } from './deal.schema'
import { Dispute } from './dispute.schema'
import { generateShortCode } from '../common/short-code'
import { calculateFee } from '../common/fee'
import { pawapayService } from '../pawapay/pawapay.service'
import { GeminiService } from '../services/gemini.service'
import { sendTextMessage } from '../whatsapp/whatsapp.service'
import { sendMoMoReceipt } from '../services/receipt-generator.service'
import { User } from '../models/User'
import type { CreateDealDto, FileDisputeDto } from '../types'
import logger from '../utils/logger'

@Injectable()
export class TrustLockService {
  constructor(private readonly gemini: GeminiService) {}

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
    const { WhatsAppService } = await import('../whatsapp/whatsapp.service')
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

  async initiatePayment(dealId: string, buyerPhone: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || String((deal as any).buyerPhone) !== buyerPhone) return
    if ((deal as any).status !== 'PENDING_PAYMENT') {
      await sendTextMessage(buyerPhone, '⚠️ This deal can no longer be paid.')
      return
    }

    const depositId = pawapayService.generateId()
    ;(deal as any).pawapayDepositId = depositId
    ;(deal as any).status = 'PAYMENT_PROCESSING'
    await (deal as any).save()

    await sendTextMessage(
      buyerPhone,
      `⏳ *Payment in progress...*\n\nAccept the USSD request on your phone.\nCode: *${(deal as any).shortCode}*`,
    )

    const result = await pawapayService.initiateDeposit(
      depositId,
      buyerPhone,
      (deal as any).amount,
      `MoMo Trust ${(deal as any).shortCode}`.slice(0, 22),
      dealId,
    )

    if (result.status === 'REJECTED') {
      ;(deal as any).status = 'PENDING_PAYMENT'
      ;(deal as any).pawapayDepositId = undefined
      await (deal as any).save()
      await sendTextMessage(
        buyerPhone,
        `❌ Payment rejected. ${result.rejectionReason ?? 'Please try again.'}\n\nCode: *${(deal as any).shortCode}*`,
      )
    }
  }

  async onDepositCompleted(pawapayDepositId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayDepositId })
    if (!deal) return
    if ((deal as any).status !== 'PAYMENT_PROCESSING') return
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

  private async _sendDeliveryButtons(
    phone: string,
    dealId: string,
    title: string,
    shortCode: string,
  ) {
    const { WhatsAppService } = await import('../whatsapp/whatsapp.service')
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
              reply: { id: `trustlock_confirm:${dealId}`, title: '✅ Confirm delivery' },
            },
            {
              type: 'reply',
              reply: { id: `trustlock_dispute:${dealId}`, title: '⚠️ Report issue' },
            },
          ],
        },
      },
    })
  }

  async onDepositFailed(pawapayDepositId: string, code: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayDepositId })
    if (!deal) return
    if ((deal as any).status !== 'PAYMENT_PROCESSING') return
    ;(deal as any).status = 'CANCELLED'
    await (deal as any).save()

    await sendTextMessage(
      (deal as any).buyerPhone,
      `❌ Payment failed${code ? ` (${code})` : ''}.\n\nDeal *${(deal as any).shortCode}* has been cancelled. No amount charged.`,
    )

    logger.info(`[TrustLock] Deposit failed for deal ${(deal as any).shortCode}: ${code}`)
  }

  async confirmDelivery(dealId: string, buyerPhone: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal || String((deal as any).buyerPhone) !== buyerPhone) return
    if ((deal as any).status !== 'ACTIVE') {
      await sendTextMessage(buyerPhone, '⚠️ This deal cannot be confirmed at this time.')
      return
    }

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

  async onPayoutCompleted(pawapayPayoutId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayPayoutId })
    if (!deal) return
    if ((deal as any).status !== 'RELEASING') return
    ;(deal as any).status = 'COMPLETED'
    ;(deal as any).completedAt = new Date()
    await (deal as any).save()

    const amount = (deal as any).amountToSeller

    await sendTextMessage((deal as any).buyerPhone, '🎉 Deal complete! Payment released to seller.')
    await sendTextMessage(
      (deal as any).sellerPhone,
      `💸 ${amount.toLocaleString()} XAF received in your account!\nDeal: *${(deal as any).shortCode}*`,
    )

    sendMoMoReceipt((deal as any).buyerPhone, {
      type: 'escrow',
      referenceId: (deal as any).shortCode,
      dateTime: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      amount: (deal as any).amount,
      fee: (deal as any).fee,
      netAmount: (deal as any).amountToSeller,
      recipientPhone: (deal as any).sellerPhone,
      title: (deal as any).title,
      category: (deal as any).category,
    }).catch(() => {})

    logger.info(`[TrustLock] Deal completed: ${(deal as any).shortCode}`)
  }

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
      const { uploadFromUrl } = await import('../services/cloudinary.service')
      const persistedUrls = await Promise.all(rawUrls.map(url => uploadFromUrl(url)))

      const dispute = await Dispute.findById(disputeId)
      if (dispute) {
        ;(dispute as any).evidenceUrls.push(...persistedUrls)
        await (dispute as any).save()
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
      { momotrustContext: `DISPUTE:${disputeId}`, momotrustContextUpdatedAt: new Date() },
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
      buyerReason: (dispute as any).reason + ' ' + ((dispute as any).description ?? ''),
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
      await this.confirmDelivery(String((deal as any)._id), (deal as any).buyerPhone)
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

    logger.info(`[TrustLock] AI verdict for dispute ${disputeId}: ${verdict.verdict} (${pct}%)`)
  }

  async refundBuyer(dealId: string): Promise<void> {
    const deal = await Deal.findById(dealId)
    if (!deal) return

    const refundId = pawapayService.generateId()
    ;(deal as any).pawapayRefundId = refundId
    ;(deal as any).status = 'REFUNDING'
    await (deal as any).save()

    if (!(deal as any).pawapayDepositId) {
      logger.error(`[TrustLock] Cannot refund deal ${(deal as any).shortCode}: no depositId`)
      return
    }

    await pawapayService.initiateRefund(
      refundId,
      (deal as any).pawapayDepositId,
      (deal as any).amount,
      `Refund ${(deal as any).shortCode}`.slice(0, 22),
    )

    logger.info(`[TrustLock] Refund initiated for deal ${(deal as any).shortCode}`)
  }

  async onRefundCompleted(pawapayRefundId: string): Promise<void> {
    const deal = await Deal.findOne({ pawapayRefundId })
    if (!deal) return
    if ((deal as any).status !== 'REFUNDING') return
    ;(deal as any).status = 'REFUNDED'
    await (deal as any).save()

    await sendTextMessage(
      (deal as any).buyerPhone,
      `↩️ *Refund processed!*\n\n${(deal as any).amount.toLocaleString()} XAF refunded to your MoMo account.\nDeal: *${(deal as any).shortCode}*`,
    )

    sendMoMoReceipt((deal as any).buyerPhone, {
      type: 'refund',
      referenceId: (deal as any).shortCode,
      dateTime: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      amount: (deal as any).amount,
      title: (deal as any).title,
    }).catch(() => {})

    logger.info(`[TrustLock] Refund completed for deal ${(deal as any).shortCode}`)
  }

  async handleMessage(phone: string, message: string, contextId: string): Promise<void> {
    const text = message.trim().toLowerCase()
    const deal = await Deal.findById(contextId).catch(() => null)
    if (!deal) return

    if (text === 'verdict' && String((deal as any).status) === 'DISPUTED') {
      const dispute = await Dispute.findOne({ dealId: contextId, filedByPhone: phone })
      if (dispute) await this.adjudicateDispute(String((dispute as any)._id))
    }
  }

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
  new (require('../services/gemini.service').GeminiService)(),
)
