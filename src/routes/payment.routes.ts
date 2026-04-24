/**
 * Headless Coinbase Onramp — Payment Page Route
 *
 * GET  /pay/card?ref=<OnRampTransaction_id>
 *   Serves a branded HTML page that detects Apple Pay vs Google Pay,
 *   calls /pay/card/init to create the Coinbase headless order lazily,
 *   and embeds the returned paymentLink.url in an iframe with allow="payment".
 *
 * POST /pay/card/init
 *   Called by the hosted page to create the Coinbase order for the detected
 *   payment method. Returns the paymentLink URL and order summary.
 *
 * POST /pay/card/events
 *   Receives postMessage events relayed from the iframe by the hosted page.
 *   On commit_success / polling_success: triggers Mobile Money payout.
 *
 * NOTE: Apple Pay on web requires domain registration with the Coinbase CDP
 * portal. Contact Coinbase to whitelist your domain and obtain the
 * .well-known/apple-developer-merchantid-domain-association file.
 *
 * NOTE: Coinbase headless onramp is currently US-only (valid US cell phones).
 */

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

// ── HTML template ─────────────────────────────────────────────────────────────

function paymentPage(params: {
  refId: string
  totalUSD: string
  xafAmount: string
  recipientPhone: string
  mmProvider: string
  domain: string
}): string {
  const { refId, totalUSD, xafAmount, recipientPhone, mmProvider, domain } = params
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
    #payment-container{width:100%;max-width:420px}
    #payment-frame{width:100%;min-height:80px;border:none;display:none;border-radius:12px;overflow:hidden}
    #loading-msg{text-align:center;color:#94a3b8;font-size:14px;padding:20px 0}
    #loading-msg .dot{animation:blink 1.4s infinite both}
    #loading-msg .dot:nth-child(2){animation-delay:.2s}
    #loading-msg .dot:nth-child(3){animation-delay:.4s}
    @keyframes blink{0%,80%,100%{opacity:0}40%{opacity:1}}
    #open-browser{display:none;text-align:center;padding:16px}
    #open-browser p{color:#94a3b8;font-size:13px;margin-bottom:12px;line-height:1.5}
    .btn-open{display:inline-block;background:#38bdf8;color:#0f172a;font-weight:700;font-size:15px;padding:12px 28px;border-radius:10px;text-decoration:none}
    #success{display:none;text-align:center;padding:24px 0}
    #success .check{font-size:52px;margin-bottom:12px}
    #success h2{font-size:20px;font-weight:700;color:#34d399;margin-bottom:8px}
    #success p{color:#94a3b8;font-size:14px;line-height:1.6}
    #error-box{display:none;background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:16px;width:100%;max-width:420px;margin-bottom:16px}
    #error-box p{color:#fca5a5;font-size:14px;margin-bottom:12px}
    .btn-retry{background:#1e293b;border:1px solid #334155;color:#f1f5f9;font-size:14px;font-weight:600;padding:10px 20px;border-radius:8px;cursor:pointer;width:100%}
    .terms{font-size:11px;color:#475569;text-align:center;max-width:360px;line-height:1.5;margin-top:8px}
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

  <div id="payment-container">
    <div id="loading-msg">Preparing payment<span class="dot">.</span><span class="dot">.</span><span class="dot">.</span></div>
    <iframe
      id="payment-frame"
      sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
      referrerpolicy="no-referrer"
      allow="payment">
    </iframe>
  </div>

  <div id="open-browser">
    <p>For the best experience with Apple Pay or Google Pay, open this link in Safari or Chrome.</p>
    <a id="browser-link" class="btn-open" href="#">Open in Browser ↗</a>
  </div>

  <div id="error-box">
    <p id="error-message">Payment failed. Please try again.</p>
    <button class="btn-retry" onclick="retry()">Try Again</button>
  </div>

  <div id="success">
    <div class="check">✅</div>
    <h2>Payment Successful!</h2>
    <p>Your funds are on the way.<br>You'll receive a confirmation on WhatsApp shortly.</p>
  </div>

  <p class="terms">By completing payment you agree to
    <a href="https://www.coinbase.com/legal/guest-checkout/us" target="_blank">Coinbase Guest Checkout Terms</a>
    and <a href="https://www.coinbase.com/legal/privacy" target="_blank">Privacy Policy</a>.
  </p>

  <script>
    const REF = ${JSON.stringify(refId)};
    const DOMAIN = ${JSON.stringify(domain)};

    // Detect if running inside a WhatsApp / social in-app browser (no Apple/Google Pay)
    const ua = navigator.userAgent || '';
    const isWebView = /WhatsApp|FBAN|FBIOS|Instagram|Line|wv\b/.test(ua);
    const isIOS = /iPhone|iPad|iPod/.test(ua);

    // Load Google Pay JS library dynamically and check isReadyToPay
    function loadGooglePayScript() {
      return new Promise((resolve) => {
        if (window.google?.payments?.api?.PaymentsClient) { resolve(true); return; }
        const s = document.createElement('script');
        s.src = 'https://pay.google.com/gp/p/js/pay.js';
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        document.head.appendChild(s);
      });
    }

    async function isGooglePayAvailable() {
      const loaded = await loadGooglePayScript();
      if (!loaded) return false;
      try {
        const client = new google.payments.api.PaymentsClient({ environment: 'PRODUCTION' });
        const r = await client.isReadyToPay({
          apiVersion: 2, apiVersionMinor: 0,
          allowedPaymentMethods: [{ type: 'CARD', parameters: {
            allowedAuthMethods: ['PAN_ONLY', 'CRYPTOGRAM_3DS'],
            allowedCardNetworks: ['MASTERCARD', 'VISA'],
          }}],
        });
        return r.result === true;
      } catch { return false; }
    }

    async function init() {
      // Detect available payment method
      let method = null;

      if (typeof ApplePaySession !== 'undefined' && ApplePaySession.canMakePayments?.()) {
        method = 'GUEST_CHECKOUT_APPLE_PAY';
      } else if (await isGooglePayAvailable()) {
        method = 'GUEST_CHECKOUT_GOOGLE_PAY';
      }

      // If in a webview that blocks payment sheets, nudge user to open in real browser
      if (isWebView || (!method && isIOS)) {
        showOpenBrowser();
        return;
      }

      if (!method) {
        showError('Apple Pay and Google Pay are not available on this device. Please open this link in Safari (iOS) or Chrome (Android).');
        showOpenBrowser();
        return;
      }

      // Create the Coinbase headless order (lazy — happens here, not at flow confirmation)
      let data;
      try {
        const resp = await fetch('/pay/card/init', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ref: REF, method, domain: DOMAIN }),
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({}));
          showError(err.message || 'Could not create payment session. Please try again.');
          return;
        }
        data = await resp.json();
      } catch {
        showError('Network error. Please check your connection and try again.');
        return;
      }

      // Embed the payment link in the iframe
      const frame = document.getElementById('payment-frame');
      frame.src = data.paymentLinkUrl;
      frame.style.display = 'block';
      document.getElementById('loading-msg').style.display = 'none';
    }

    // Relay postMessage events from the Coinbase iframe to our backend
    window.addEventListener('message', async (event) => {
      const payload = event.data;
      if (!payload || typeof payload.eventName !== 'string') return;
      if (!payload.eventName.startsWith('onramp_api.')) return;

      const { eventName, data: evData } = payload;

      // Adjust iframe height on load
      if (eventName === 'onramp_api.load_success') {
        document.getElementById('payment-frame').style.minHeight = '120px';
      }

      if (eventName === 'onramp_api.load_error') {
        showError(evData?.errorMessage || 'Payment method not available.');
        showOpenBrowser();
      }

      if (eventName === 'onramp_api.commit_success' || eventName === 'onramp_api.polling_success') {
        document.getElementById('summary-card').style.display = 'none';
        document.getElementById('payment-container').style.display = 'none';
        document.getElementById('success').style.display = 'block';
      }

      if (eventName === 'onramp_api.commit_error') {
        showError(evData?.errorMessage || 'Payment declined. Please try again.');
      }

      if (eventName === 'onramp_api.polling_error') {
        showError(evData?.errorMessage || 'Payment could not be confirmed. Please contact support with your reference.');
      }

      if (eventName === 'onramp_api.cancel') {
        document.getElementById('loading-msg').style.display = 'none';
        document.getElementById('error-message').textContent = 'Payment cancelled. Tap below to try again.';
        document.getElementById('error-box').style.display = 'block';
      }

      // Relay to backend regardless of event type
      await fetch('/pay/card/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ref: REF, eventName, data: evData }),
      }).catch(() => {});
    });

    function showOpenBrowser() {
      document.getElementById('loading-msg').style.display = 'none';
      const el = document.getElementById('open-browser');
      el.style.display = 'block';
      document.getElementById('browser-link').href = window.location.href;
    }

    function showError(msg) {
      document.getElementById('loading-msg').style.display = 'none';
      document.getElementById('error-message').textContent = msg;
      document.getElementById('error-box').style.display = 'block';
    }

    function retry() {
      window.location.reload();
    }

    init();
  </script>
