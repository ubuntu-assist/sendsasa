/**
 * Coinbase Onramp Webhook Route
 *
 * IMPORTANT: This route must be mounted BEFORE express.json() in index.ts.
 * It uses express.raw() to capture the raw request body needed for
 * HMAC-SHA256 signature verification.
 *
 * Coinbase fires `onramp.transaction.success` when USDC arrives in the
 * admin wallet. We match by `partner_user_ref` (our OnRampTransaction._id),
 * then execute the Mobile Money payout.
 */

import { Router, Request, Response } from 'express'
import {
  verifyWebhookSignature,
  CoinbaseWebhookEvent,
} from '../services/coinbase-onramp.service'
import { OnRampTransaction } from '../models/OnRampTransaction'
import { mobileMoneyService, PROVIDER_DISPLAY } from '../services/mobile-money.service'
import { sendTextMessage } from '../services/whatsapp.service'
import logger from '../utils/logger'

const router = Router()

router.post('/', async (req: Request, res: Response): Promise<void> => {
  // Acknowledge immediately — Coinbase retries on non-2xx
  res.status(200).json({ received: true })

  const rawBody = req.body as Buffer
  const signatureHeader = req.headers['x-hook0-signature'] as string | undefined

  // ── 1. Signature verification ────────────────────────────────────────────
  if (!signatureHeader) {
    logger.info('[Coinbase webhook] Missing signature header — ignoring')
    return
  }

  try {
    await verifyWebhookSignature(rawBody, signatureHeader)
  } catch (err) {
    logger.info(`[Coinbase webhook] Signature verification failed: ${(err as Error).message}`)
    return
  }

  // ── 2. Parse event ────────────────────────────────────────────────────────
  let event: CoinbaseWebhookEvent
  try {
    event = JSON.parse(rawBody.toString('utf8'))
  } catch {
    logger.info('[Coinbase webhook] Invalid JSON body')
    return
  }

  logger.info(`[Coinbase webhook] Event: ${event.eventType}`)

  // Only act on confirmed payments
  if (event.eventType !== 'onramp.transaction.success') return

  const { partner_user_ref, transactionId, txHash, purchaseAmount, walletAddress } = event.data

  if (!partner_user_ref) {
    logger.info('[Coinbase webhook] Missing partner_user_ref in payload')
    return
  }

  // ── 3. Find the OnRampTransaction ────────────────────────────────────────
  const onRamp = await OnRampTransaction.findById(partner_user_ref)
  if (!onRamp) {
    logger.info(`[Coinbase webhook] No OnRampTransaction found for ref: ${partner_user_ref}`)
    return
  }

  if (onRamp.status !== 'pending') {
    logger.info(`[Coinbase webhook] Transaction ${partner_user_ref} already in status: ${onRamp.status}`)
    return
  }

  // ── 4. Mark payment received ──────────────────────────────────────────────
  onRamp.coinbaseTxId = transactionId
  onRamp.cryptoTxHash = txHash
  onRamp.status = 'payment_received'
  await onRamp.save()

  logger.info(
    `[Coinbase webhook] Payment received: ${purchaseAmount} USDC → ${walletAddress} | ref: ${partner_user_ref}`,
  )

  // ── 5. Execute Mobile Money payout ────────────────────────────────────────
  try {
    onRamp.status = 'payout_initiated'
    await onRamp.save()

    const refId = (onRamp._id as { toString(): string }).toString()
    const payoutResult = await mobileMoneyService.payout({
      provider: onRamp.mmProvider,
      recipientPhone: onRamp.recipientPhone,
      amount: onRamp.xafAmount,
      currency: 'XAF',
      reference: refId,
      description: `SendSasa card payment — ref ${refId}`,
    })

    if (payoutResult.success) {
      onRamp.status = 'completed'
      onRamp.completedAt = new Date()
      await onRamp.save()

      logger.info(
        `[Coinbase webhook] Payout completed: ${onRamp.xafAmount} XAF → ${onRamp.recipientPhone} via ${onRamp.mmProvider}`,
      )

      await sendTextMessage(
        onRamp.senderPhone,
        `✅ *Payment Successful!*\n\n` +
        `Your card payment of $${onRamp.totalUSDCharged.toFixed(2)} was received.\n\n` +
        `*${onRamp.xafAmount.toLocaleString()} XAF* has been sent to:\n` +
        `📱 ${onRamp.recipientPhone}\n` +
        `via ${PROVIDER_DISPLAY[onRamp.mmProvider]}\n\n` +
        `Reference: ${refId}`,
      )
    } else {
      throw new Error(payoutResult.message || 'Payout returned failure')
    }
  } catch (err) {
    onRamp.status = 'failed'
    onRamp.failureReason = (err as Error).message
    await onRamp.save()

    logger.info(`[Coinbase webhook] Payout failed: ${(err as Error).message}`)

    // Notify sender of failure
    await sendTextMessage(
      onRamp.senderPhone,
      `❌ *Payment Received, Payout Failed*\n\n` +
      `We received your $${onRamp.totalUSDCharged.toFixed(2)} payment, but the Mobile Money payout failed.\n\n` +
      `Our team will process your payout manually within 24 hours.\n` +
      `Reference: ${(onRamp._id as { toString(): string }).toString()}`,
    ).catch(() => {/* non-critical */})
  }
})

export default router
