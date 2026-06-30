import { Injectable } from '@nestjs/common'
import { Payroll } from './payroll.schema'
import { generateShortCode } from '@common/helpers/short-code'
import { calculateFee } from '@common/helpers/fee'
import { GeminiService } from '@shared/gemini.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { PaymentRailService } from '@shared/payment-rail.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { sendMoMoReceipt } from '@shared/receipt-generator.service'
import { User } from '@models/User'
import type { CreatePayrollDto, PayrollItem } from '@app/types'
import logger from '@common/utils/logger'

// Onafriq Stellar distribution account for SEP-31 bulk payroll.
// Each payment op sends USDC to this account; Onafriq routes to MoMo via their API.
const ONAFRIQ_DIST_ACCOUNT = process.env.ONAFRIQ_DISTRIBUTION_ACCOUNT ?? ''

@Injectable()
export class PayDayService {
  constructor(
    private readonly gemini: GeminiService,
    private readonly stellar: StellarService,
    private readonly paymentRailService: PaymentRailService,
    private readonly fxRate: FxRateService,
  ) {}

  async createPayroll(
    employerPhone: string,
    data: CreatePayrollDto,
  ): Promise<typeof Payroll.prototype> {
    const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0)
    const fee = calculateFee(totalAmount)
    const shortCode = generateShortCode()

    const payroll = await Payroll.create({
      shortCode,
      employerPhone,
      name: data.name,
      totalAmount,
      fee,
      recipientCount: data.items.length,
      status: 'DRAFT',
      items: data.items.map((item) => ({ ...item, status: 'PENDING' })),
    })