</body>
</html>`
}

// ── Routes ────────────────────────────────────────────────────────────────────

/** Serve the branded headless payment page. */
router.get('/card', async (req: Request, res: Response): Promise<void> => {
  const ref = req.query['ref'] as string | undefined
  if (!ref) {
    res.status(400).send('Missing payment reference.')
    return
  }

  const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
  if (!onRamp || onRamp.status === 'completed' || onRamp.status === 'expired') {
    res.status(404).send('Payment session not found or already completed.')
    return
  }

  const domain = (config.JWT_ISSUER || 'https://api.sendsasa.com').replace(/^https?:\/\//, '')

  res.setHeader('Content-Type', 'text/html')
  res.send(paymentPage({
    refId: ref,
    totalUSD: onRamp.totalUSDCharged.toFixed(2),
    xafAmount: onRamp.xafAmount.toLocaleString(),
    recipientPhone: onRamp.recipientPhone,
    mmProvider: onRamp.mmProvider.toUpperCase(),
    domain,
  }))
})

/**
 * Create a Coinbase headless order for the detected payment method.
 * Called by the hosted payment page just-in-time when user opens the link.
 */
router.post('/card/init', async (req: Request, res: Response): Promise<void> => {
  const { ref, method, domain } = req.body as {
    ref?: string
    method?: string
    domain?: string
  }

  if (!ref || !method) {
    res.status(400).json({ message: 'Missing ref or method.' })
    return
  }

  const validMethods: HeadlessPaymentMethod[] = [
    'GUEST_CHECKOUT_APPLE_PAY',
    'GUEST_CHECKOUT_GOOGLE_PAY',
  ]
  if (!validMethods.includes(method as HeadlessPaymentMethod)) {
    res.status(400).json({ message: 'Invalid payment method.' })
    return
  }

  const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
  if (!onRamp) {
    res.status(404).json({ message: 'Payment session not found.' })
    return
  }

  if (onRamp.status === 'completed' || onRamp.status === 'expired') {
    res.status(409).json({ message: 'Payment session already completed or expired.' })
    return
  }

  // Idempotent — reuse existing order if already created for same method
  if (onRamp.headlessOrderId && onRamp.headlessPaymentMethod === method && onRamp.headlessPaymentLinkUrl) {
    logger.info(`[Headless] Reusing existing order ${onRamp.headlessOrderId} for ref ${ref}`)
    res.json({ paymentLinkUrl: onRamp.headlessPaymentLinkUrl })
    return
  }

  const now = new Date().toISOString()

  try {
    const result = await createHeadlessOrder({
      paymentMethod: method as HeadlessPaymentMethod,
      paymentAmount: onRamp.totalUSDCharged.toFixed(2),
      purchaseCurrency: 'USDC',
      destinationAddress: onRamp.adminAddress,
      destinationNetwork: 'base',
      phoneNumber: onRamp.senderPhone.startsWith('+')
        ? onRamp.senderPhone
        : `+${onRamp.senderPhone}`,
      email: onRamp.userEmail || '',
      agreementAcceptedAt: now,
      phoneNumberVerifiedAt: now,
      partnerUserRef: ref,
      domain,
    })

    onRamp.headlessOrderId = result.orderId
    onRamp.headlessPaymentMethod = method as HeadlessPaymentMethod
    onRamp.headlessPaymentLinkUrl = result.paymentLinkUrl
    await onRamp.save()

    logger.info(`[Headless] Order created: ${result.orderId} (ref: ${ref})`)
    res.json({ paymentLinkUrl: result.paymentLinkUrl })
  } catch (err: any) {
    logger.error(`[Headless] Order creation failed for ref ${ref}: ${err.message}`)
    const cbError = err.response?.data?.message || err.message
    res.status(502).json({ message: cbError || 'Failed to create payment session.' })
  }
})

/**
 * Receive postMessage events relayed from the hosted payment page.
 * Triggers Mobile Money payout on commit_success / polling_success.
 */
router.post('/card/events', async (req: Request, res: Response): Promise<void> => {
  const { ref, eventName, data: evData } = req.body as {
    ref?: string
    eventName?: string
    data?: Record<string, string>
  }

  res.status(204).end()

  if (!ref || !eventName) return

  logger.info(`[Headless] Event ${eventName} for ref ${ref}`)

  if (
    eventName === 'onramp_api.commit_success' ||
    eventName === 'onramp_api.polling_success'
  ) {
    executeOnRampPayout(ref).catch((err) =>
      logger.error(`[Headless] Payout error for ref ${ref}: ${err.message}`),
    )
    return
  }

  if (
    eventName === 'onramp_api.commit_error' ||
    eventName === 'onramp_api.load_error' ||
    eventName === 'onramp_api.polling_error'
  ) {
    const onRamp = await OnRampTransaction.findById(ref).catch(() => null)
    if (onRamp && onRamp.status === 'pending') {
      onRamp.failureReason = evData?.errorCode || eventName
      await onRamp.save().catch(() => {})
    }
  }
})

export default router
