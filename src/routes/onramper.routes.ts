import { Router, Request, Response } from 'express'
import logger from '../utils/logger'
import { verifyWebhookSignature, handleWebhookPayload, OnramperWebhookPayload } from '../services/onramper.service'
import { sendTextMessage } from '../services/whatsapp.service'

const router = Router()

// ── Webhook — receives raw body (registered before express.json() in app.ts) ──

router.post('/webhook', async (req: Request, res: Response) => {
  const signature = req.headers['x-onramper-webhook-signature'] as string

  if (!signature) {
    logger.error('[Onramper] Webhook received without signature header')
    res.status(401).json({ error: 'Missing signature' })
    return
  }

  if (!verifyWebhookSignature(signature, req.body as Buffer)) {
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

  // Acknowledge immediately — Onramper expects a fast 200
  res.json({ received: true })

  // Process asynchronously so we don't block the response
  setImmediate(async () => {
    try {
      const { whatsappId, phoneNumber, status } = await handleWebhookPayload(payload)

      if (!phoneNumber) {
        logger.info(`[Onramper] Webhook for unknown partnerContext: ${payload.partnerContext}`)
        return
      }

      if (status === 'completed') {
        await sendTextMessage(
          phoneNumber,
          `✅ *Purchase Complete!*\n\nYou received *${payload.outAmount} USDC* on Base network.\n\nIt's now in your SendSasa wallet. Type *balance* to check or *send* to send it.`,
        )
      } else if (status === 'failed' || status === 'canceled') {
        const reason = payload.statusReason ? `\nReason: ${payload.statusReason}` : ''
        await sendTextMessage(
          phoneNumber,
          `❌ *Purchase ${status === 'canceled' ? 'Canceled' : 'Failed'}*\n\nYour crypto purchase did not complete.${reason}\n\nType *buy* to try again.`,
        )
      }

      logger.info(`[Onramper] Processed webhook: ${payload.transactionId} → ${status} for ${whatsappId ?? 'unknown'}`)
    } catch (err) {
      logger.error('[Onramper] Webhook processing error:', err)
    }
  })
})

// ── Redirect callbacks (browser redirects back here after purchase) ──────────

router.get('/success', (_req: Request, res: Response) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>✅ Purchase Complete!</h2>
      <p>Your USDC has been sent to your SendSasa wallet.</p>
      <p>Return to WhatsApp and type <strong>balance</strong> to confirm.</p>
    </body></html>
  `)
})

router.get('/failure', (_req: Request, res: Response) => {
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:40px">
      <h2>❌ Purchase Failed</h2>
      <p>Your purchase was not completed.</p>
      <p>Return to WhatsApp and type <strong>buy</strong> to try again.</p>
    </body></html>
  `)
})

export default router
