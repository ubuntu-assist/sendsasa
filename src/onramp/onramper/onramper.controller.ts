import { Controller, Post, Get, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import logger from '@common/utils/logger'
import { OnramperService, OnramperWebhookPayload } from './onramper.service'
import { WhatsAppService } from '@messaging/whatsapp/whatsapp.service'

@Controller('onramper')
export class OnramperController {
  constructor(
    private readonly onramper: OnramperService,
    private readonly wa: WhatsAppService,
  ) {}

  @Post('webhook')
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    const signature = req.headers['x-onramper-webhook-signature'] as string

    if (!signature) {
      logger.error('[Onramper] Webhook received without signature header')
      res.status(401).json({ error: 'Missing signature' })
      return
    }

    if (!this.onramper.verifyWebhookSignature(signature, req.body as Buffer)) {
      logger.error('[Onramper] Webhook signature mismatch')
      res.status(401).json({ error: 'Invalid signature' })
      return
    }

    let payload: OnramperWebhookPayload
    try {
      payload = JSON.parse((req.body as Buffer).toString())
    } catch {
      res.status(400).json({ error: 'Invalid JSON' })
      return
    }

    res.json({ received: true })

    setImmediate(async () => {
      try {
        const { whatsappId, phoneNumber, status } =
          await this.onramper.handleWebhookPayload(payload)

        if (!phoneNumber) {
          logger.info(
            `[Onramper] Webhook for unknown partnerContext: ${payload.partnerContext}`,
          )
          return
        }

        if (status === 'completed') {
          await this.wa.sendTextMessage(
            phoneNumber,
            `✅ *Purchase Complete!*\n\nYou received *${payload.outAmount} USDC* on Base network.\n\nIt's now in your SendSasa wallet. Type *balance* to check or *send* to send it.`,
          )
        } else if (status === 'failed' || status === 'canceled') {
          const reason = payload.statusReason
            ? `\nReason: ${payload.statusReason}`
            : ''
          await this.wa.sendTextMessage(
            phoneNumber,
            `❌ *Purchase ${status === 'canceled' ? 'Canceled' : 'Failed'}*\n\nYour crypto purchase did not complete.${reason}\n\nType *buy* to try again.`,
          )
        }

        logger.info(
          `[Onramper] Processed webhook: ${payload.transactionId} → ${status} for ${whatsappId ?? 'unknown'}`,
        )
      } catch (err) {
        logger.error('[Onramper] Webhook processing error:', err)
      }
    })
  }

  @Get('success')
  success(@Res() res: Response) {
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>✅ Purchase Complete!</h2>
        <p>Your USDC has been sent to your SendSasa wallet.</p>
        <p>Return to WhatsApp and type <strong>balance</strong> to confirm.</p>
      </body></html>
    `)
  }

  @Get('failure')
  failure(@Res() res: Response) {
    res.send(`
      <html><body style="font-family:sans-serif;text-align:center;padding:40px">
        <h2>❌ Purchase Failed</h2>
        <p>Your purchase was not completed.</p>
        <p>Return to WhatsApp and type <strong>buy</strong> to try again.</p>
      </body></html>
    `)
  }
}
