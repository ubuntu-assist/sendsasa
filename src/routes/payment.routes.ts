/**
 * Headless Coinbase Onramp — Payment Page Route
 *
 * GET  /pay/card?ref=<OnRampTransaction_id>
 *   Detects device type from User-Agent server-side, creates (or reuses) a
 *   Coinbase headless order, then serves the branded HTML with the Coinbase
 *   iframe URL already embedded — no client-side API call on page load.
 *
 *   - WebView (WhatsApp/Instagram in-app): serves "open in browser" page.
 *   - iOS / macOS Safari: GUEST_CHECKOUT_APPLE_PAY
 *   - Everything else (Android, desktop): GUEST_CHECKOUT_GOOGLE_PAY
 *     Coinbase's iframe shows a QR-code fallback automatically on desktop.
 *
 * POST /pay/card/events
 *   Receives postMessage events relayed from the iframe.
 *   Triggers Mobile Money payout ONLY on polling_success (funds confirmed sent).
 *
 * Sandbox mode (COINBASE_HEADLESS_SANDBOX=true):
 *   - partnerUserRef prefixed with "sandbox-"
 *   - Uses a dummy US phone number (required format for sandbox)
 *   - Appends useApplePaySandbox / useGooglePaySandbox to the payment link
 *
 * Docs: https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
 */

import crypto from 'node:crypto'
import { Router, Request, Response } from 'express'
import { OnRampTransaction } from '../models/OnRampTransaction'
import {
  createHeadlessOrder,
  HeadlessPaymentMethod,
} from '../services/coinbase-onramp.service'
import { executeOnRampPayout } from './coinbase-return.routes'
import logger from '../utils/logger'
import config from '../utils/config'

const router = Router()

const IS_SANDBOX = process.env.COINBASE_HEADLESS_SANDBOX === 'true'

// ── HTML helpers ──────────────────────────────────────────────────────────────

