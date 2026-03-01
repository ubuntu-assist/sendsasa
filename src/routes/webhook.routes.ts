import { Router, Request, Response } from 'express'
import {
  WhatsAppWebhookPayload,
  InteractiveMessage,
  ButtonMessage,
  WhatsAppMessage,
} from '../types'
import {
  handleMessage,
  handleButtonClick,
} from '../services/message-handler.service'
import { markMessageAsRead } from '../services/whatsapp.service'
import { asyncHandler } from '../middleware/error-handler'
import { webhookLimiter } from '../middleware/rate-limiter'

const router = Router()

function formatWhatsAppIdToPhone(whatsappId: string): string {
  return whatsappId.startsWith('+') ? whatsappId : `+${whatsappId}`
}

router.get('/whatsapp', (req: Request, res: Response) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const VERIFY_TOKEN = process.env.WHATSAPP_VERIFY_TOKEN

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified')
    res.status(200).send(challenge)
  } else {
    console.log('Webhook verification failed')
    res.sendStatus(403)
  }
})

async function processSingleMessage(message: WhatsAppMessage): Promise<void> {
  const whatsappId = message.from
  const phoneNumber = formatWhatsAppIdToPhone(whatsappId)

  await markMessageAsRead(message.id)

  if (message.type === 'text') {
    await handleTextMessage(whatsappId, phoneNumber, message)
  } else if (message.type === 'interactive') {
    await handleInteractiveMessage(whatsappId, phoneNumber, message)
  } else if (message.type === 'button') {
    await handleButtonMessage(whatsappId, phoneNumber, message)
  }
}

async function handleTextMessage(
  whatsappId: string,
  phoneNumber: string,
  message: WhatsAppMessage,
): Promise<void> {
  const messageText = message.text.body
  await handleMessage(whatsappId, phoneNumber, messageText)
}

async function handleInteractiveMessage(
  whatsappId: string,
  phoneNumber: string,
  message: WhatsAppMessage,
): Promise<void> {
  const interactiveMessage = message as unknown as InteractiveMessage
  const buttonId = interactiveMessage.interactive?.button_reply?.id

  if (buttonId) {
    await handleButtonClick(whatsappId, phoneNumber, buttonId)
  }
}

async function handleButtonMessage(
  whatsappId: string,
  phoneNumber: string,
  message: WhatsAppMessage,
): Promise<void> {
  const buttonMessage = message as unknown as ButtonMessage
  const buttonId = buttonMessage.button?.payload

  if (buttonId) {
    await handleButtonClick(whatsappId, phoneNumber, buttonId)
  }
}

function processStatusUpdates(
  statuses: Array<{
    id: string
    status: string
    timestamp: string
    recipient_id: string
  }>,
): void {
  for (const status of statuses) {
    console.log(`Message ${status.id}: ${status.status}`)

    if (status.status === 'failed') {
      console.error(`Message delivery failed: ${status.id}`)
    }
  }
}

async function processWebhookMessages(
  payload: WhatsAppWebhookPayload,
): Promise<void> {
  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      const value = change.value

      if (value.messages && value.messages.length > 0) {
        for (const message of value.messages) {
          await processSingleMessage(message)
        }
      }

      if (value.statuses && value.statuses.length > 0) {
        processStatusUpdates(value.statuses)
      }
    }
  }
}

router.post(
  '/whatsapp',
  webhookLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const payload: WhatsAppWebhookPayload = req.body

    console.log('\n📨 Webhook received')

    res.sendStatus(200)

    if (payload.object !== 'whatsapp_business_account') {
      return
    }

    try {
      await processWebhookMessages(payload)
    } catch (error) {
      console.error('Error processing webhook:', error)
    }
  }),
)

export default router
