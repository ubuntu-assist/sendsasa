import { describe, it, before, after, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Application } from 'express'
import { createApp } from '../../app.test-shim.js'
import { OnRampTransaction } from '../../models/OnRampTransaction.js'
import { startTestDB, stopTestDB, clearCollections } from '../helpers/db.js'

let app: Application

// DB must start before NestJS app so Mongoose connection is ready for controllers
before(async () => {
  await startTestDB()
  app = await createApp()
})
after(() => stopTestDB())
beforeEach(() => clearCollections())

// Standard desktop Chrome UA — not iOS, not Safari, not a WebView.
// The route resolves this to GUEST_CHECKOUT_GOOGLE_PAY.
const CHROME_UA =
  'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36'

const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1'

// Minimal valid OnRampTransaction fields
const BASE = {
  senderPhone: '+12025551234',
  recipientPhone: '+237612345678',
  mmProvider: 'mtn' as const,
  usdAmount: 50,
  cardFeePct: 3.99,
  cardFeeUSD: 1.995,
  totalUSDCharged: 51.995,
  xafAmount: 30600,
  fixerRate: 612,
  sendSasaRate: 608.94,
  feeXAF: 1836,
  adminAddress: '0x1234567890abcdef1234567890abcdef12345678',
}

describe('GET /pay/card — DB-backed paths', () => {
  it('returns 404 for a valid ObjectId that does not exist', async () => {
    const res = await request(app)
      .get('/pay/card?ref=507f1f77bcf86cd799439011')
      .set('User-Agent', CHROME_UA)
    assert.equal(res.status, 404)
  })

  it('returns 404 when findById throws (invalid ObjectId format)', async () => {
    // The route wraps findById in .catch(() => null), so bad IDs → 404 not 500
    const res = await request(app)
      .get('/pay/card?ref=not-a-mongo-id')
      .set('User-Agent', CHROME_UA)
    assert.equal(res.status, 404)
  })

  it('returns 404 when transaction status is completed', async () => {
    const tx = await OnRampTransaction.create({ ...BASE, status: 'completed' })
    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', CHROME_UA)
    assert.equal(res.status, 404)
    assert.ok(
      res.text.includes('already completed') || res.text.includes('not found'),
    )
  })

  it('returns 404 when transaction status is expired', async () => {
    const tx = await OnRampTransaction.create({ ...BASE, status: 'expired' })
    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', CHROME_UA)
    assert.equal(res.status, 404)
  })

  it('serves payment page HTML when pending transaction has a pre-created Google Pay order', async () => {
    const PAYMENT_URL =
      'https://pay.coinbase.com/buy/select-asset?sessionToken=test-google-pay-token'
    const tx = await OnRampTransaction.create({
      ...BASE,
      status: 'pending',
      headlessOrderId: 'order-goog-abc',
      headlessPaymentMethod: 'GUEST_CHECKOUT_GOOGLE_PAY',
      headlessPaymentLinkUrl: PAYMENT_URL,
    })

    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', CHROME_UA)

    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type']?.includes('text/html'))
    // Coinbase iframe URL embedded in the page
    assert.ok(res.text.includes(PAYMENT_URL), 'iframe src should contain the payment URL')
    // Payment summary visible in the page
    assert.ok(res.text.includes('51.99'), 'USD charge amount should appear in the summary')
    assert.ok(res.text.includes('+237612345678'), 'recipient phone should appear in the summary')
  })

  it('serves payment page HTML when pending transaction has a pre-created Apple Pay order', async () => {
    const PAYMENT_URL =
      'https://pay.coinbase.com/buy/select-asset?sessionToken=test-apple-pay-token'
    const tx = await OnRampTransaction.create({
      ...BASE,
      status: 'pending',
      headlessOrderId: 'order-apple-xyz',
      headlessPaymentMethod: 'GUEST_CHECKOUT_APPLE_PAY',
      headlessPaymentLinkUrl: PAYMENT_URL,
    })

    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', IOS_SAFARI_UA)

    assert.equal(res.status, 200)
    assert.ok(res.text.includes(PAYMENT_URL))
  })

  it('response includes a nonce-based CSP header for the payment page', async () => {
    const tx = await OnRampTransaction.create({
      ...BASE,
      status: 'pending',
      headlessOrderId: 'order-csp-test',
      headlessPaymentMethod: 'GUEST_CHECKOUT_GOOGLE_PAY',
      headlessPaymentLinkUrl: 'https://pay.coinbase.com/test',
    })

    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', CHROME_UA)

    const csp = res.headers['content-security-policy'] as string
    assert.ok(csp?.includes('nonce-'), 'CSP should include a script nonce')
    assert.ok(csp?.includes('frame-src https://*.coinbase.com'), 'CSP should allow Coinbase iframe')
  })

  it('does not call Coinbase API when headless fields already match the requested payment method', async () => {
    // This test verifies the idempotency path — if headlessPaymentMethod matches
    // the UA-derived method, no outbound API call is made.
    // We assert this indirectly: the request completes quickly with 200 (no network timeout).
    const tx = await OnRampTransaction.create({
      ...BASE,
      status: 'pending',
      headlessOrderId: 'reused-order-id',
      headlessPaymentMethod: 'GUEST_CHECKOUT_GOOGLE_PAY',
      headlessPaymentLinkUrl: 'https://pay.coinbase.com/reused',
    })

    const start = Date.now()
    const res = await request(app)
      .get(`/pay/card?ref=${tx._id}`)
      .set('User-Agent', CHROME_UA)
    const elapsed = Date.now() - start

    assert.equal(res.status, 200)
    assert.ok(elapsed < 1000, `expected fast response (no API call), got ${elapsed}ms`)
  })
})
