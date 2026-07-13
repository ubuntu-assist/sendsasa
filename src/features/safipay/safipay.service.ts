import { Injectable } from '@nestjs/common'
import { Asset } from '@stellar/stellar-sdk'
import type { Invoice } from './invoice.schema'
import { InvoiceRepository } from '@domain/repositories/invoice.repository'
import { UserRepository } from '@domain/repositories/user.repository'
import { generateShortCode } from '@common/helpers/short-code'
import { GeminiService } from '@shared/gemini.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'
import {
  StellarService,
  STELLAR_USDC,
  EURT_ISSUER,
} from '@blockchain/stellar/stellar.service'
import { PaymentRailService } from '@shared/payment-rail.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'
import {
  sendTextMessage,
  sendCtaUrlButton,
} from '@messaging/whatsapp/whatsapp.service'
import { appEmitter, EVENTS } from '@shared/app-emitter'
import type { CreateInvoiceDto } from '@app/types'
import logger from '@common/utils/logger'

@Injectable()
export class SafiPayService {
  constructor(
    private readonly gemini: GeminiService,
    private readonly stellarAnchor: StellarAnchorService,
    private readonly stellar: StellarService,
    private readonly paymentRailService: PaymentRailService,
    private readonly fxRate: FxRateService,
    private readonly pawapay: PawapayService,
    private readonly invoices: InvoiceRepository,
    private readonly users: UserRepository,
  ) {}

