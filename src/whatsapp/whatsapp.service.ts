import { Injectable } from '@nestjs/common'
import axios from 'axios'
import dotenv from 'dotenv'
import config from '../utils/config'

dotenv.config()

const WHATSAPP_API_URL = `${config.WHATSAPP_API_URL}/${config.PHONE_NUMBER_ID}/messages`
const WHATSAPP_TOKEN = config.ACCESS_TOKEN

@Injectable()
export class WhatsAppService {
  static async sendMessage(payload: any): Promise<void> {
    try {
      await axios.post(WHATSAPP_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
        timeout: 10000,
      })
    } catch (error: any) {
      const metaError = error?.response?.data
      if (metaError) {
        console.error('❌ WhatsApp API error:', JSON.stringify(metaError))
      } else {
        console.error('❌ Error sending WhatsApp message:', error?.message ?? error)
      }
      throw new Error('Failed to send WhatsApp message')
    }
  }

  static async sendTextMessage(to: string, message: string): Promise<void> {
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: false,
        body: message,
      },
    }

    await WhatsAppService.sendMessage(payload)
  }

  static async markAsReadWithTyping(messageId: string): Promise<void> {
    try {
      await axios.post(
        WHATSAPP_API_URL,
        {
          messaging_product: 'whatsapp',
          status: 'read',
          message_id: messageId,
          typing_indicator: {
            type: 'text',
          },
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${WHATSAPP_TOKEN}`,
          },
          timeout: 5000,
        },
      )
    } catch (error) {
      console.error(
        '⚠️ Error marking message as read / showing typing indicator:',
        error,
      )
    }
  }

  sendMessage(payload: any) { return WhatsAppService.sendMessage(payload) }
  sendTextMessage(to: string, message: string) { return WhatsAppService.sendTextMessage(to, message) }
  markAsReadWithTyping(messageId: string) { return WhatsAppService.markAsReadWithTyping(messageId) }
  sendCardPaymentTypeButtons(to: string) { return sendCardPaymentTypeButtons(to) }
  sendPaymentRequestButtons(to: string, requester: string, amount: number, requestId: string, currency?: string) { return sendPaymentRequestButtons(to, requester, amount, requestId, currency) }
  sendDocumentByMediaId(to: string, mediaId: string, filename: string, caption: string) { return sendDocumentByMediaId(to, mediaId, filename, caption) }
  sendDocumentByUrl(to: string, url: string, filename: string, caption: string) { return sendDocumentByUrl(to, url, filename, caption) }
  sendImageByMediaId(to: string, mediaId: string, caption?: string) { return sendImageByMediaId(to, mediaId, caption) }
  sendCtaUrlButton(to: string, bodyText: string, buttonLabel: string, url: string) { return sendCtaUrlButton(to, bodyText, buttonLabel, url) }
}

export const sendTextMessage =
  WhatsAppService.sendTextMessage.bind(WhatsAppService)
export const sendMessage = WhatsAppService.sendMessage.bind(WhatsAppService)
export const markAsReadWithTyping =
  WhatsAppService.markAsReadWithTyping.bind(WhatsAppService)

export async function sendCardPaymentTypeButtons(to: string): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: '💳 *Send Money via Card*\n\nHow would you like to pay?\n\n• *Pay with Card* — any debit card, works everywhere\n• *Apple / Google Pay* — native wallet, US phone required',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'card_pay_hosted', title: 'Pay with Card' },
          },
          {
            type: 'reply',
            reply: { id: 'card_pay_headless', title: 'Apple / Google Pay' },
          },
        ],
      },
    },
  }
  await WhatsAppService.sendMessage(payload)
}

export async function sendPaymentRequestButtons(
  to: string,
  requester: string,
  amount: number,
  requestId: string,
  currency: string = 'XRP',
): Promise<void> {
  const bodyText =
    `Payment Request\n\n` +
    `From: ${requester}\n` +
    `Amount: ${amount} ${currency}\n\n` +
    `Do you want to approve this request?`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: bodyText,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `approve_${requestId}`,
              title: 'Approve',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `reject_${requestId}`,
              title: 'Reject',
            },
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendDocumentByMediaId(
  to: string,
  mediaId: string,
  filename: string,
  caption: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: {
      id: mediaId,
      filename: filename,
      caption: caption,
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendDocumentByUrl(
  to: string,
  documentUrl: string,
  filename: string,
  caption: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'document',
    document: {
      link: documentUrl,
      filename: filename,
      caption: caption,
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendImageByMediaId(
  to: string,
  mediaId: string,
  caption?: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'image',
    image: {
      id: mediaId,
      ...(caption && { caption }),
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendCtaUrlButton(
  to: string,
  bodyText: string,
  buttonLabel: string,
  url: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'cta_url',
      body: { text: bodyText },
      action: {
        name: 'cta_url',
        parameters: {
          display_text: buttonLabel,
          url,
        },
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendSupportContact(to: string): Promise<void> {
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'contacts',
    contacts: [
      {
        name: {
          formatted_name: 'SendSasa Support',
          first_name: 'SendSasa',
          last_name: 'Support',
        },
        org: { company: 'SendSasa' },
        phones: [
          { phone: '+237676535501', type: 'WhatsApp', wa_id: '237676535501' },
        ],
        urls: [{ url: 'https://sendsasa.com', type: 'Company' }],
      },
    ],
  })
}
