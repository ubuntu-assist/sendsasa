import { Injectable } from '@nestjs/common'
import { Invoice } from './invoice.schema'
import { generateShortCode } from '../common/short-code'
import { pawapayService } from '../pawapay/pawapay.service'
import { GeminiService } from '../services/gemini.service'
import { sendTextMessage, WhatsAppService } from '../whatsapp/whatsapp.service'
import { User } from '../models/User'
import type { CreateInvoiceDto } from '../types'
import logger from '../utils/logger'

@Injectable()
export class SafiPayService {
  constructor(private readonly gemini: GeminiService) {}

  async createInvoice(
    merchantPhone: string,
    data: CreateInvoiceDto,
  ): Promise<typeof Invoice.prototype> {
    const shortCode = generateShortCode()

    let paymentPageUrl: string | undefined
    let pawapayDepositId: string | undefined
    try {
      const page = await pawapayService.createPaymentPage(
        data.total,
        data.description,
        `https://api.sendsasa.com/safipay/paid/${shortCode}`,
      )
      paymentPageUrl = page.pageUrl
      pawapayDepositId = page.depositId
    } catch (err: any) {
      logger.error(`[SafiPay] Payment page creation failed for ${shortCode}: ${err?.response?.data ? JSON.stringify(err.response.data) : err?.message ?? err}`)
    }

    const invoice = await Invoice.create({
      shortCode,
      merchantPhone,
      clientPhone: data.clientPhone,
      clientName: data.clientName,
      description: data.description,
      total: data.total,
      dueDate: data.dueDate,
      paymentPageUrl,
      pawapayDepositId,
      status: paymentPageUrl ? 'SENT' : 'DRAFT',
    })

    await User.findOneAndUpdate(
      { phoneNumber: merchantPhone },
      {
        momotrustContext: `SAFIPAY:${(invoice as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    const invoiceBody =
      `🧾 *Invoice received*\n\n` +
      `🏪 Merchant: ****${merchantPhone.slice(-4)}\n` +
      `📝 ${data.description}\n` +
      `💰 Amount: ${data.total.toLocaleString()} XAF\n` +
      `📅 Due: ${new Date(data.dueDate).toLocaleDateString('en-US')}\n` +
      `🔑 Ref: ${shortCode}`

    if (paymentPageUrl) {
      await WhatsAppService.sendMessage({
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: data.clientPhone,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: { text: invoiceBody },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: '💳 Pay Invoice',
              url: paymentPageUrl,
            },
          },
          footer: { text: 'Powered by SendSasa · SafiPay' },
        },
      })
    } else {
      await sendTextMessage(data.clientPhone, invoiceBody)
    }

    await sendTextMessage(
      merchantPhone,
      `✅ *Invoice sent!*\n\n` +
        `👤 Client: ${data.clientName ?? data.clientPhone}\n` +
        `💰 ${data.total.toLocaleString()} XAF\n` +
        `📅 Due: ${new Date(data.dueDate).toLocaleDateString('en-US')}\n` +
        `🔑 Code: ${shortCode}`,
    )

    logger.info(
      `[SafiPay] Invoice created: ${shortCode} (${merchantPhone} → ${data.clientPhone})`,
    )
    return invoice
  }

  async parseInvoiceFromText(text: string): Promise<Partial<CreateInvoiceDto>> {
    return this.gemini.parseInvoice(text)
  }

  async onInvoicePaid(pawapayDepositId: string): Promise<void> {
    const invoice = await Invoice.findOne({ pawapayDepositId })
    if (!invoice) return
    ;(invoice as any).status = 'PAID'
    ;(invoice as any).paidAt = new Date()
    await (invoice as any).save()

    await sendTextMessage(
      (invoice as any).merchantPhone,
      `💰 *Payment received!*\n\n${(invoice as any).total.toLocaleString()} XAF for invoice ${(invoice as any).shortCode}\n📝 ${(invoice as any).description}`,
    )

    await sendTextMessage(
      (invoice as any).clientPhone,
      `✅ *Payment confirmed!*\n\nInvoice ${(invoice as any).shortCode} of ${(invoice as any).total.toLocaleString()} XAF paid. Thank you!`,
    )

    logger.info(`[SafiPay] Invoice ${(invoice as any).shortCode} paid`)
  }

  async sendReminder(invoiceId: string): Promise<void> {
    const invoice = await Invoice.findById(invoiceId)
    if (
      !invoice ||
      (invoice as any).status === 'PAID' ||
      (invoice as any).status === 'CANCELLED'
    )
      return
    if (((invoice as any).reminderCount ?? 0) >= 3) return
    ;(invoice as any).reminderCount = ((invoice as any).reminderCount ?? 0) + 1
    ;(invoice as any).lastReminderAt = new Date()
    ;(invoice as any).status = 'REMINDER_SENT'
    await (invoice as any).save()

    const msg =
      `⏰ *Payment reminder*\n\n` +
      `📝 ${(invoice as any).description}\n` +
      `💰 ${(invoice as any).total.toLocaleString()} XAF\n` +
      `📅 Due: ${new Date((invoice as any).dueDate).toLocaleDateString('en-US')}\n` +
      `🔑 Ref: ${(invoice as any).shortCode}` +
      ((invoice as any).paymentPageUrl
        ? `\n\n💳 ${(invoice as any).paymentPageUrl}`
        : '')

    await sendTextMessage((invoice as any).clientPhone, msg)
    logger.info(
      `[SafiPay] Reminder ${(invoice as any).reminderCount} sent for invoice ${(invoice as any).shortCode}`,
    )
  }

  async listInvoices(
    merchantPhone: string,
  ): Promise<(typeof Invoice.prototype)[]> {
    return Invoice.find({ merchantPhone }).sort({ createdAt: -1 }).limit(10)
  }

  async sendAllOverdueReminders(): Promise<void> {
    const now = new Date()
    const overdueInvoices = await Invoice.find({
      status: { $in: ['SENT', 'REMINDER_SENT', 'OVERDUE'] },
      dueDate: { $lt: now },
      reminderCount: { $lt: 3 },
    })

    for (const invoice of overdueInvoices) {
      if ((invoice as any).status !== 'OVERDUE') {
        ;(invoice as any).status = 'OVERDUE'
        await (invoice as any).save()
      }
      await this.sendReminder(String((invoice as any)._id))
    }
  }

  async handleMessage(
    phone: string,
    message: string,
    contextId: string,
  ): Promise<void> {
    const text = message.trim().toLowerCase()
    const invoice = await Invoice.findById(contextId).catch(() => null)
    if (!invoice) return

    if (
      text === 'invoices' &&
      String((invoice as any).merchantPhone) === phone
    ) {
      const invoices = await this.listInvoices(phone)
      const lines = invoices.map(
        (inv: any, i: number) =>
          `${i + 1}. ${inv.shortCode} — ${inv.total.toLocaleString()} XAF (${inv.status})`,
      )
      await sendTextMessage(phone, `🧾 *Your invoices*\n\n${lines.join('\n')}`)
    }
  }
}

export const safipayService = new SafiPayService(
  new (require('../services/gemini.service').GeminiService)(),
)