  async createInvoice(
    merchantPhone: string,
    data: CreateInvoiceDto,
  ): Promise<typeof Invoice.prototype> {
    const shortCode = generateShortCode()
    const currency = data.currency ?? 'XAF'

    let paymentPageUrl: string | undefined
    let sep24TransactionId: string | undefined
    let tempoSep24Id: string | undefined
    let pawapayDepositId: string | undefined

    // ── EUR path: B2B export invoice — Tempo SEPA on-ramp ────────────────────
    if (currency === 'EUR') {
      try {
        const { interactiveUrl, sep24Id } =
          await this.stellarAnchor.initiateTempoDeposit(data.total)
        paymentPageUrl = interactiveUrl
        tempoSep24Id = sep24Id
        logger.info(
          `[SafiPay] Tempo EUR deposit initiated for ${shortCode}: sep24Id=${sep24Id}`,
        )
      } catch (err: any) {
        logger.error(
          `[SafiPay] Tempo deposit failed for ${shortCode}: ${err?.message}`,
        )
      }
    } else {
      // ── USD / XAF path: existing Stellar Circle or pawaPay logic ───────────
      const client = await this.users.findByPhone(data.clientPhone)
      const rate = await this.fxRate.getUSDtoXAF()
      const usdcAmount = parseFloat((data.total / rate).toFixed(7))
      const clientRail = client
        ? this.paymentRailService.getRail(client)
        : 'pawapay'

      if (clientRail === 'stellar' && client?.stellar_public_key) {
        try {
          const { interactiveUrl, sep24Id } =
            await this.stellarAnchor.initiateCircleDeposit(
              client.stellar_public_key,
              'USD',
              usdcAmount,
            )
          paymentPageUrl = interactiveUrl
          sep24TransactionId = sep24Id
          logger.info(
            `[SafiPay] SEP-24 deposit initiated for ${shortCode}: sep24Id=${sep24Id}`,
          )
        } catch (err: any) {
          logger.error(
            `[SafiPay] SEP-24 initiation failed for ${shortCode}: ${err?.message}`,
          )
        }
      }

      if (!paymentPageUrl) {
        try {
          const page = await this.pawapay.createPaymentPage(
            data.total,
            data.description,
            `https://api.sendsasa.com/safipay/paid/${shortCode}`,
          )
          paymentPageUrl = page.pageUrl
          pawapayDepositId = page.depositId
        } catch (err: any) {
          logger.error(
            `[SafiPay] pawaPay payment page failed for ${shortCode}: ${err?.response?.data ? JSON.stringify(err.response.data) : (err?.message ?? err)}`,
          )
        }
      }
    }

    const invoice = await this.invoices.create({
      shortCode,
      merchantPhone,
      clientPhone: data.clientPhone,
      clientName: data.clientName,
      description: data.description,
      total: data.total,
      currency,
      dueDate: data.dueDate,
      paymentPageUrl,
      sep24TransactionId,
      tempoSep24Id,
      pawapayDepositId,
      status: paymentPageUrl ? 'SENT' : 'DRAFT',
    })

    await this.users.setContext(merchantPhone, { type: 'SAFIPAY', invoiceId: String((invoice as any)._id) })

    // ── Send notifications ────────────────────────────────────────────────────
    if (currency === 'EUR') {
      // EUR invoice — buyer receives a SEPA payment link
      // XAF pegged at 655.957 per EUR (CFA franc fixed peg)
      const xafEquiv = Math.round(data.total * 655.957)
      const invoiceBody =
        `🧾 *Invoice / Facture*\n\n` +
        `🏪 From: ****${merchantPhone.slice(-4)}\n` +
        `📝 ${data.description}\n` +
        `💶 Amount: €${data.total.toLocaleString()}\n` +
        `≈ ${xafEquiv.toLocaleString()} XAF\n` +
        `📅 Due: ${new Date(data.dueDate).toLocaleDateString('fr-FR')}\n` +
        `🔑 Ref: ${shortCode}\n\n` +
        `Pay by SEPA. Funds are converted and sent directly to the exporter's mobile wallet.`

      if (paymentPageUrl) {
        await sendCtaUrlButton(
          data.clientPhone,
          invoiceBody,
          'Pay via SEPA',
          paymentPageUrl,
        )
      } else {
        await sendTextMessage(data.clientPhone, invoiceBody)
      }

      await sendTextMessage(
        merchantPhone,
        `✅ *EUR Invoice sent!*\n\n` +
          `👤 Buyer: ${data.clientName ?? data.clientPhone}\n` +
          `💶 €${data.total.toLocaleString()} EUR\n` +
          `≈ ${xafEquiv.toLocaleString()} XAF\n` +
          `📅 Due: ${new Date(data.dueDate).toLocaleDateString('en-US')}\n` +
          `🔑 Code: ${shortCode}\n\n` +
          `Waiting for SEPA payment. You'll receive XAF on your MoMo once the buyer pays.`,
      )
    } else {
      const rate = await this.fxRate.getUSDtoXAF()
      const usdcAmount = parseFloat((data.total / rate).toFixed(7))
      const rateInfoLine = sep24TransactionId
        ? `💱 ~${usdcAmount.toFixed(2)} USD · Rate: 1 USD = ${Math.round(rate).toLocaleString()} XAF (live)\n`
        : ''
      const invoiceBody =
        `🧾 *Invoice received*\n\n` +
        `🏪 Merchant: ****${merchantPhone.slice(-4)}\n` +
        `📝 ${data.description}\n` +
        `💰 Amount: ${data.total.toLocaleString()} XAF\n` +
        rateInfoLine +
        `📅 Due: ${new Date(data.dueDate).toLocaleDateString('en-US')}\n` +
        `🔑 Ref: ${shortCode}`

      if (paymentPageUrl) {
        const shortUrl = sep24TransactionId
          ? paymentPageUrl
          : `https://api.sendsasa.com/r/${shortCode}`
        await sendCtaUrlButton(
          data.clientPhone,
          invoiceBody,
          'Pay Now',
          shortUrl,
        )
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
    }

    logger.info(
      `[SafiPay] Invoice created: ${shortCode} (${merchantPhone} → ${data.clientPhone}, currency=${currency})`,
    )

    // ── Background SEP-24 polling ─────────────────────────────────────────────
    if (tempoSep24Id) {
      this._pollSep24Completion(
        tempoSep24Id,
        this.stellarAnchor.tempoAnchorUrl,
        async () => this._executeEurtToXafPayout(String((invoice as any)._id)),
      )
    } else if (sep24TransactionId) {
      this._pollSep24Completion(
        sep24TransactionId,
        this.stellarAnchor.circleAnchorUrl,
        async (stellarTxId) => {
          if (stellarTxId)
            await this.onStellarInvoicePaid(sep24TransactionId, stellarTxId)
        },
      )
    }

    return invoice
  }

  // ─── SEP-24 poll (generic — works for both Circle and Tempo) ─────────────

  private _pollSep24Completion(
    sep24Id: string,
    anchorUrl: string,
    onCompleted: (stellarTxId?: string) => Promise<void>,
  ): void {
    let attempts = 0
    const MAX_ATTEMPTS = 120 // 120 × 30s = 1 hour

    const interval = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval)
        logger.error(`[SafiPay] SEP-24 poll timeout for sep24Id=${sep24Id}`)
        return
      }

