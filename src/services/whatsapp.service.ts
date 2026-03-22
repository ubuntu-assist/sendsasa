// src/services/whatsapp.service.ts
import axios from 'axios'
import dotenv from 'dotenv'
import config from '../utils/config'

dotenv.config()

const WHATSAPP_API_URL = `${config.WHATSAPP_API_URL}/${config.PHONE_NUMBER_ID}/messages`
const WHATSAPP_TOKEN = config.ACCESS_TOKEN

/**
 * WhatsApp Service
 *
 * Handles all WhatsApp API communication including:
 * - Text messages
 * - Interactive messages (buttons, lists, flows)
 * - Document/media sending
 */

export class WhatsAppService {
  /**
   * Generic sendMessage - works with any WhatsApp message payload
   * Used by FlowLauncherService to send flow messages
   */
  static async sendMessage(payload: any): Promise<void> {
    try {
      await axios.post(WHATSAPP_API_URL, payload, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
        timeout: 10000,
      })

      console.log(`✅ Message sent to ${payload.to}`)
    } catch (error) {
      console.error('❌ Error sending WhatsApp message:', error)
      throw new Error('Failed to send WhatsApp message')
    }
  }

  /**
   * Send text message
   */
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
}

/**
 * Legacy named exports for backwards compatibility
 */
export const sendTextMessage =
  WhatsAppService.sendTextMessage.bind(WhatsAppService)
export const sendMessage = WhatsAppService.sendMessage.bind(WhatsAppService)

/**
 * Send confirmation buttons (REPLY BUTTONS)
 */
export async function sendConfirmationButtons(
  to: string,
  bodyText: string,
  confirmId: string,
  cancelId: string,
): Promise<void> {
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
              id: confirmId,
              title: '✅ Confirm',
            },
          },
          {
            type: 'reply',
            reply: {
              id: cancelId,
              title: '❌ Cancel',
            },
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

/**
 * Send payment request buttons (REPLY BUTTONS with currency support)
 */
export async function sendPaymentRequestButtons(
  to: string,
  requester: string,
  amount: number,
  requestId: string,
  currency: string = 'XRP',
): Promise<void> {
  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'

  const bodyText =
    `💰 Payment Request\n\n` +
    `From: ${requester}\n` +
    `Amount: ${currencyEmoji} ${amount} ${currency}\n\n` +
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
              title: '✅ Approve',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `reject_${requestId}`,
              title: '❌ Reject',
            },
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

/**
 * Send document using WhatsApp media ID (for receipts)
 */
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

/**
 * Send document using URL (alternative method)
 */
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

/**
 * Send image using media ID
 */
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

/**
 * Mark message as read
 */
export async function markMessageAsRead(messageId: string): Promise<void> {
  try {
    await axios.post(
      WHATSAPP_API_URL,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        },
        timeout: 5000,
      },
    )

    console.log(`✅ Message ${messageId} marked as read`)
  } catch (error) {
    // Non-critical error, just log
    console.error('⚠️  Error marking message as read:', error)
  }
}
