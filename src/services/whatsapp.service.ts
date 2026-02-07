import axios from 'axios'
import { WhatsAppTextMessage, WhatsAppInteractiveMessage } from '../types'
import { AppError } from '../middleware/error-handler'
import config from '../utils/config'

const WHATSAPP_API_URL = config.WHATSAPP_API_URL!
const PHONE_NUMBER_ID = config.PHONE_NUMBER_ID!
const ACCESS_TOKEN = config.ACCESS_TOKEN!

export async function sendTextMessage(
  to: string,
  message: string,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload: WhatsAppTextMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'text',
    text: {
      preview_url: false,
      body: message,
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Message sent to ${to}`)
  } catch (error) {
    console.error('Error sending WhatsApp message:', error)
    throw new AppError('Failed to send WhatsApp message', 503)
  }
}

export async function sendConfirmationButtons(
  to: string,
  bodyText: string,
  confirmId: string,
  cancelId: string,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload: WhatsAppInteractiveMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
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
              title: 'Confirm',
            },
          },
          {
            type: 'reply',
            reply: {
              id: cancelId,
              title: 'Cancel',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Confirmation buttons sent to ${to}`)
  } catch (error) {
    console.error('Error sending buttons:', error)
    throw new AppError('Failed to send confirmation buttons', 503)
  }
}

export async function sendPaymentRequestButtons(
  to: string,
  requester: string,
  amount: number,
  requestId: string,
): Promise<void> {
  const bodyText =
    `Payment Request\n\n` +
    `From: ${requester}\n` +
    `Amount: ${amount} XRP\n\n` +
    `Choose an action:`

  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload: WhatsAppInteractiveMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
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

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Payment request sent to ${to}`)
  } catch (error) {
    console.error('Error sending payment request:', error)
    throw new AppError('Failed to send payment request', 503)
  }
}

export async function sendActionMenu(to: string): Promise<void> {
  const bodyText = 'What would you like to do?'

  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload: WhatsAppInteractiveMessage = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
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
              id: 'action_balance',
              title: 'Balance',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'action_history',
              title: 'History',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'action_help',
              title: 'Help',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Action menu sent to ${to}`)
  } catch (error) {
    console.error('Error sending action menu:', error)
    throw new AppError('Failed to send action menu', 503)
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  try {
    await axios.post(
      url,
      {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
      },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        timeout: 5000,
      },
    )

    console.log(`Message ${messageId} marked as read`)
  } catch (error) {
    console.error('Error marking message as read:', error)
  }
}
