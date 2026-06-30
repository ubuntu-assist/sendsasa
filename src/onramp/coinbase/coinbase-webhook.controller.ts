import { Controller, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { CoinbaseOnrampService, CoinbaseWebhookEvent } from './coinbase-onramp.service'
import { OnRampTransaction } from '@models/OnRampTransaction'
import logger from '@common/utils/logger'

@Controller('webhook')
export class CoinbaseWebhookController {
  constructor(private readonly coinbaseOnramp: CoinbaseOnrampService) {}

  @Post('coinbase')
  async handleWebhook(@Req() req: Request, @Res() res: Response) {
    res.status(200).json({ received: true })

    const rawBody = req.body as Buffer
    const signatureHeader = req.headers['x-hook0-signature'] as string | undefined

    if (!signatureHeader) {
      logger.info('[Coinbase webhook] Missing signature header — ignoring')
      return
    }

    try {
      await this.coinbaseOnramp.verifyWebhookSignature(rawBody, signatureHeader)
    } catch (err) {
      logger.info(`[Coinbase webhook] Signature verification failed: ${(err as Error).message}`)
      return
    }

    let event: CoinbaseWebhookEvent
    try {
      event = JSON.parse(rawBody.toString('utf8'))
    } catch {
      logger.info('[Coinbase webhook] Invalid JSON body')
      return
    }

    logger.info(`[Coinbase webhook] Event: ${event.eventType}`)

    if (event.eventType !== 'onramp.transaction.success') return

    const { partner_user_ref, transactionId, txHash, purchaseAmount, walletAddress } = event.data

    if (!partner_user_ref) {
      logger.info('[Coinbase webhook] Missing partner_user_ref in payload')
      return
    }

    const onRamp = await OnRampTransaction.findById(partner_user_ref)
    if (!onRamp) {
      logger.info(`[Coinbase webhook] No OnRampTransaction found for ref: ${partner_user_ref}`)
      return
    }

    if (onRamp.status !== 'pending') {
      logger.info(`[Coinbase webhook] Transaction ${partner_user_ref} already in status: ${onRamp.status}`)
      return
    }

    // Persist the Coinbase tx ID before delegating to the shared payout executor
    onRamp.coinbaseTxId = transactionId
    await onRamp.save()

    logger.info(
      `[Coinbase webhook] Payment received: ${purchaseAmount} USDC → ${walletAddress} | ref: ${partner_user_ref}`,
    )

    await this.coinbaseOnramp.executeOnRampPayout(partner_user_ref, txHash)
  }
}
