// src/routes/webhook.routes.ts

import { Router } from 'express'
import {
  handleMessage,
  handleInteraction,
  handleFlowResponse,
} from '../services/message-handler.service'
import config from '../utils/config'

const router = Router()

/**
 * WhatsApp Webhook Verification (GET)
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
    console.log('✅ Webhook verified')
    res.status(200).send(challenge)
  } else {
    console.error('❌ Webhook verification failed')
    res.sendStatus(403)
  }
})

/**
 * WhatsApp Webhook (POST) - Handle incoming messages
 */
router.post('/', async (req, res) => {
  try {
    const body = req.body

    // Quick 200 response
    res.sendStatus(200)

    // Validate webhook
    if (body.object !== 'whatsapp_business_account') {
      console.log('❌ Not a WhatsApp Business webhook')
      return
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value) {
      console.log('❌ No value in webhook')
      return
    }

    const messages = value.messages
    const contacts = value.contacts

    if (!messages || messages.length === 0) {
      // Status update or other event
      return
    }

    const message = messages[0]
    const contact = contacts?.[0]
    const whatsappId = message.from
    const phoneNumber = `+${whatsappId}`
    const profileName = contact?.profile?.name

    console.log(`📨 Message from ${profileName} (${whatsappId})`)

    // Handle different message types
    if (message.type === 'text') {
      await handleMessage(whatsappId, phoneNumber, profileName)
    } else if (message.type === 'interactive') {
      // Button or list reply or flow response
      const interactive = message.interactive

      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id
        await handleInteraction(whatsappId, phoneNumber, buttonId, profileName)
      } else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id
        await handleInteraction(whatsappId, phoneNumber, listId, profileName)
      } else if (interactive.type === 'nfm_reply') {
        // WhatsApp Flow response
        await handleFlowResponse(whatsappId, phoneNumber, interactive.nfm_reply)
      }
    }
  } catch (error) {
    console.error('❌ Webhook error:', error)
  }
})

export default router