    await User.findOneAndUpdate(
      { phoneNumber: employerPhone },
      {
        momotrustContext: `PAYDAY:${(payroll as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    const lines = data.items
      .slice(0, 5)
      .map(
        (item, i) =>
          `${i + 1}. ${item.recipientName ?? '****' + item.recipientPhone.slice(-4)} — ${item.amount.toLocaleString()} XAF`,
      )
    const more =
      data.items.length > 5 ? `\n…and ${data.items.length - 5} more` : ''

    await sendTextMessage(
      employerPhone,
      `📋 *Payroll created*\n\n` +
        `📌 ${data.name}\n` +
        `👥 ${data.items.length} employee(s)\n` +
        `💰 Total: ${totalAmount.toLocaleString()} XAF\n` +
        `💸 Fee: ${fee.toLocaleString()} XAF\n\n` +
        lines.join('\n') +
        more +
        '\n\n' +
        `Send *APPROVE* to start disbursement.`,
    )

    logger.info(
      `[PayDay] Payroll created: ${shortCode} (${data.items.length} recipients)`,
    )
    return payroll
  }

  async parsePayrollFromText(text: string): Promise<PayrollItem[]> {
    return this.gemini.parsePayroll(text)
  }

  async approvePayroll(
    payrollId: string,
    employerPhone: string,
  ): Promise<void> {
    const payroll = await Payroll.findById(payrollId)
    if (!payroll || String((payroll as any).employerPhone) !== employerPhone)
      return
    if ((payroll as any).status !== 'DRAFT') {
      await sendTextMessage(
        employerPhone,
        `⚠️ This payroll can no longer be approved.`,
      )
      return
    }

    ;(payroll as any).status = 'APPROVED'
    await (payroll as any).save()

    await sendTextMessage(
      employerPhone,
      `✅ Approved! Disbursement starting...`,
    )
    await this.disburse(payrollId)
  }

  /**
   * Disburse payroll via a single Stellar batch transaction (up to 100 ops).
   *
   * All pending items are packed into one TransactionBuilder with one
   * pathPaymentStrictSend op per recipient routed to the Onafriq distribution
   * account. Onafriq uses SEP-31 to route each payment to the recipient's
   * MoMo wallet using the payroll shortCode as the reference.
   *
   * Falls back to the legacy pawaPay bulk-payout when ONAFRIQ_DIST_ACCOUNT
   * is not configured (e.g. during local development).
   */
  async disburse(payrollId: string): Promise<void> {
    const payroll = await Payroll.findById(payrollId)
    if (!payroll) return
    ;(payroll as any).status = 'DISBURSING'
    await (payroll as any).save()

    const pendingItems = ((payroll as any).items as any[]).filter(
      (item) => item.status === 'PENDING',
    )

    const employer = await User.findOne({
      phoneNumber: (payroll as any).employerPhone,
    }).select('operatingRegion')

    const rail = employer ? this.paymentRailService.getRail(employer) : 'pawapay'

    if (rail === 'stellar' && ONAFRIQ_DIST_ACCOUNT) {
      await this._disburseStellar(payroll as any, pendingItems)
      return
    }

    await this._disbursePawapay(payroll as any, pendingItems)
  }

  private async _disburseStellar(payroll: any, pendingItems: any[]): Promise<void> {
    const rate = await this.fxRate.getUSDtoXAF()
    const recipients = pendingItems.map((item, index) => ({
      phone: item.recipientPhone,
      usdcAmount: parseFloat((item.amount / rate).toFixed(7)),
      localAmount: item.amount,
      opIndex: index,
    }))

    // Tag each item with its batch operation index for traceability
    for (const r of recipients) {
      const item = pendingItems.find((i) => i.recipientPhone === r.phone)
      if (item) item.stellarPaymentOpIndex = r.opIndex
    }
    await payroll.save()

    try {
      const batchTxHash = await this.stellar.sendPayrollBatch(
        ONAFRIQ_DIST_ACCOUNT,
        recipients,
      )

      payroll.stellarBatchTxHash = batchTxHash

      // Stellar batch is atomic — all ops confirmed in one ledger close
      const now = new Date()
      for (const item of payroll.items as any[]) {
        if (item.status === 'PENDING') {
          item.status = 'COMPLETED'
          item.paidAt = now
        }
      }
      payroll.paidCount = pendingItems.length
      await payroll.save()

      logger.info(
        `[PayDay] Stellar batch confirmed for ${payroll.shortCode}: ${pendingItems.length} recipients (tx: ${batchTxHash})`,
      )

      // Notify each recipient
      for (const item of payroll.items as any[]) {
        if (item.status === 'COMPLETED') {
          await sendTextMessage(
            item.recipientPhone,
            `💸 ${item.amount.toLocaleString()} XAF received!\n\nFrom: ${payroll.employerPhone}\nRef: ${payroll.shortCode}`,
          )
        }
      }

      await this._checkCompletion(payroll)
    } catch (err: any) {
      logger.error(
        `[PayDay] Stellar batch failed for ${payroll.shortCode}: ${err?.message}`,
      )
      payroll.status = 'PARTIAL_FAILURE'
      for (const item of payroll.items as any[]) {
        if (item.status === 'PENDING') {
          item.status = 'FAILED'
          item.failureReason = err?.message ?? 'Stellar batch tx failed'
        }
      }
      await payroll.save()

      await sendTextMessage(
        payroll.employerPhone,
        `❌ *Disbursement failed*\n\nStellar batch transaction rejected. Please try again or contact support.\nRef: ${payroll.shortCode}`,
      )
    }
  }

  private async _disbursePawapay(payroll: any, pendingItems: any[]): Promise<void> {
    const { pawapayService } = await import('@payments/pawapay/pawapay.service')

    const recipients = pendingItems.map((item) => ({
      payoutId: pawapayService.generateId(),
      phone: item.recipientPhone,
      amount: item.amount,
      description: `Salary ${payroll.shortCode}`.slice(0, 22),
    }))

    for (const r of recipients) {
      const item = (payroll.items as any[]).find(
        (i) => i.recipientPhone === r.phone,
      )
      if (item) item.pawapayPayoutId = r.payoutId
    }
    await payroll.save()

    const results = await pawapayService.bulkPayout(recipients)
    for (const result of results) {
      const item = (payroll.items as any[]).find(
        (i) => i.pawapayPayoutId === result.payoutId,
      )
      if (item && result.status === 'REJECTED') {
        item.status = 'FAILED'
        item.failureReason = result.rejectionReason
      }
    }
    await payroll.save()

    logger.info(
      `[PayDay] pawaPay disbursement started for ${payroll.shortCode}: ${recipients.length} recipients`,
    )
  }

  // ─── Legacy pawaPay per-item callbacks ────────────────────────────────────

  async onItemPaid(pawapayPayoutId: string): Promise<void> {
    const payroll = await Payroll.findOne({
      'items.pawapayPayoutId': pawapayPayoutId,
    })
    if (!payroll) return

    const item = ((payroll as any).items as any[]).find(
      (i) => i.pawapayPayoutId === pawapayPayoutId,
    )
    if (!item || item.status === 'COMPLETED') return

    item.status = 'COMPLETED'
    item.paidAt = new Date()
    ;(payroll as any).paidCount = ((payroll as any).paidCount ?? 0) + 1
    await (payroll as any).save()

    await sendTextMessage(
      item.recipientPhone,
      `💸 ${item.amount.toLocaleString()} XAF received!\n\nFrom: ${(payroll as any).employerPhone}\nRef: ${(payroll as any).shortCode}`,
    )

    await this._checkCompletion(payroll)
    logger.info(
      `[PayDay] Item paid: ${item.recipientPhone} (${(payroll as any).shortCode})`,
    )
  }

  async onItemFailed(pawapayPayoutId: string, code: string): Promise<void> {
    const payroll = await Payroll.findOne({
      'items.pawapayPayoutId': pawapayPayoutId,
    })
    if (!payroll) return

    const item = ((payroll as any).items as any[]).find(
      (i) => i.pawapayPayoutId === pawapayPayoutId,
    )
    if (!item || item.status !== 'PENDING') return

    item.status = 'FAILED'
    item.failureReason = code
    await (payroll as any).save()

    await this._checkCompletion(payroll)
    logger.info(
      `[PayDay] Item failed: ${item.recipientPhone} (${(payroll as any).shortCode}) — ${code}`,
    )
  }

  private async _checkCompletion(payroll: any): Promise<void> {
    const items: any[] = payroll.items
    const allResolved = items.every((i: any) => i.status !== 'PENDING')
    if (!allResolved) return

    const anyFailed = items.some((i: any) => i.status === 'FAILED')
    payroll.status = anyFailed ? 'PARTIAL_FAILURE' : 'COMPLETED'
    await payroll.save()

    const failedCount = items.filter((i: any) => i.status === 'FAILED').length
    const paidCount = items.filter((i: any) => i.status === 'COMPLETED').length

    await sendTextMessage(
      payroll.employerPhone,
      anyFailed
        ? `⚠️ *Payroll completed with errors*\n\n✅ ${paidCount} payments succeeded\n❌ ${failedCount} failed\nRef: ${payroll.shortCode}`
        : `🎉 *All payments sent!*\n\n${paidCount} employee(s) paid\nRef: ${payroll.shortCode}`,
    )

    const extraLines: { label: string; value: string }[] = [
      { label: 'Recipients', value: `${paidCount} / ${payroll.recipientCount}` },
    ]
    if (anyFailed) extraLines.push({ label: 'Failed', value: String(failedCount) })
    if (payroll.stellarBatchTxHash) {
      extraLines.push({ label: 'Stellar Tx', value: payroll.stellarBatchTxHash.slice(0, 16) + '…' })
    }
    sendMoMoReceipt(payroll.employerPhone, {
      type: 'payroll',
      referenceId: payroll.shortCode,
      dateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      amount: payroll.totalAmount,
      fee: payroll.fee,
      title: payroll.name,
      extraLines,
    }).catch(() => {})

    await User.findOneAndUpdate(
      { phoneNumber: payroll.employerPhone },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )
  }

  async handleMessage(
    phone: string,
    message: string,
    contextId: string,
  ): Promise<void> {
    const text = message.trim().toLowerCase()
    const payroll = await Payroll.findById(contextId).catch(() => null)
    if (!payroll) return

    if (
      text === 'approve' &&
      String((payroll as any).employerPhone) === phone &&
      (payroll as any).status === 'DRAFT'
    ) {
      await this.approvePayroll(contextId, phone)
    }
  }
}

export const paydayService = new PayDayService(
  new (require('../../shared/services/gemini.service').GeminiService)(),
  new (require('../../blockchain/stellar/stellar.service').StellarService)(),
  new (require('../../shared/services/payment-rail.service').PaymentRailService)(),
  fxRateService,
)
