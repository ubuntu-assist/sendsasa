import { Injectable } from '@nestjs/common'
import { KoboKallRemittance } from './kobokall-remittance.schema'
import { pawapayService } from '../pawapay/pawapay.service'
import { sendTextMessage, WhatsAppService } from '../whatsapp/whatsapp.service'
import { User } from '../models/User'
import type { CreateKoboKallDto } from '../types'
import logger from '../utils/logger'

const COUNTRY_NAMES: Record<string, string> = {
  GAB: 'Gabon',
  COG: 'Congo-Brazzaville',
  TZA: 'Tanzania',
  UGA: 'Uganda',
  ZMB: 'Zambia',
}

// Approximate display rates: 1 XAF → destination currency
// Used only for the confirmation screen; pawaPay applies the real rate on settlement.
const CORRIDOR_DEFAULTS: Record<string, { currency: string; rate: number }> = {
  GAB: { currency: 'XAF', rate: 1 },
  COG: { currency: 'XAF', rate: 1 },
  TZA: { currency: 'TZS', rate: 3.7 },
  UGA: { currency: 'UGX', rate: 3.7 },
  ZMB: { currency: 'ZMW', rate: 0.026 },
}

@Injectable()
export class KoboKallService {
  async initiateRemittance(senderPhone: string, dto: CreateKoboKallDto): Promise<void> {
    const corridors = await pawapayService.getActiveRemittanceCorridors()
    logger.info(`[KoboKall] Active corridors: ${corridors.map((c: any) => c.receivingCountry).join(', ') || 'none'}`)

    const defaults = CORRIDOR_DEFAULTS[dto.recipientCountry]
    if (!defaults) {
      await sendTextMessage(
        senderPhone,
        `❌ *Destination unavailable*\n\nTransfer to ${COUNTRY_NAMES[dto.recipientCountry] ?? dto.recipientCountry} is not yet supported.\nContact support for more information.`,
      )
      return
    }

    const corridor = corridors.find((c: any) => c.receivingCountry === dto.recipientCountry)
    const receiveCurrency: string = corridor?.receivingCurrency ?? defaults.currency
    const exchangeRate: number = defaults.rate
    const receiveAmount = Math.round(dto.sendAmount * exchangeRate)
    const correspondent = await pawapayService.predictCorrespondent(senderPhone)
    const remittanceId = pawapayService.generateId()

    await KoboKallRemittance.create({
      remittanceId,
      senderPhone,
      recipientPhone: dto.recipientPhone,
      recipientCountry: dto.recipientCountry,
      sendAmount: Math.round(dto.sendAmount),
      receiveAmount,
      receiveCurrency,
      exchangeRate,
      correspondent,
      status: 'INITIATED',
    })

    await User.findOneAndUpdate(
      { phoneNumber: senderPhone },
      { momotrustContext: `KOBOKALL:${remittanceId}`, momotrustContextUpdatedAt: new Date() },
    )

    const countryLabel = COUNTRY_NAMES[dto.recipientCountry] ?? dto.recipientCountry

    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: senderPhone,
      type: 'interactive',
      interactive: {
        type: 'button',
        body: {
          text:
            `✈️ *International Transfer*\n\n` +
            `📤 You send: ${Math.round(dto.sendAmount).toLocaleString()} XAF\n` +
            `📱 Recipient: ${dto.recipientPhone}\n` +
            `🌍 Country: ${countryLabel}\n` +
            `💰 They receive: ~${receiveAmount.toLocaleString()} ${receiveCurrency}\n` +
            `💸 Rate: 1 XAF = ${exchangeRate} ${receiveCurrency}\n\n` +
            `Do you confirm this transfer?`,
        },
        action: {
          buttons: [
            { type: 'reply', reply: { id: `kobokall_confirm:${remittanceId}`, title: '✅ Confirm' } },
            { type: 'reply', reply: { id: `kobokall_cancel:${remittanceId}`, title: '❌ Cancel' } },
          ],
        },
      },
    })

    logger.info(`[KoboKall] Remittance ${remittanceId} initiated: ${senderPhone} → ${dto.recipientPhone} (${dto.recipientCountry})`)
  }

  async confirmRemittance(remittanceId: string, phone: string): Promise<void> {
    const remittance = await KoboKallRemittance.findOne({ remittanceId })
    if (!remittance || (remittance as any).senderPhone !== phone) return
    if ((remittance as any).status !== 'INITIATED') return

    ;(remittance as any).status = 'PROCESSING'
    await (remittance as any).save()

    await sendTextMessage(
      phone,
      `⏳ *Transfer in progress...*\n\nYour transfer of ${(remittance as any).sendAmount.toLocaleString()} XAF is being processed. You will be notified upon confirmation.`,
    )

    const result = await pawapayService.remittance(
      remittanceId,
      phone,
      (remittance as any).recipientPhone,
      (remittance as any).recipientCountry,
      (remittance as any).sendAmount,
      (remittance as any).exchangeRate,
      `KoboKall${(remittance as any).recipientCountry}`,
    )

    if (result.status === 'REJECTED') {
      ;(remittance as any).status = 'FAILED'
      ;(remittance as any).failureCode = result.rejectionReason ?? 'REJECTED'
      await (remittance as any).save()
      await sendTextMessage(
        phone,
        `❌ *Transfer rejected*\n\n${result.rejectionReason ?? ''}\nPlease try again or contact support.`,
      )
    }

    logger.info(`[KoboKall] Remittance ${remittanceId} confirmed, pawaPay status: ${result.status}`)
  }

  async onRemittanceCompleted(remittanceId: string): Promise<void> {
    const remittance = await KoboKallRemittance.findOne({ remittanceId })
    if (!remittance) return

    ;(remittance as any).status = 'COMPLETED'
    await (remittance as any).save()

    const countryLabel = COUNTRY_NAMES[(remittance as any).recipientCountry] ?? (remittance as any).recipientCountry

    await sendTextMessage(
      (remittance as any).senderPhone,
      `✅ *Transfer confirmed!*\n\n` +
        `📤 ${(remittance as any).sendAmount.toLocaleString()} XAF sent\n` +
        `📱 Recipient: ${(remittance as any).recipientPhone}\n` +
        `🌍 ${countryLabel}\n` +
        `💰 Amount received: ${(remittance as any).receiveAmount.toLocaleString()} ${(remittance as any).receiveCurrency}\n\n` +
        `Thank you for using KoboKall!`,
    )

    logger.info(`[KoboKall] Remittance ${remittanceId} completed`)
  }

  async onRemittanceFailed(remittanceId: string, failureCode: string): Promise<void> {
    const remittance = await KoboKallRemittance.findOne({ remittanceId })
    if (!remittance) return

    ;(remittance as any).status = 'FAILED'
    ;(remittance as any).failureCode = failureCode
    await (remittance as any).save()

    await sendTextMessage(
      (remittance as any).senderPhone,
      `❌ *Transfer failed*\n\nCode: ${failureCode}\nPlease try again or contact support.`,
    )

    logger.info(`[KoboKall] Remittance ${remittanceId} failed: ${failureCode}`)
  }

  async cancelRemittance(remittanceId: string, phone: string): Promise<void> {
    const remittance = await KoboKallRemittance.findOne({ remittanceId })
    if (!remittance || (remittance as any).senderPhone !== phone) return
    if ((remittance as any).status !== 'INITIATED') return

    ;(remittance as any).status = 'CANCELLED'
    await (remittance as any).save()

    await sendTextMessage(phone, `↩️ Transfer cancelled.`)
    logger.info(`[KoboKall] Remittance ${remittanceId} cancelled`)
  }

  async handleMessage(phone: string, message: string, remittanceId: string): Promise<void> {
    if (message.trim().toLowerCase() === 'cancel') {
      await this.cancelRemittance(remittanceId, phone)
    }
  }
}

export const kobokallService = new KoboKallService()