      try {
        const jwt = await this.stellarAnchor.getSep10Jwt(anchorUrl)
        const txStatus = await this.stellarAnchor.getSep24TransactionStatus(
          anchorUrl,
          jwt,
          sep24Id,
        )

        if (txStatus.status === 'completed') {
          clearInterval(interval)
          await onCompleted(txStatus.stellar_transaction_id)
        } else if (
          ['error', 'expired', 'refunded', 'no_market'].includes(
            txStatus.status,
          )
        ) {
          clearInterval(interval)
          logger.error(
            `[SafiPay] SEP-24 ${txStatus.status} for sep24Id=${sep24Id}`,
          )
        }
      } catch (err: any) {
        logger.error(
          `[SafiPay] SEP-24 poll error for ${sep24Id}: ${err?.message}`,
        )
      }
    }, 30_000)
  }

  // ─── EUR invoice: EURT → USDC (DEX) → Onafriq → XAF ────────────────────

  /**
   * Called when Tempo SEP-24 completes (EURT credited to platform account).
   * Converts EURT → USDC via Stellar DEX in a single pathPaymentStrictSend,
   * routed to Onafriq's SEP-31 distribution account for XAF delivery to the
   * exporter's MTN MoMo wallet.
   */
  private async _executeEurtToXafPayout(invoiceId: string): Promise<void> {
    const invoice = await this.invoices.findById(invoiceId)
    if (!invoice || (invoice as any).status === 'PAID') return

    const eurAmount = (invoice as any).total as number
    const merchantPhone = (invoice as any).merchantPhone as string
    const shortCode = (invoice as any).shortCode as string

    try {
      // 1. Query Stellar DEX for expected USDC output of EURT → USDC swap
      const usdcEstimate = await this.stellar.queryEurtToUsdc(eurAmount)

      // 2. Get firm SEP-38 quote + register SEP-31 transaction with Onafriq
      const {
        sep31TransactionId,
        onafriqStellarAccount,
        stellarMemo,
        firmQuote,
      } = await this.stellarAnchor.prepareOnafriqOffRamp({
        recipientPhone: merchantPhone,
        recipientCountryCode: 'CM',
        usdcAmount: usdcEstimate,
        localCurrencyCode: 'XAF',
      })

      ;(invoice as any).sep31TransactionId = sep31TransactionId
      await (invoice as any).save()

      // 3. EURT → USDC (Stellar DEX) → Onafriq distribution account
      //    Single pathPaymentStrictSend: Stellar auto-routes EURT/USDC via DEX
      const eurtAsset = EURT_ISSUER
        ? new Asset('EURT', EURT_ISSUER)
        : new Asset('EURT', this.stellarAnchor.tempoEurtIssuer)

      const txHash = await this.stellar.pathPaymentStrictSend(
        onafriqStellarAccount,
        eurAmount,
        usdcEstimate * 0.98, // 2% slippage tolerance on USDC delivery
        stellarMemo,
        eurtAsset,
        STELLAR_USDC,
      )

      // `buy_amount` in the firm quote is the expected XAF (from Onafriq's SEP-38)
      const xafExpected =
        parseFloat(firmQuote.buy_amount ?? '0') ||
        Math.round(usdcEstimate * 620)

      ;(invoice as any).status = 'PAID'
      ;(invoice as any).paidAt = new Date()
      ;(invoice as any).stellarDepositTxHash = txHash
      await (invoice as any).save()

      await this._notifyEurPaid(invoice as any, xafExpected)

      logger.info(
        `[SafiPay] EUR invoice ${shortCode} settled: €${eurAmount} → ${usdcEstimate.toFixed(2)} USDC → ~${xafExpected.toLocaleString()} XAF (tx: ${txHash})`,
      )
    } catch (err: any) {
      logger.error(
        `[SafiPay] EURT→XAF payout failed for ${shortCode}: ${err?.message}`,
      )
      await sendTextMessage(
        merchantPhone,
        `❌ EUR payment received but XAF conversion failed.\nRef: ${shortCode}\nPlease contact support.`,
      )
    }
  }

  private async _notifyEurPaid(
    invoice: any,
    xafExpected: number,
  ): Promise<void> {
    await sendTextMessage(
      invoice.merchantPhone,
      `💶 *EUR payment received!*\n\n` +
        `€${invoice.total.toLocaleString()} EUR — Invoice ${invoice.shortCode}\n` +
        `📝 ${invoice.description}\n` +
        `💵 ~${xafExpected.toLocaleString()} XAF on its way to your MoMo.\n` +
        `✅ SEPA → Stellar → Onafriq`,
    )
    await sendTextMessage(
      invoice.clientPhone,
      `✅ *Payment confirmed!*\n\n` +
        `Invoice ${invoice.shortCode} — €${invoice.total.toLocaleString()} EUR paid. Thank you!`,
    )

    const extraLines: { label: string; value: string }[] = [
      { label: 'Currency', value: 'EUR' },
      { label: 'EUR Amount', value: `€${invoice.total.toLocaleString()}` },
      { label: 'XAF Payout', value: `~${xafExpected.toLocaleString()} XAF` },
    ]
    if (invoice.clientName)
      extraLines.unshift({ label: 'Buyer', value: invoice.clientName })
    if (invoice.stellarDepositTxHash) {
      extraLines.push({
        label: 'Stellar Tx',
        value: `${invoice.stellarDepositTxHash.slice(0, 16)}…`,
      })
    }

    appEmitter.emit(EVENTS.RECEIPT_SEND, {
      phone: invoice.merchantPhone,
      data: {
        type: 'invoice',
        referenceId: invoice.shortCode,
        dateTime: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        amount: xafExpected,
        title: invoice.description,
        extraLines,
      },
    })

    await this.users.setContext(invoice.merchantPhone, null)
  }

  async parseInvoiceFromText(text: string): Promise<Partial<CreateInvoiceDto>> {
    return this.gemini.parseInvoice(text)
  }

  // ─── Payment confirmation handlers ────────────────────────────────────────

  /** Called when the Circle SEP-24 deposit for a USD invoice completes on-chain. */
  async onStellarInvoicePaid(
    sep24Id: string,
    stellarTxHash: string,
  ): Promise<void> {
    const invoice = await this.invoices.findBySep24Id(sep24Id)
    if (!invoice || (invoice as any).status === 'PAID') return
    ;(invoice as any).status = 'PAID'
    ;(invoice as any).paidAt = new Date()
    ;(invoice as any).stellarDepositTxHash = stellarTxHash
    await (invoice as any).save()

    await this._notifyPaid(invoice as any)
    logger.info(
      `[SafiPay] Invoice ${(invoice as any).shortCode} paid via Circle Stellar (tx: ${stellarTxHash})`,
    )
  }

  /** Called via pawaPay webhook for XAF invoices. */
  async onInvoicePaid(pawapayDepositId: string): Promise<void> {
    const invoice = await this.invoices.findByDepositId(pawapayDepositId)
    if (!invoice || (invoice as any).status === 'PAID') return
    ;(invoice as any).status = 'PAID'
    ;(invoice as any).paidAt = new Date()
    await (invoice as any).save()

    await this._notifyPaid(invoice as any)
    logger.info(
      `[SafiPay] Invoice ${(invoice as any).shortCode} paid via pawaPay`,
    )
  }

  private async _notifyPaid(invoice: any): Promise<void> {
    await sendTextMessage(
      invoice.merchantPhone,
      `💰 *Payment received!*\n\n${invoice.total.toLocaleString()} XAF for invoice ${invoice.shortCode}\n📝 ${invoice.description}`,
    )
    await sendTextMessage(
      invoice.clientPhone,
      `✅ *Payment confirmed!*\n\nInvoice ${invoice.shortCode} of ${invoice.total.toLocaleString()} XAF paid. Thank you!`,
    )

    const extraLines: { label: string; value: string }[] = []
    if (invoice.clientName)
      extraLines.push({ label: 'Client', value: invoice.clientName })
    extraLines.push({
      label: 'Due Date',
      value: new Date(invoice.dueDate).toLocaleDateString('en-US'),
    })
    extraLines.push({
      label: 'Paid At',
      value: new Date(invoice.paidAt).toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    })
    if (invoice.stellarDepositTxHash) {
      extraLines.push({
        label: 'Stellar Tx',
        value: `${invoice.stellarDepositTxHash.slice(0, 16)}…`,
      })
    }

    const receiptData = {
      type: 'invoice' as const,
      referenceId: invoice.shortCode,
      dateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      amount: invoice.total,
      title: invoice.description,
      extraLines,
    }
    appEmitter.emit(EVENTS.RECEIPT_SEND, { phone: invoice.merchantPhone, data: receiptData })
    appEmitter.emit(EVENTS.RECEIPT_SEND, { phone: invoice.clientPhone, data: receiptData })

    await this.users.setContext(invoice.merchantPhone, null)
  }

  // ─── Reminders & overdue management ───────────────────────────────────────

  async sendReminder(invoiceId: string): Promise<void> {
    const invoice = await this.invoices.findById(invoiceId)
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

    const isCurrency = (invoice as any).currency === 'EUR' ? 'EUR' : 'XAF'
    const amountStr =
      isCurrency === 'EUR'
        ? `€${(invoice as any).total.toLocaleString()}`
        : `${(invoice as any).total.toLocaleString()} XAF`

    const msg =
      `⏰ *Payment reminder*\n\n` +
      `📝 ${(invoice as any).description}\n` +
      `💰 ${amountStr}\n` +
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
    return this.invoices.findByMerchantSorted(merchantPhone)
  }

  async sendAllOverdueReminders(): Promise<void> {
    const overdueInvoices = await this.invoices.findPendingReminders()

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
    const invoice = await this.invoices.findById(contextId).catch(() => null)
    if (!invoice) return

    if (
      text === 'invoices' &&
      String((invoice as any).merchantPhone) === phone
    ) {
      const invoices = await this.listInvoices(phone)
      const lines = invoices.map((inv: any, i: number) => {
        const curr = inv.currency === 'EUR' ? '€' : ''
        const suffix = inv.currency === 'EUR' ? ' EUR' : ' XAF'
        return `${i + 1}. ${inv.shortCode} — ${curr}${inv.total.toLocaleString()}${suffix} (${inv.status})`
      })
      await sendTextMessage(phone, `🧾 *Your invoices*\n\n${lines.join('\n')}`)
    }
  }
}

export const safipayService = new SafiPayService(
  new (require('../../shared/services/gemini.service').GeminiService)(),
  new (require('../../blockchain/stellar/stellar-anchor.service').StellarAnchorService)(),
  new (require('../../blockchain/stellar/stellar.service').StellarService)(),
  new (require('../../shared/services/payment-rail.service').PaymentRailService)(),
  fxRateService,
  new (require('../../payments/pawapay/pawapay.service').PawapayService)(),
  new (require('../../domain/repositories/invoice.repository').InvoiceRepository)(),
  new (require('../../domain/repositories/user.repository').UserRepository)(),
)
