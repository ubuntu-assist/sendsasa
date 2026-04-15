/**
 * Coinbase Onramp — Return URL Handler + Payment Poller
 *
 * Two detection mechanisms for completed card payments:
 *
 * 1. GET /coinbase/return?ref=<OnRampTransaction_id>
 *    Fast-path: Coinbase redirects the user's browser here after payment.
 *    We check status immediately and process the payout.
 *    Shows a simple HTML page to the user.
 *
 * 2. pollPendingOnRampTransactions()
 *    Cron fallback: runs every 2 minutes, checks all pending sessions
 *    against the Transaction Status API. Catches cases where the user
 *    closed the browser before the redirect fired.
 */

import { Router, Request, Response } from 'express'
import { getTransactionStatus, SESSION_EXPIRY_MS } from '../services/coinbase-onramp.service'
import { OnRampTransaction } from '../models/OnRampTransaction'
import { mobileMoneyService, PROVIDER_DISPLAY } from '../services/mobile-money.service'
import { sendTextMessage } from '../services/whatsapp.service'
import logger from '../utils/logger'

const router = Router()

// ── Shared payout executor ────────────────────────────────────────────────────

async function executeOnRampPayout(onRampId: string, txHash?: string): Promise<void> {
  const onRamp = await OnRampTransaction.findById(onRampId)
  if (!onRamp || onRamp.status !== 'pending') return

  if (txHash) onRamp.cryptoTxHash = txHash
  onRamp.status = 'payment_received'
  await onRamp.save()

  const refId = (onRamp._id as { toString(): string }).toString()

  try {
    onRamp.status = 'payout_initiated'
    await onRamp.save()

    const result = await mobileMoneyService.payout({
      provider: onRamp.mmProvider,
      recipientPhone: onRamp.recipientPhone,
      amount: onRamp.xafAmount,
      currency: 'XAF',
      reference: refId,
      description: `SendSasa card payment — ref ${refId}`,
    })

    if (result.success) {
      onRamp.status = 'completed'
      onRamp.completedAt = new Date()
      await onRamp.save()

      logger.info(`[Coinbase] Payout completed: ${onRamp.xafAmount} XAF → ${onRamp.recipientPhone}`)

      await sendTextMessage(
        onRamp.senderPhone,
        `✅ *Payment Successful!*\n\n` +
        `Your card payment of $${onRamp.totalUSDCharged.toFixed(2)} was received.\n\n` +
        `*${onRamp.xafAmount.toLocaleString()} XAF* sent to:\n` +
        `📱 ${onRamp.recipientPhone}\n` +
        `via ${PROVIDER_DISPLAY[onRamp.mmProvider]}\n\n` +
        `Reference: ${refId}`,
      )
    } else {
      throw new Error(result.message || 'Payout failed')
    }
  } catch (err) {
    onRamp.status = 'failed'
    onRamp.failureReason = (err as Error).message
    await onRamp.save()

    logger.info(`[Coinbase] Payout failed: ${(err as Error).message}`)

    await sendTextMessage(
      onRamp.senderPhone,
      `❌ *Payment Received, Payout Failed*\n\n` +
      `We received your $${onRamp.totalUSDCharged.toFixed(2)} — payout failed.\n` +
      `Our team will process it manually within 24 hours.\n` +
      `Reference: ${refId}`,
    ).catch(() => {/* non-critical */})
  }
}

// ── GET /coinbase/return ──────────────────────────────────────────────────────
// Called by Coinbase after the user completes payment in the widget.

router.get('/return', async (req: Request, res: Response): Promise<void> => {
  const ref = req.query['ref'] as string | undefined

  if (!ref) {
    res.status(400).send(returnPage('Missing reference', false))
    return
  }

  // Check status with Coinbase API
  let status
  try {
    status = await getTransactionStatus(ref)
  } catch (err) {
    logger.info(`[Coinbase return] Status check failed for ref ${ref}: ${(err as Error).message}`)
    res.send(returnPage('Processing your payment — you will receive a WhatsApp confirmation shortly.', true))
    return
  }

  if (status?.status === 'ONRAMP_TRANSACTION_STATUS_SUCCESS') {
    // Fire and forget — don't block the page load
    executeOnRampPayout(ref, status.transactionHash).catch(err =>
      logger.info(`[Coinbase return] Payout error: ${err.message}`),
    )
    res.send(returnPage('Payment received! You will get a WhatsApp confirmation shortly.', true))
  } else if (status?.status === 'ONRAMP_TRANSACTION_STATUS_FAILED') {
    res.send(returnPage('Payment failed. Please try again.', false))
  } else {
    // In-progress or pending — poller will catch it
    res.send(returnPage('Payment is being processed — you will receive a WhatsApp confirmation shortly.', true))
  }
})

// ── Cron poller ───────────────────────────────────────────────────────────────

/**
 * Check all pending OnRampTransactions against the Coinbase Status API.
 * Run every 2 minutes from index.ts as a safety net.
 */
export async function pollPendingOnRampTransactions(): Promise<void> {
  const cutoff = new Date(Date.now() - SESSION_EXPIRY_MS)

  const pending = await OnRampTransaction.find({ status: 'pending' })
  if (pending.length === 0) return

  logger.info(`[Coinbase poller] Checking ${pending.length} pending transaction(s)`)

  for (const onRamp of pending) {
    const refId = (onRamp._id as { toString(): string }).toString()

    // Expire sessions older than SESSION_EXPIRY_MS with no payment
    if (onRamp.createdAt < cutoff) {
      onRamp.status = 'expired'
      await onRamp.save()
      logger.info(`[Coinbase poller] Session expired: ${refId}`)
      continue
    }

    try {
      const status = await getTransactionStatus(refId)
      if (!status) continue

      if (status.status === 'ONRAMP_TRANSACTION_STATUS_SUCCESS') {
        logger.info(`[Coinbase poller] Payment confirmed for ref: ${refId}`)
        await executeOnRampPayout(refId, status.transactionHash)
      } else if (status.status === 'ONRAMP_TRANSACTION_STATUS_FAILED') {
        onRamp.status = 'failed'
        onRamp.failureReason = 'Coinbase reported transaction failed'
        await onRamp.save()
      }
    } catch (err) {
      // Non-blocking — will retry on next poll
      logger.info(`[Coinbase poller] Status check error for ${refId}: ${(err as Error).message}`)
    }
  }
}

// ── Simple HTML response page ─────────────────────────────────────────────────

function returnPage(message: string, success: boolean): string {
  const color = success ? '#16a34a' : '#dc2626'
  const icon = success ? '✅' : '❌'
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SendSasa Payment</title>
  <style>
    body { font-family: -apple-system, sans-serif; display: flex; align-items: center;
           justify-content: center; min-height: 100vh; margin: 0; background: #f9fafb; }
    .card { background: white; border-radius: 12px; padding: 2rem; max-width: 400px;
            width: 90%; text-align: center; box-shadow: 0 4px 6px rgba(0,0,0,0.07); }
    h1 { font-size: 2rem; margin: 0 0 1rem; }
    p { color: #374151; font-size: 1rem; line-height: 1.5; }
    .brand { color: #6b7280; font-size: 0.875rem; margin-top: 1.5rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${icon}</h1>
    <p style="color:${color};font-weight:600">${message}</p>
    <p>You can close this window and return to WhatsApp.</p>
    <p class="brand">Powered by SendSasa</p>
  </div>
</body>
</html>`
}

export default router
