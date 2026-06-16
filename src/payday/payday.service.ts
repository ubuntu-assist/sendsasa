import { Injectable } from '@nestjs/common'
import { Payroll } from './payroll.schema'
import { generateShortCode } from '../common/short-code'
import { calculateFee } from '../common/fee'
import { pawapayService } from '../pawapay/pawapay.service'
import { GeminiService } from '../services/gemini.service'
import { sendTextMessage } from '../whatsapp/whatsapp.service'
import { User } from '../models/User'
import type { CreatePayrollDto, PayrollItem } from '../types'
import logger from '../utils/logger'

@Injectable()
export class PayDayService {
  constructor(private readonly gemini: GeminiService) {}

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

  async disburse(payrollId: string): Promise<void> {
    const payroll = await Payroll.findById(payrollId)
    if (!payroll) return
    ;(payroll as any).status = 'DISBURSING'

    const recipients = ((payroll as any).items as any[])
      .filter((item) => item.status === 'PENDING')
      .map((item) => ({
        payoutId: pawapayService.generateId(),
        phone: item.recipientPhone,
        amount: item.amount,
        description: `Salary ${(payroll as any).shortCode}`.slice(0, 22),
      }))

    for (const r of recipients) {
      const item = ((payroll as any).items as any[]).find(
        (i) => i.recipientPhone === r.phone,
      )
      if (item) item.pawapayPayoutId = r.payoutId
    }
    await (payroll as any).save()

    const results = await pawapayService.bulkPayout(recipients)

    for (const result of results) {
      const item = ((payroll as any).items as any[]).find(
        (i) => i.pawapayPayoutId === result.payoutId,
      )
      if (item && result.status === 'REJECTED') {
        item.status = 'FAILED'
        item.failureReason = result.rejectionReason
        ;(payroll as any).paidCount = (payroll as any).paidCount ?? 0
      }
    }
    await (payroll as any).save()

    logger.info(
      `[PayDay] Disbursement started for ${(payroll as any).shortCode}: ${recipients.length} recipients`,
    )
  }

  async onItemPaid(pawapayPayoutId: string): Promise<void> {
    const payroll = await Payroll.findOne({
      'items.pawapayPayoutId': pawapayPayoutId,
    })
    if (!payroll) return

    const item = ((payroll as any).items as any[]).find(
      (i) => i.pawapayPayoutId === pawapayPayoutId,
    )
    if (!item) return
    if (item.status === 'COMPLETED') return

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
    if (!item) return
    if (item.status !== 'PENDING') return

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
  new (require('../services/gemini.service').GeminiService)(),
)
