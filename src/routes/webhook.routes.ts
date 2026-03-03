import express, { Request, Response } from 'express'
import { WhatsAppWebhookPayload, WhatsAppMessage } from '../types'
import {
  handleMessage,
  handleButtonClick,
} from '../services/message-handler.service'
import config from '../utils/config'

const router = express.Router()

function formatWhatsAppIdToPhone(whatsappId: string): string {
  return whatsappId.startsWith('+') ? whatsappId : `+${whatsappId}`
}

router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  const VERIFY_TOKEN = config.VERIFY_TOKEN

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('Webhook verified')
    res.status(200).send(challenge)
  } else {
    console.log('Webhook verification failed')
    res.sendStatus(403)
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    const payload: WhatsAppWebhookPayload = req.body

    res.sendStatus(200)

    if (payload.object !== 'whatsapp_business_account') {
      console.log('Not a WhatsApp Business webhook')
      return
    }

    for (const entry of payload.entry) {
      for (const change of entry.changes) {
        if (change.field === 'messages') {
          await processMessages(change.value)
        }
      }
    }
  } catch (error) {
    console.error('Webhook error:', error)
  }
})

async function processMessages(value: any): Promise<void> {
  const { messages, contacts } = value

  if (!messages || messages.length === 0) {
    return
  }

  let username: string | undefined
  if (contacts && contacts.length > 0 && contacts[0].profile?.name) {
    username = contacts[0].profile.name
  }

  for (const message of messages) {
    await processSingleMessage(message, username)
  }
}

async function processSingleMessage(
  message: WhatsAppMessage,
  username?: string,
): Promise<void> {
  const whatsappId = message.from
  const phoneNumber = formatWhatsAppIdToPhone(whatsappId)

  console.log(`\n📨 New message from ${phoneNumber}`)
  console.log(`Type: ${message.type}`)

  try {
    switch (message.type) {
      case 'text':
        await handleTextMessage(whatsappId, phoneNumber, message, username)
        break

      case 'interactive':
        await handleInteractiveMessage(whatsappId, phoneNumber, message)
        break

      case 'button':
        await handleButtonMessage(whatsappId, phoneNumber, message)
        break

      default:
        console.log(`Unsupported message type: ${message.type}`)
    }
  } catch (error) {
    console.error(`Error processing message:`, error)
  }
}

async function handleTextMessage(
  whatsappId: string,
  phoneNumber: string,
  message: WhatsAppMessage,
  username?: string,
): Promise<void> {
  const messageText = message.text.body
  await handleMessage(whatsappId, phoneNumber, messageText, username)
}

async function handleInteractiveMessage(
  whatsappId: string,
  phoneNumber: string,
  message: any,
): Promise<void> {
  if (message.interactive?.type === 'button_reply') {
    const buttonId = message.interactive.button_reply.id
    await handleButtonClick(whatsappId, phoneNumber, buttonId)
  }
}

async function handleButtonMessage(
  whatsappId: string,
  phoneNumber: string,
  message: any,
): Promise<void> {
  const buttonId = message.button?.payload || message.button?.text
  if (buttonId) {
    await handleButtonClick(whatsappId, phoneNumber, buttonId)
  }
}

export default router