function openInBrowserPage(fullUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SendSasa – Open in Browser</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;text-align:center}
    .logo{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;margin-bottom:32px}.logo span{color:#38bdf8}
    p{color:#94a3b8;font-size:14px;line-height:1.6;max-width:320px;margin-bottom:24px}
    .btn{display:inline-block;background:#38bdf8;color:#0f172a;font-weight:700;font-size:16px;padding:14px 32px;border-radius:12px;text-decoration:none}
  </style>
</head>
<body>
  <div class="logo">Send<span>Sasa</span></div>
  <p>Apple Pay and Google Pay aren't available inside WhatsApp or social app browsers.<br><br>Open this link in Safari or Chrome to complete your payment.</p>
  <a class="btn" href="${fullUrl}">Open in Browser ↗</a>
</body>
</html>`
}

function errorPage(message: string, retryUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SendSasa – Payment Error</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 16px;text-align:center}
    .logo{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;margin-bottom:32px}.logo span{color:#38bdf8}
    .error-box{background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:20px;max-width:380px;margin-bottom:24px}
    p{color:#fca5a5;font-size:14px;line-height:1.6}
    .btn{display:inline-block;background:#1e293b;border:1px solid #334155;color:#f1f5f9;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;text-decoration:none;cursor:pointer}
  </style>
</head>
<body>
  <div class="logo">Send<span>Sasa</span></div>
  <div class="error-box"><p>${message}</p></div>
  <a class="btn" href="${retryUrl}">Try Again</a>
</body>
</html>`
}

function paymentPage(params: {
  refId: string
  totalUSD: string
  xafAmount: string
  recipientPhone: string
  mmProvider: string
  paymentLinkUrl: string
  nonce: string
}): string {
  const {
    refId,
    totalUSD,
    xafAmount,
    recipientPhone,
    mmProvider,
    paymentLinkUrl,
    nonce,
  } = params

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0">
  <title>SendSasa – Secure Payment</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#0f172a;color:#f1f5f9;min-height:100vh;display:flex;flex-direction:column;align-items:center;padding:24px 16px}
    .logo{font-size:22px;font-weight:700;color:#fff;letter-spacing:-0.5px;margin-bottom:24px}
    .logo span{color:#38bdf8}
    .card{background:#1e293b;border-radius:16px;padding:20px;width:100%;max-width:420px;margin-bottom:16px}
    .label{font-size:11px;font-weight:600;color:#94a3b8;text-transform:uppercase;letter-spacing:0.8px;margin-bottom:4px}
    .value{font-size:15px;color:#f1f5f9;margin-bottom:14px}
    .value.large{font-size:22px;font-weight:700;color:#38bdf8}
    .divider{height:1px;background:#334155;margin:8px 0 14px}
    #payment-wrap{position:relative;width:100%;max-width:420px}
    #loading-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#0f172a;z-index:10;border-radius:12px;min-height:100px}
    #loading-overlay span{color:#94a3b8;font-size:14px}
    #loading-overlay .dot{animation:blink 1.4s infinite both}
    #loading-overlay .dot:nth-child(2){animation-delay:.2s}
    #loading-overlay .dot:nth-child(3){animation-delay:.4s}
    @keyframes blink{0%,80%,100%{opacity:0}40%{opacity:1}}
    #payment-frame{display:block;width:100%;min-height:120px;border:none;border-radius:12px;overflow:hidden}
    #processing{display:none;text-align:center;padding:20px 0}
    #processing p{color:#94a3b8;font-size:14px}
    #processing .spinner{width:32px;height:32px;border:3px solid #334155;border-top-color:#38bdf8;border-radius:50%;animation:spin .8s linear infinite;margin:0 auto 12px}
    @keyframes spin{to{transform:rotate(360deg)}}
    #success{display:none;text-align:center;padding:24px 0}
    #success .check{font-size:52px;margin-bottom:12px}
    #success h2{font-size:20px;font-weight:700;color:#34d399;margin-bottom:8px}
    #success p{color:#94a3b8;font-size:14px;line-height:1.6}
    #error-box{display:none;background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px;width:100%;max-width:420px;margin-bottom:16px}
    #error-box p{color:#fca5a5;font-size:14px;margin-bottom:12px}
    .btn-retry{background:#1e293b;border:1px solid #334155;color:#f1f5f9;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;cursor:pointer;width:100%}
    #cancel-toast{display:none;position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:#1e293b;border:1px solid #334155;color:#94a3b8;font-size:13px;padding:10px 20px;border-radius:8px;white-space:nowrap}
    .terms{font-size:11px;color:#475569;text-align:center;max-width:360px;line-height:1.5;margin-top:12px}
    .terms a{color:#38bdf8;text-decoration:none}
  </style>
</head>
<body>
  <div class="logo">Send<span>Sasa</span></div>

  <div class="card" id="summary-card">
    <div class="label">You pay</div>
    <div class="value large">$${totalUSD}</div>
    <div class="divider"></div>
    <div class="label">Recipient receives</div>
    <div class="value">${xafAmount} XAF via ${mmProvider}</div>
    <div class="label">To</div>
    <div class="value">${recipientPhone}</div>
  </div>

  <!-- Payment iframe — src pre-populated server-side, no client fetch needed -->
  <div id="payment-wrap">
    <div id="loading-overlay">
      <span>Loading<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></span>
    </div>
    <iframe
      id="payment-frame"
      src="${paymentLinkUrl}"
      sandbox="allow-scripts allow-same-origin"
      referrerpolicy="no-referrer"
      allow="payment">
    </iframe>
  </div>

  <!-- Shows after commit_success while polling for on-chain confirmation -->
  <div id="processing">
    <div class="spinner"></div>
    <p>Processing your payment…</p>
  </div>

  <!-- Blocking error (load_error, commit_error, polling_error) -->
  <div id="error-box">
    <p id="error-message">Payment failed. Please try again.</p>
    <button id="btn-retry" class="btn-retry">Try Again</button>
  </div>

  <!-- Final success screen (polling_success) -->
  <div id="success">
    <div class="check">✅</div>
    <h2>Payment Successful!</h2>
    <p>Your funds are on the way.<br>You'll receive a confirmation on WhatsApp shortly.</p>
  </div>

  <!-- Brief toast for onramp_api.cancel — does NOT block the iframe -->
  <div id="cancel-toast">Payment cancelled — tap the button to try again</div>

  <p class="terms">By completing payment you agree to
    <a href="https://www.coinbase.com/legal/guest-checkout/us" target="_blank">Coinbase Guest Checkout Terms</a>
    and <a href="https://www.coinbase.com/legal/privacy" target="_blank">Privacy Policy</a>.
  </p>

  <script nonce="${nonce}">
    const REF = ${JSON.stringify(refId)};
    document.getElementById('btn-retry').addEventListener('click', () => location.reload());

    // ── Error code → user-friendly message map ──────────────────────────────
    const ERROR_MESSAGES = {
      ERROR_CODE_INIT:
        'Payment session expired. Please go back and start again.',
      ERROR_CODE_GUEST_APPLE_PAY_NOT_SETUP:
        'Please set up Apple Pay on your device, then try again.',
      ERROR_CODE_GUEST_GOOGLE_PAY_NOT_SUPPORTED:
        'Google Pay is not supported on this device.',
      ERROR_CODE_GUEST_CARD_SOFT_DECLINED:
        'Your card was declined by your bank. Please contact your bank or try a different debit card.',
      ERROR_CODE_GUEST_INVALID_CARD:
        'Invalid card or billing address.',
      ERROR_CODE_GUEST_CARD_INSUFFICIENT_BALANCE:
        'Your card has insufficient funds.',
      ERROR_CODE_GUEST_CARD_HARD_DECLINED:
        'Your card was declined. Please try a different card.',
      ERROR_CODE_GUEST_CARD_RISK_DECLINED:
        'Transaction flagged by our security system. Please try again later.',
      ERROR_CODE_GUEST_REGION_MISMATCH:
        'Payments are not supported in your current region.',
      ERROR_CODE_GUEST_PERMISSION_DENIED:
        'Your account is blocked from making purchases.',
      ERROR_CODE_GUEST_CARD_PREPAID_DECLINED:
        'Prepaid cards are not supported. Please use a regular debit card.',
      ERROR_CODE_GUEST_TRANSACTION_LIMIT:
        'This exceeds your weekly transaction limit.',
      ERROR_CODE_GUEST_TRANSACTION_COUNT:
        'You have reached the lifetime transaction count limit (15).',
      ERROR_CODE_INVALID_BILLING_ZIP:
        'Invalid billing ZIP code. Please verify your billing address.',
      ERROR_CODE_INVALID_BILLING_ADDRESS:
        'Incomplete billing address.',
      ERROR_CODE_INVALID_BILLING_NAME:
        'Invalid cardholder name.',
      ERROR_CODE_GUEST_TRANSACTION_BUY_FAILED:
        'Purchase failed. Your card was not charged.',
      ERROR_CODE_GUEST_TRANSACTION_SEND_FAILED:
        'Failed to send funds — your card will be refunded.',
      ERROR_CODE_GUEST_TRANSACTION_TRANSACTION_FAILED:
        'An internal error occurred. The Coinbase team has been notified.',
      ERROR_CODE_GUEST_TRANSACTION_AVS_VALIDATION_FAILED:
        'Billing address validation failed. Your card was not charged. Please verify your billing address with your bank.',
    };

    function resolveMessage(errorCode, errorMessage) {
      return ERROR_MESSAGES[errorCode] || errorMessage || 'An error occurred. Please try again.';
    }

    function showError(errorCode, errorMessage) {
      document.getElementById('error-message').textContent = resolveMessage(errorCode, errorMessage);
      document.getElementById('error-box').style.display = 'block';
      document.getElementById('payment-wrap').style.display = 'none';
      document.getElementById('processing').style.display = 'none';
    }

    function showCancelToast() {
      const toast = document.getElementById('cancel-toast');
      toast.style.display = 'block';
      setTimeout(() => { toast.style.display = 'none'; }, 3000);
    }

    // ── postMessage event handler ───────────────────────────────────────────
    // Docs: https://docs.cdp.coinbase.com/onramp/headless-onramp/overview
    window.addEventListener('message', async (event) => {
      const payload = event.data;
      if (!payload || typeof payload.eventName !== 'string') return;
      if (!payload.eventName.startsWith('onramp_api.')) return;

      const { eventName, data: evData } = payload;
      const errorCode = evData?.errorCode;
      const errorMessage = evData?.errorMessage;

      switch (eventName) {

        // Iframe JS initialised, data fetching started
        case 'onramp_api.load_pending':
          // Loading overlay is already visible — nothing to do
          break;

        // Pay button rendered and ready for user interaction
        case 'onramp_api.load_success':
          document.getElementById('loading-overlay').style.display = 'none';
          break;

        // Pay button failed to initialise
        case 'onramp_api.load_error':
          // ERROR_CODE_GUEST_APPLE_PAY_NOT_SUPPORTED is safe to ignore on web —
          // the iframe falls back to an Apple Pay QR code automatically.
          if (errorCode !== 'ERROR_CODE_GUEST_APPLE_PAY_NOT_SUPPORTED') {
            showError(errorCode, errorMessage);
          } else {
            document.getElementById('loading-overlay').style.display = 'none';
          }
          break;

        // User pressed the pay button and transaction was successfully started
        case 'onramp_api.commit_success':
          document.getElementById('payment-wrap').style.display = 'none';
          document.getElementById('summary-card').style.display = 'none';
          document.getElementById('processing').style.display = 'block';
          break;

        // Transaction could not be started (card declined, etc.)
        case 'onramp_api.commit_error':
          showError(errorCode, errorMessage);
          break;

        // User dismissed the Apple Pay / Google Pay popup — can retry via iframe
        case 'onramp_api.cancel':
          showCancelToast();
          break;

        // Iframe started polling Coinbase for on-chain confirmation
        case 'onramp_api.polling_start':
          // Processing state already showing from commit_success — nothing to do
          break;

        // Funds confirmed sent to destination wallet — transaction complete
        case 'onramp_api.polling_success':
          document.getElementById('processing').style.display = 'none';
          document.getElementById('success').style.display = 'block';
          break;

        // Polling detected a failure (buy failed, send failed, internal error)
        case 'onramp_api.polling_error':
          showError(errorCode, errorMessage);
          break;
      }

      // Relay every event to the backend for logging and payout triggering
      await fetch('/pay/card/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: REF, eventName, data: evData }),
      }).catch(() => {});
    });
  </script>
</body>
</html>`
}

// ── Routes ────────────────────────────────────────────────────────────────────

/**
 * Serve the branded headless payment page.
 *
 * Detects device type from the request User-Agent, creates (or reuses) a
 * Coinbase headless order, and embeds the iframe URL directly in the HTML.
 * No client-side API call is needed — the iframe loads immediately.
 */
router.get('/card', async (req: Request, res: Response): Promise<void> => {
  const ref = req.query['ref'] as string | undefined
  if (!ref) {
    res.status(400).send('Missing payment reference.')
    return
  }

  const ua = req.headers['user-agent'] || ''

  // In-app browsers (WhatsApp, Instagram, etc.) cannot trigger payment sheets
  const isWebView = /WhatsApp|FBAN|FBIOS|Instagram|Line|\bwv\b/.test(ua)
  if (isWebView) {
    const fullUrl = `${req.protocol}://${req.get('host')}${req.originalUrl}`
    res.setHeader('Content-Type', 'text/html')
    res.send(openInBrowserPage(fullUrl))
    return
  }

  const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
  if (!onRamp || onRamp.status === 'completed' || onRamp.status === 'expired') {
    res.status(404).send('Payment session not found or already completed.')
    return
  }

  // iOS / macOS Safari → Apple Pay; everything else → Google Pay.
  // Coinbase's iframe automatically shows a QR-code fallback on desktop.
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const isMacSafari =
    /Macintosh/.test(ua) && /Safari/.test(ua) && !/Chrome/.test(ua)
  const method: HeadlessPaymentMethod =
    isIOS || isMacSafari
      ? 'GUEST_CHECKOUT_APPLE_PAY'
      : 'GUEST_CHECKOUT_GOOGLE_PAY'

  // Idempotent — reuse an existing Coinbase order for the same payment method
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

    // Sandbox: any valid US-format number works; prefix partnerUserRef with "sandbox-"
    const partnerUserRef = IS_SANDBOX ? `sandbox-${ref}` : ref
    const phoneNumber = IS_SANDBOX
      ? (process.env.COINBASE_SANDBOX_PHONE ?? '+12345678901')
      : onRamp.senderPhone.startsWith('+')
        ? onRamp.senderPhone
        : `+${onRamp.senderPhone}`

    try {
      const result = await createHeadlessOrder({
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
      })

      paymentLinkUrl = result.paymentLinkUrl

      // Sandbox: append the required sandbox query parameter to the payment link
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
    } catch (err: any) {
      const data = err.response?.data
      const httpStatus = err.response?.status
      const msg =
        (typeof data === 'object' && data !== null
          ? data.errorMessage ||
            data.message ||
            data.error_description ||
            data.error ||
            (Array.isArray(data.errors) ? data.errors[0]?.message : null) ||
            (Array.isArray(data.details) ? data.details[0]?.description : null)
          : typeof data === 'string'
            ? data
            : null) ||
        err.message ||
        'Failed to create payment session.'

      logger.error(
        `[Headless] Order creation failed for ref ${ref}: HTTP ${httpStatus ?? 'N/A'} — ${msg}`,
        { method, body: JSON.stringify(data) },
      )

      res.setHeader('Content-Type', 'text/html')
      res.send(errorPage(msg, req.originalUrl))
      return
    }
  }

  const nonce = crypto.randomBytes(16).toString('base64')

  // Override Helmet's default CSP for this page:
  // - nonce allows the inline event-listener script
  // - frame-src allows the Coinbase payment iframe
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
})

/**
 * Receive postMessage events relayed from the Coinbase iframe.
 *
 * Payout is triggered ONLY on polling_success — this is when Coinbase confirms
 * funds have been sent to the destination wallet. commit_success only means the
 * user pressed the pay button; funds have not moved yet at that point.
 */
router.post(
  '/card/events',
  async (req: Request, res: Response): Promise<void> => {
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

    // Funds confirmed on-chain — trigger Mobile Money payout
    if (eventName === 'onramp_api.polling_success') {
      executeOnRampPayout(ref).catch((err) =>
        logger.error(`[Headless] Payout error for ref ${ref}: ${err.message}`),
      )
      return
    }

    // Record failure reason for error events
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
  },
)

export default router
