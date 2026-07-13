import crypto from 'node:crypto'
import { Controller, Get, Post, Req, Res } from '@nestjs/common'
import type { Request, Response } from 'express'
import { OnRampTransaction } from '@models/OnRampTransaction'
import {
  CoinbaseOnrampService,
  HeadlessPaymentMethod,
} from '@onramp/coinbase/coinbase-onramp.service'
import { openInBrowserPage, errorPage, paymentPage } from './templates/payment-page.template'
import logger from '@common/utils/logger'
import config from '@common/utils/config'

const IS_SANDBOX = process.env.COINBASE_HEADLESS_SANDBOX === 'true'

@Controller('pay')
export class PaymentController {
  constructor(private readonly coinbaseOnramp: CoinbaseOnrampService) {}
  @Get('card')
  async getPaymentPage(@Req() req: Request, @Res() res: Response) {
    const ref = req.query['ref'] as string | undefined
    if (!ref) {
      res.status(400).send('Missing payment reference.')
      return
    }

    const ua = req.headers['user-agent'] || ''

    const isWebView = /WhatsApp|FBAN|FBIOS|Instagram|Line|\bwv\b/.test(ua)
    if (isWebView) {
      const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`
      res.setHeader('Content-Type', 'text/html')
      res.send(openInBrowserPage(fullUrl))
      return
    }

    const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
    if (
      !onRamp ||
      onRamp.status === 'completed' ||
      onRamp.status === 'expired'
    ) {
      res.status(404).send('Payment session not found or already completed.')
      return
    }

    const isIOS = /iPhone|iPad|iPod/.test(ua)
    const isMacSafari =
      /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)
    const method: HeadlessPaymentMethod =
      isIOS || isMacSafari
        ? 'GUEST_CHECKOUT_APPLE_PAY'
        : 'GUEST_CHECKOUT_GOOGLE_PAY'

    let paymentLinkUrl: string
    if (
      onRamp.headlessOrderId &&
      onRamp.headlessPaymentMethod === method &&
      onRamp.headlessPaymentLinkUrl
    ) {
      logger.info(
        `[Headless] Reusing order ${onRamp.headlessOrderId} for ref ${ref}`,
      )
      paymentLinkUrl = onRamp.headlessPaymentLinkUrl
    } else {
      const domain = (config.JWT_ISSUER || 'https://api.sendsasa.com').replace(
        /^https?:\/\//,
        '',
      )
      const now = new Date().toISOString()

      const partnerUserRef = IS_SANDBOX ? `sandbox-${ref}` : ref
      const phoneNumber = IS_SANDBOX
        ? (process.env.COINBASE_SANDBOX_PHONE ?? '+12345678901')
        : onRamp.senderPhone.startsWith('+')
          ? onRamp.senderPhone
          : `+${onRamp.senderPhone}`

      if (
        onRamp.headlessPaymentMethod !== method ||
        !onRamp.headlessIdempotencyKey
      ) {
        onRamp.headlessIdempotencyKey = crypto.randomUUID()
        await onRamp.save()
      }

      try {
        const result = await this.coinbaseOnramp.createHeadlessOrder({
          paymentMethod: method,
          paymentAmount: onRamp.totalUSDCharged.toFixed(2),
          purchaseCurrency: 'USDC',
          destinationAddress: onRamp.adminAddress,
          destinationNetwork: 'base',
          phoneNumber,
          email: onRamp.userEmail || undefined,
          agreementAcceptedAt: now,
          phoneNumberVerifiedAt: now,
          partnerUserRef,
          domain: method === 'GUEST_CHECKOUT_APPLE_PAY' ? domain : undefined,
          idempotencyKey: onRamp.headlessIdempotencyKey!,
        })

        paymentLinkUrl = result.paymentLinkUrl

        if (IS_SANDBOX) {
          const sandboxParam =
            method === 'GUEST_CHECKOUT_APPLE_PAY'
              ? 'useApplePaySandbox=true'
              : 'useGooglePaySandbox=true'
          paymentLinkUrl += paymentLinkUrl.includes('?')
            ? `&${sandboxParam}`
            : `?${sandboxParam}`
        }

        onRamp.headlessOrderId = result.orderId
        onRamp.headlessPaymentMethod = method
        onRamp.headlessPaymentLinkUrl = paymentLinkUrl
        await onRamp.save()

        logger.info(
          `[Headless] Order created: ${result.orderId} (${method}, ref: ${ref}, sandbox: ${IS_SANDBOX})`,
        )
      } catch (err: unknown) {
        const axiosErr = err as {
          response?: { data?: unknown; status?: number }
          message?: string
        }
        const data = axiosErr.response?.data
        const httpStatus = axiosErr.response?.status
        const msg =
          (typeof data === 'object' && data !== null
            ? (data as Record<string, unknown>).errorMessage ||
              (data as Record<string, unknown>).message ||
              (data as Record<string, unknown>).error_description ||
              (data as Record<string, unknown>).error ||
              (Array.isArray((data as Record<string, unknown>).errors)
                ? (
                    (data as Record<string, unknown>).errors as Array<{
                      message?: string
                    }>
                  )[0]?.message
                : null) ||
              (Array.isArray((data as Record<string, unknown>).details)
                ? (
                    (data as Record<string, unknown>).details as Array<{
                      description?: string
                    }>
                  )[0]?.description
                : null)
            : typeof data === 'string'
              ? data
              : null) ||
          axiosErr.message ||
          'Failed to create payment session.'

        logger.error(
          `[Headless] Order creation failed for ref ${ref}: HTTP ${httpStatus ?? 'N/A'} — ${msg}`,
          { method, body: JSON.stringify(data) },
        )

        res.setHeader('Content-Type', 'text/html')
        res.send(errorPage(msg as string, req.originalUrl))
        return
      }
    }

    const nonce = crypto.randomBytes(16).toString('base64')

    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        `script-src 'self' 'nonce-${nonce}'`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        'frame-src https://*.coinbase.com',
        "connect-src 'self'",
        "img-src 'self' data:",
        "frame-ancestors 'none'",
      ].join('; '),
    )

    res.setHeader('Content-Type', 'text/html')
    res.send(
      paymentPage({
        refId: ref,
        totalUSD: onRamp.totalUSDCharged.toFixed(2),
        xafAmount: onRamp.xafAmount.toLocaleString(),
        recipientPhone: onRamp.recipientPhone,
        mmProvider: onRamp.mmProvider.toUpperCase(),
        paymentLinkUrl,
        nonce,
      }),
    )
  }

  @Post('card/events')
  async handleCardEvent(@Req() req: Request, @Res() res: Response) {
    const {
      ref,
      eventName,
      data: evData,
    } = req.body as {
      ref?: string
      eventName?: string
      data?: Record<string, string>
    }

    res.status(204).end()

    if (!ref || !eventName) return

    logger.info(`[Headless] Event ${eventName} for ref ${ref}`)

    if (eventName === 'onramp_api.polling_success') {
      this.coinbaseOnramp
        .executeOnRampPayout(ref)
        .catch((err: Error) =>
          logger.error(
            `[Headless] Payout error for ref ${ref}: ${err.message}`,
          ),
        )
      return
    }

    if (
      eventName === 'onramp_api.commit_error' ||
      eventName === 'onramp_api.load_error' ||
      eventName === 'onramp_api.polling_error'
    ) {
      const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
      if (onRamp?.status === 'pending') {
        onRamp.failureReason = evData?.errorCode || eventName
        await onRamp.save().catch(() => {})
      }
    }
  }
}

