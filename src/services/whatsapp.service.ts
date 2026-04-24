import axios from 'axios'
import dotenv from 'dotenv'
import config from '../utils/config'

dotenv.config()

const WHATSAPP_API_URL = `${config.WHATSAPP_API_URL}/${config.PHONE_NUMBER_ID}/messages`
const WHATSAPP_TOKEN = config.ACCESS_TOKEN

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
