import { Controller, Get, Post, Req, Res, UseGuards, UseInterceptors } from '@nestjs/common'
import type { Request, Response } from 'express'
import { MessageHandlerService } from './message-handler.service'
import { WhatsAppService } from '@messaging/whatsapp/whatsapp.service'
import { consumeUserToken } from '@common/middleware/rate-limiter'
import config from '@common/utils/config'
import { WebhookSignatureGuard } from '@core/guards/webhook-signature.guard'
import { LoggingInterceptor } from '@core/interceptors/logging.interceptor'

@UseInterceptors(LoggingInterceptor)
@Controller('webhook')
export class WebhookController {
  constructor(
    private readonly messageHandler: MessageHandlerService,
    private readonly wa: WhatsAppService,
  ) {}

  @Get()
  verify(@Req() req: Request, @Res() res: Response) {
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
  }

  @Post()
  @UseGuards(WebhookSignatureGuard)
  async receive(@Req() req: Request, @Res() res: Response) {
    try {
      const body = req.body
      res.sendStatus(200)

      if (body.object !== 'whatsapp_business_account') return

      const entry = body.entry?.[0]
      const changes = entry?.changes?.[0]
      const value = changes?.value

      if (!value) return

      const messages = value.messages
      const contacts = value.contacts

      if (!messages || messages.length === 0) return

      const message = messages[0]
      const contact = contacts?.[0]
      const whatsappId = message.from
      const phoneNumber = `+${whatsappId}`
      const profileName = contact?.profile?.name

      await this.wa.markAsReadWithTyping(message.id)

      if (!consumeUserToken(whatsappId)) {
        await this.wa.sendTextMessage(whatsappId, '⚠️ You\'re sending messages too quickly. Please wait a moment before trying again.')
        return
      }

      if (message.type === 'text') {
        await this.messageHandler.handleMessage(whatsappId, phoneNumber, profileName, message.text?.body)
      } else if (message.type === 'interactive') {
        const interactive = message.interactive

        if (interactive.type === 'button_reply') {
          await this.messageHandler.handleInteraction(whatsappId, phoneNumber, interactive.button_reply.id, profileName)
        } else if (interactive.type === 'list_reply') {
          await this.messageHandler.handleInteraction(whatsappId, phoneNumber, interactive.list_reply.id, profileName)
        } else if (interactive.type === 'nfm_reply') {
          await this.messageHandler.handleFlowResponse(whatsappId, phoneNumber, interactive.nfm_reply)
        }
      }
    } catch (error) {
      console.error('Webhook error:', error)
    }
  }
}
