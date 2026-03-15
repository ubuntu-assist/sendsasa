import express, { Request, Response } from 'express'
import {
  handleMessage,
  handleButtonClick,
} from '../services/message-handler.service'

const router = express.Router()

router.get('/', (req: Request, res: Response) => {
  const mode = req.query['hub.mode']
  const token = req.query['hub.verify_token']
  const challenge = req.query['hub.challenge']

  if (mode === 'subscribe' && token === process.env.WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ Webhook verified')
    res.status(200).send(challenge)
  } else {
    console.error('❌ Webhook verification failed')
    res.sendStatus(403)
  }
})

router.post('/', async (req: Request, res: Response) => {
  try {
    res.sendStatus(200)

    const body = req.body

    if (body.object !== 'whatsapp_business_account') {
      console.log('⚠️ Not a WhatsApp message')
      return
    }

    const entry = body.entry?.[0]
    const changes = entry?.changes?.[0]
    const value = changes?.value

    if (!value?.messages?.[0]) {
      console.log('⚠️ No message in webhook')
      return
    }

    const message = value.messages[0]
    const from = message.from
    const whatsappId = from

    const profileName = value.contacts?.[0]?.profile?.name

    console.log('\n📨 Incoming webhook:', {
      type: message.type,
      from: from,
      messageId: message.id,
      profileName,
    })

    if (message.type === 'text') {
      const text = message.text.body
      await handleMessage(whatsappId, from, text, profileName)
    } else if (message.type === 'interactive') {
      const interactive = message.interactive

      if (interactive.type === 'button_reply') {
        const buttonId = interactive.button_reply.id
        console.log('🔘 Button clicked:', buttonId)
        await handleButtonClick(whatsappId, from, buttonId, profileName)
      } else if (interactive.type === 'list_reply') {
        const listReply = interactive.list_reply
        const rowId = listReply.id
        const title = listReply.title

        console.log('📋 List item selected:', {
          id: rowId,
          title: title,
          description: listReply.description,
        })

        await handleButtonClick(whatsappId, from, rowId, profileName)
      }
    } else if (message.type === 'button') {
      console.log('⚠️ Legacy button type received')
    } else {
      console.log(`⚠️ Unsupported message type: ${message.type}`)
    }
  } catch (error) {
    console.error('❌ Webhook error:', error)
  }
})

export default router
