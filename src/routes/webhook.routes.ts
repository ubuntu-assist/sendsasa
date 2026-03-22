import { Router } from 'express'
import {
  handleMessage,
  handleInteraction,
  handleFlowResponse,
} from '../services/message-handler.service'
import config from '../utils/config'
import { markAsReadWithTyping } from '../services/whatsapp.service'

const router = Router()

router.get('/', (req, res) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === config.VERIFY_TOKEN) {
    console.log('Webhook verified')
    res.status(200).send(challenge)
  } else {
    console.error('Webhook verification failed')
    res.sendStatus(403)
  }
})

router.post('/', async (req, res) => {
  try {
    const body = req.body

    res.sendStatus(200)

    if (body.object !== 'whatsapp_business_account') {
      return
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value) {
      return
    }

    const messages = value.messages
    const contacts = value.contacts

    if (!messages || messages.length === 0) {
      return
    }

    const message = messages[0]
    const contact = contacts?.[0]
    const whatsappId = message.from
    const phoneNumber = `+${whatsappId}`
    const profileName = contact?.profile?.name

    await markAsReadWithTyping(message.id)

    if (message.type === 'text') {
      await handleMessage(whatsappId, phoneNumber, profileName)
    } else if (message.type === 'interactive') {
      const interactive = message.interactive

      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id
        await handleInteraction(whatsappId, phoneNumber, buttonId, profileName)
      } else if (interactive.type === 'list_reply') {
        const listId = interactive.list_reply.id
        await handleInteraction(whatsappId, phoneNumber, listId, profileName)
      } else if (interactive.type === 'nfm_reply') {
        await handleFlowResponse(whatsappId, phoneNumber, interactive.nfm_reply)
      }
    }
  } catch (error) {
    console.error('Webhook error:', error)
  }
})

export default router
