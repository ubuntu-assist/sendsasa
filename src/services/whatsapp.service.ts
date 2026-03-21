import axios from 'axios'
import config from '../utils/config'

const WHATSAPP_API_URL = `${config.WHATSAPP_API_URL}/${config.PHONE_NUMBER_ID}/messages`
const WHATSAPP_TOKEN = config.ACCESS_TOKEN

export async function sendTextMessage(
  to: string,
  message: string,
): Promise<void> {
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

  try {
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      timeout: 10000,
    })
  } catch (error) {
    console.error('❌ Error sending WhatsApp message:', error)
    throw new Error('Failed to send WhatsApp message')
  }
}

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
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      timeout: 10000,
    })
  } catch (error) {
    console.error('❌ Error sending buttons:', error)
    throw new Error('Failed to send confirmation buttons')
  }
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

  try {
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      timeout: 10000,
    })
  } catch (error) {
    console.error('❌ Error sending payment request:', error)
    throw new Error('Failed to send payment request')
  }
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

  try {
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      timeout: 10000,
    })
  } catch (error) {
    console.error('❌ Error sending document:', error)
    throw new Error('Failed to send document')
  }
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

  try {
    await axios.post(WHATSAPP_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      },
      timeout: 10000,
    })
  } catch (error) {
    console.error('❌ Error sending document:', error)
    throw new Error('Failed to send document')
  }
}

export async function markMessageAsRead(messageId: string): Promise<void> {
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
    console.error('⚠️  Error marking message as read:', error)
  }
}
