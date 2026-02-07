import { Router, Request, Response } from 'express'
import { WhatsAppWebhookPayload } from '../types'
import {
  handleMessage,
  handleButtonClick,
} from '../services/message-handler.service'
import { markMessageAsRead } from '../services/whatsapp.service'
import { asyncHandler } from '../middleware/error-handler'
import { webhookLimiter } from '../middleware/rate-limiter'
import config from '../utils/config'

const router = Router()

router.get('/whatsapp', (req: Request, res: Response) => {
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

router.post(
  '/whatsapp',
  webhookLimiter,
  asyncHandler(async (req: Request, res: Response) => {
    const payload: WhatsAppWebhookPayload = req.body

    console.log('\nWebhook received')

    res.sendStatus(200)

    try {
      if (payload.object !== 'whatsapp_business_account') {
        return
      }

      for (const entry of payload.entry) {
        for (const change of entry.changes) {
          const value = change.value

          if (value.messages && value.messages.length > 0) {
            for (const message of value.messages) {
              const whatsappId = message.from
              const phoneNumber = message.from

              await markMessageAsRead(message.id)

              if (message.type === 'text') {
                const messageText = message.text.body
                await handleMessage(whatsappId, phoneNumber, messageText)
              } else if (
                message.type === 'interactive' ||
                message.type === 'button'
              ) {
                const buttonMessage = message as any
                const buttonId =
                  buttonMessage.interactive?.button_reply?.id ||
                  buttonMessage.button?.payload

                if (buttonId) {
                  await handleButtonClick(whatsappId, phoneNumber, buttonId)
                }
              }
            }
          }

          if (value.statuses && value.statuses.length > 0) {
            for (const status of value.statuses) {
              console.log(`Message ${status.id} status: ${status.status}`)
            }
          }
        }
      }
    } catch (error) {
      console.error('Error processing webhook:', error)
    }
  }),
)

export default router
