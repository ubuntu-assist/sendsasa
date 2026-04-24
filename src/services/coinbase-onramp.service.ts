/**
 * Coinbase Onramp Service
 *
 * Handles:
 * 1. CDP API JWT generation (auto-detects Ed25519 vs EC P-256 key type)
 * 2. Headless order creation (POST /platform/v2/onramp/orders)
 * 3. Webhook signature verification (HMAC-SHA256)
 * 4. Transaction status polling (GET /onramp/v1/buy/user/{ref}/transactions)
 *
 * Credentials are stored encrypted in MongoDB (ApiCredential model).
 * We load and cache them in memory for the process lifetime.
 */

import crypto from 'node:crypto'
import axios from 'axios'
import { SignJWT } from 'jose'
import { ApiCredential, IApiCredential } from '../models/ApiCredential'
import logger from '../utils/logger'
import config from '../utils/config'

// ── Constants ────────────────────────────────────────────────────────────────

// Onramp API (hosted session tokens, transaction status)
const CDP_API_BASE = 'https://api.developer.coinbase.com'
const ONRAMP_TOKEN_PATH = '/onramp/v1/token'
const ONRAMP_STATUS_PATH = '/onramp/v1/buy/user' // GET /{ref}/transactions

// CDP Platform API (headless orders, webhook subscriptions)
const CDP_PLATFORM_BASE = 'https://api.cdp.coinbase.com'
const WEBHOOK_SUB_PATH = '/platform/v2/data/webhooks/subscriptions'
const HEADLESS_ORDERS_PATH = '/platform/v2/onramp/orders'

const PAYMENT_URL_BASE = 'https://pay.coinbase.com/buy/select-asset'

/** Card fee percentage charged on top of the crypto amount */
export const CARD_FEE_PCT = 3.99

/** Timestamp window for webhook freshness checks (5 minutes) */
const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000

/** Mark OnRampTransaction expired after this long with no payment (10 minutes) */
export const SESSION_EXPIRY_MS = 10 * 60 * 1000

// ── Credential cache ─────────────────────────────────────────────────────────

let cachedCredential: IApiCredential | null = null

async function getCredential(): Promise<IApiCredential> {
  if (cachedCredential) return cachedCredential

  const cred = await ApiCredential.findOne({
    provider: 'coinbase',
    isActive: true,
  })
  if (!cred) {
    throw new Error(
      'Coinbase credentials not configured. Insert an ApiCredential document with provider="coinbase".',
    )
  }
  cachedCredential = cred
  return cred
}

/** Call after updating credentials in DB to force a reload on next use. */
export function invalidateCredentialCache(): void {
  cachedCredential = null
}

// ── JWT generation ───────────────────────────────────────────────────────────

// PKCS#8 prefix for Ed25519 private key (RFC 8410)
const ED25519_PKCS8_PREFIX = Buffer.from(
  '302e020100300506032b657004220420',
  'hex',
)

/**
 * Convert a raw Ed25519 key exported by the Coinbase CDP portal into a
 * Node.js KeyObject that the `jose` library can use for EdDSA signing.
 *
 * CDP portal exports Ed25519 keys as:
 *   -----BEGIN EC PRIVATE KEY-----
 *   <base64 of 64 bytes: 32-byte seed || 32-byte public key>
 *   -----END EC PRIVATE KEY-----
 *
 * We strip the header/footer, decode to 64 raw bytes, take the first 32
 * (the seed), wrap in a PKCS#8 DER envelope, and import as an Ed25519 key.
 */
function ed25519KeyFromCDPPEM(pem: string): crypto.KeyObject {
  const b64 = pem
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')

  const raw = Buffer.from(b64, 'base64')
  // raw is 64 bytes: [32-byte seed][32-byte pubkey]
  const seed = raw.subarray(0, 32)
  const pkcs8Der = Buffer.concat([ED25519_PKCS8_PREFIX, seed])
  return crypto.createPrivateKey({
    key: pkcs8Der,
    format: 'der',
    type: 'pkcs8',
  })
}

/**
 * Generate a short-lived (120s) JWT for Coinbase CDP API authentication.
 *
 * CDP newer keys are Ed25519 (64-byte raw, mislabelled as "EC PRIVATE KEY").
 * Older keys are genuine EC P-256. We auto-detect by decoded byte length:
 *   64 bytes  → Ed25519  → alg: EdDSA
 *   otherwise → EC P-256 → alg: ES256
 *
 * Header format: { alg, kid: apiKeyName, nonce: randomHex, typ: "JWT" }
 * Payload:       { sub: apiKeyName, iss: "cdp", nbf, exp, uri: "METHOD host/path" }
 */
async function generateCDPJWT(
  apiKeyName: string,
  privateKeyPEM: string,
  method: 'POST' | 'GET',
  path: string,
  host: string = 'api.developer.coinbase.com',
): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const uri = `${method} ${host}${path}`
  const nonce = crypto.randomBytes(16).toString('hex')

  // Detect key type from raw byte length
  const b64 = privateKeyPEM
    .replace(/-----BEGIN EC PRIVATE KEY-----/, '')
    .replace(/-----END EC PRIVATE KEY-----/, '')
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const rawBytes = Buffer.from(b64, 'base64')

  let privateKey: crypto.KeyObject
  let alg: 'EdDSA' | 'ES256'

  if (rawBytes.length === 64) {
    // Ed25519: 32-byte seed + 32-byte public key
    alg = 'EdDSA'
    privateKey = ed25519KeyFromCDPPEM(privateKeyPEM)
  } else {
    // EC P-256 (legacy key format)
    alg = 'ES256'
    privateKey = crypto.createPrivateKey(privateKeyPEM)
  }

  return new SignJWT({ sub: apiKeyName, iss: 'cdp', nbf: now, uri })
    .setExpirationTime(now + 120)
    .setProtectedHeader({ alg, kid: apiKeyName, nonce, typ: 'JWT' })
    .sign(privateKey)
}

// ── Hosted session token ─────────────────────────────────────────────────────

interface SessionTokenResponse {
  token: string
}

/**
 * Create a Coinbase Onramp hosted session token.
 * Used for the standard hosted checkout flow (pay.coinbase.com).
 * Supports any debit/credit card, ACH, etc.
 */
export async function createSessionToken(
  usdAmount: number,
  adminAddress: string,
  partnerUserRef: string,
): Promise<string> {
  const cred = await getCredential()
  const redirectBase = config.JWT_ISSUER || 'https://api.sendsasa.com'

  const bearerToken = await generateCDPJWT(
    cred.apiKeyName,
    cred.getApiSecret(),
    'POST',
    ONRAMP_TOKEN_PATH,
  )

  const body = {
    destination_wallets: [
      {
        address: adminAddress,
        blockchains: ['base'],
        assets: ['USDC'],
      },
    ],
    preset_crypto_amount: usdAmount,
    default_asset: 'USDC',
    default_network: 'base',
    partner_user_ref: partnerUserRef,
    redirect_url: `${redirectBase}/coinbase/return?ref=${partnerUserRef}`,
  }

  const response = await axios.post<SessionTokenResponse>(
    `${CDP_API_BASE}${ONRAMP_TOKEN_PATH}`,
    body,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  )

  return response.data.token
}

/**
 * Build the Coinbase hosted checkout URL from a session token.
 */
export function buildPaymentURL(sessionToken: string): string {
  const params = new URLSearchParams({ sessionToken })
  return `${PAYMENT_URL_BASE}?${params.toString()}`
}

// ── Quote helpers ────────────────────────────────────────────────────────────

export interface CardQuote {
  usdAmount: number // crypto amount admin receives (the $100)
  cardFeePct: number // 3.99
  cardFeeUSD: number // $3.99
  totalUSDCharged: number // $103.99 — what the user's card is charged
  xafAmount: number // XAF recipient receives
  fixerRate: number
  sendSasaRate: number
  feeXAF: number
  rateDisplay: string // "1 USDC = 597.00 XAF"
}

/**
 * Calculate a full quote for a card-funded off-ramp transaction.
 *
 * @param usdAmount     - The USD amount the sender wants to convert (e.g. 100)
 * @param sendSasaRate  - USD/XAF rate after our 0.5% spread
 * @param fixerRate     - Raw Fixer.io USD/XAF rate
 */
export function calculateCardQuote(
  usdAmount: number,
  sendSasaRate: number,
  fixerRate: number,
): CardQuote {
  const cardFeeUSD = Number.parseFloat(
    (usdAmount * (CARD_FEE_PCT / 100)).toFixed(2),
  )
  const totalUSDCharged = Number.parseFloat((usdAmount + cardFeeUSD).toFixed(2))

  // XAF recipient receives = usdAmount × sendSasaRate (card fee is already on sender)
  const grossXAF = usdAmount * sendSasaRate
  const feeXAF = Math.round(grossXAF * 0.005) // 0.5% SendSasa spread contribution
  const xafAmount = Math.round(grossXAF - feeXAF)

  return {
    usdAmount,
    cardFeePct: CARD_FEE_PCT,
    cardFeeUSD,
    totalUSDCharged,
    xafAmount,
    fixerRate,
    sendSasaRate,
    feeXAF,
    rateDisplay: `1 USDC = ${sendSasaRate.toFixed(2)} XAF`,
  }
}

// ── Headless Onramp ──────────────────────────────────────────────────────────

export type HeadlessPaymentMethod =
  | 'GUEST_CHECKOUT_APPLE_PAY'
  | 'GUEST_CHECKOUT_GOOGLE_PAY'

export interface HeadlessOrderResult {
  orderId: string
  paymentLinkUrl: string
  purchaseAmount: string
  paymentTotal: string
}

/**
 * Create a Coinbase Headless Onramp order.
 *
 * Returns a paymentLink.url that must be embedded in an iframe with
 * allow="payment" so the browser can trigger the native Apple/Google Pay sheet.
 *
 * NOTE: Coinbase currently restricts headless onramp to US phone numbers.
 * Non-US numbers will receive a guest_region_forbidden error in production.
 *
 * Apple Pay on web requires domain registration with Coinbase CDP portal.
 * Contact Coinbase to whitelist your domain and obtain the domain verification file.
 */
export async function createHeadlessOrder(params: {
  paymentMethod: HeadlessPaymentMethod
  paymentAmount: string // total USD charged to card, inclusive of fees (e.g. "103.99")
  purchaseCurrency: string // 'USDC'
  destinationAddress: string // EVM (Base) admin wallet address
  destinationNetwork: string // 'base'
  phoneNumber: string // user E.164 phone
  email?: string
  agreementAcceptedAt: string // ISO-8601 datetime
  phoneNumberVerifiedAt: string
  partnerUserRef: string // OnRampTransaction MongoDB _id
  domain?: string // required for Apple Pay on web
}): Promise<HeadlessOrderResult> {
  const cred = await getCredential()

  const bearerToken = await generateCDPJWT(
    cred.apiKeyName,
    cred.getApiSecret(),
    'POST',
    HEADLESS_ORDERS_PATH,
    'api.cdp.coinbase.com',
  )

  const body: Record<string, unknown> = {
    paymentCurrency: 'USD',
    purchaseCurrency: params.purchaseCurrency,
    paymentMethod: params.paymentMethod,
    destinationAddress: params.destinationAddress,
    destinationNetwork: params.destinationNetwork,
    phoneNumber: params.phoneNumber,
    agreementAcceptedAt: params.agreementAcceptedAt,
    phoneNumberVerifiedAt: params.phoneNumberVerifiedAt,
    partnerUserRef: params.partnerUserRef,
    paymentAmount: params.paymentAmount,
  }
  if (params.email) body['email'] = params.email
  if (params.domain) body['domain'] = params.domain

  const response = await axios.post<{
    order: {
      orderId: string
      purchaseAmount: string
      paymentTotal: string
    }
    paymentLink: { url: string }
  }>(`${CDP_PLATFORM_BASE}${HEADLESS_ORDERS_PATH}`, body, {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
      'Content-Type': 'application/json',
    },
    timeout: 15_000,
  })

  const { order, paymentLink } = response.data
  logger.info(`[Headless Onramp] Order created: ${order.orderId}`)

  return {
    orderId: order.orderId,
    paymentLinkUrl: paymentLink.url,
    purchaseAmount: order.purchaseAmount,
    paymentTotal: order.paymentTotal,
  }
}

/**
 * Build the URL to our self-hosted headless payment page.
 * The page embeds the Coinbase payment link in an iframe with allow="payment".
 */
export function buildHeadlessPaymentURL(
  refId: string,
  baseUrl: string,
): string {
  return `${baseUrl}/pay/card?ref=${encodeURIComponent(refId)}`
}

// ── Webhook verification ─────────────────────────────────────────────────────

export interface CoinbaseWebhookEvent {
  eventType:
    | 'onramp.transaction.created'
    | 'onramp.transaction.updated'
    | 'onramp.transaction.success'
    | 'onramp.transaction.failed'
  timestamp: string
  data: {
    transactionId: string
    status: string
    purchaseCurrency: string
    purchaseNetwork: string
    purchaseAmount: string
    walletAddress: string
    txHash?: string
    paymentMethod: string
    coinbaseFee: string
    networkFee: string
    paymentTotal: string // total charged to user's card
    partner_user_ref: string // our OnRampTransaction _id
    createdAt: string
    completedAt?: string
  }
}

/**
 * Verify the Coinbase webhook HMAC-SHA256 signature.
 *
 * Header format: `t=<timestamp>,h=<headers>,v1=<hex-signature>`
 * Signed content: `<timestamp>.<rawBody>`
 *
 * @throws if signature is invalid or timestamp is stale
 */
export async function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string,
): Promise<void> {
  const cred = await getCredential()
  const secret = cred.getWebhookSecret()
  if (!secret) {
    throw new Error('Coinbase webhook secret not configured in ApiCredential')
  }

  // Parse header: t=<ts>,h=<hdrNames>,v1=<sig>
  const match = signatureHeader.match(
    /t=(\d+)(?:,h=[^,]*)?(?:,v1=([a-f0-9]+))?/,
  )
  if (!match) {
    throw new Error('Malformed webhook signature header')
  }

  const [, timestampStr, providedSig] = match
  if (!providedSig) {
    throw new Error('Missing v1 signature in webhook header')
  }

  // Freshness check (reject replays older than 5 minutes)
  const timestamp = Number.parseInt(timestampStr, 10)
  const age = Date.now() - timestamp * 1000
  if (age > WEBHOOK_TIMESTAMP_TOLERANCE_MS) {
    throw new Error(
      `Webhook timestamp too old (${Math.round(age / 1000)}s ago)`,
    )
  }

  // Compute expected signature
  const signedContent = `${timestampStr}.${rawBody.toString('utf8')}`
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(signedContent)
    .digest('hex')

  if (
    !crypto.timingSafeEqual(
      Buffer.from(providedSig, 'hex'),
      Buffer.from(expectedSig, 'hex'),
    )
  ) {
    throw new Error('Webhook signature mismatch')
  }
}

// ── Credential setup helper ──────────────────────────────────────────────────

/**
 * Upsert Coinbase credentials into the database.
 * Values are automatically encrypted by the ApiCredential pre-save hook.
 *
 * Call this once from a setup script or admin endpoint.
 */
export async function saveCredentials(params: {
  label: string
  apiKeyName: string
  apiSecret: string // raw EC private key PEM — encrypted by pre-save hook
  webhookSecret?: string // raw secret — encrypted by pre-save hook
  projectId?: string
}): Promise<void> {
  // Must use .save() — findOneAndUpdate bypasses the pre-save encryption hook
  let cred = await ApiCredential.findOne({ provider: 'coinbase' })
  cred ??= new ApiCredential({ provider: 'coinbase' })

  cred.label = params.label
  cred.apiKeyName = params.apiKeyName
  cred.apiSecret = params.apiSecret
  if (params.webhookSecret) cred.webhookSecret = params.webhookSecret
  if (params.projectId) cred.projectId = params.projectId
  cred.isActive = true

  await cred.save() // triggers pre-save hook → encrypts apiSecret + webhookSecret

  invalidateCredentialCache()
  logger.info('Coinbase credentials saved and encrypted')
}

/**
 * Update only the webhook secret on an existing credential record.
 * Uses .save() so the pre-save hook encrypts the value.
 */
export async function saveWebhookSecret(secret: string): Promise<void> {
  const cred = await ApiCredential.findOne({ provider: 'coinbase' })
  if (!cred)
    throw new Error('No Coinbase credentials found — run saveCredentials first')
  cred.webhookSecret = secret
  await cred.save()
  invalidateCredentialCache()
  logger.info('Coinbase webhook secret saved and encrypted')
}

// ── Transaction Status API ───────────────────────────────────────────────────

export interface OnrampTransactionStatus {
  status:
    | 'ONRAMP_TRANSACTION_STATUS_SUCCESS'
    | 'ONRAMP_TRANSACTION_STATUS_FAILED'
    | 'ONRAMP_TRANSACTION_STATUS_IN_PROGRESS'
    | 'ONRAMP_TRANSACTION_STATUS_PENDING'
  transactionHash?: string
  purchaseNetwork?: string
  purchaseCurrency?: string
  purchaseAmount?: string
}

interface TransactionStatusResponse {
  transactions: Array<{
    status: string
    transaction_hash?: string
    purchase_network?: string
    purchase_currency?: string
    purchase_amount?: string
  }>
}

/**
 * Query Coinbase Transaction Status API for a given partner_user_ref.
 * Returns null if no transaction found yet.
 */
export async function getTransactionStatus(
  partnerUserRef: string,
): Promise<OnrampTransactionStatus | null> {
  const cred = await getCredential()
  const path = `${ONRAMP_STATUS_PATH}/${partnerUserRef}/transactions`
  const bearerToken = await generateCDPJWT(
    cred.apiKeyName,
    cred.getApiSecret(),
    'GET',
    path,
  )

  const response = await axios.get<TransactionStatusResponse>(
    `${CDP_API_BASE}${path}`,
    {
      headers: { Authorization: `Bearer ${bearerToken}` },
      timeout: 10_000,
    },
  )

  const transactions = response.data.transactions
  if (!transactions || transactions.length === 0) return null

  const latest = transactions[0]
  return {
    status: latest.status as OnrampTransactionStatus['status'],
    transactionHash: latest.transaction_hash,
    purchaseNetwork: latest.purchase_network,
    purchaseCurrency: latest.purchase_currency,
    purchaseAmount: latest.purchase_amount,
  }
}

// ── Webhook subscription creation ────────────────────────────────────────────

interface WebhookSubscriptionResponse {
  subscriptionId: string
  secret: string // HMAC secret — save this to DB immediately
  eventTypes: string[]
}

/**
 * Programmatically create a Coinbase webhook subscription.
 * Called once from the setup script — returns the webhook secret.
 * The secret must be saved to the ApiCredential record immediately.
 *
 * Note: uses api.cdp.coinbase.com (platform API), not api.developer.coinbase.com
 */
export async function createWebhookSubscription(
  notificationUrl: string,
): Promise<string> {
  const cred = await getCredential()
  const bearerToken = await generateCDPJWT(
    cred.apiKeyName,
    cred.getApiSecret(),
    'POST',
    WEBHOOK_SUB_PATH,
    'api.cdp.coinbase.com',
  )

  const body = {
    description: 'SendSasa Onramp payment notifications',
    eventTypes: ['onramp.transaction.success', 'onramp.transaction.failed'],
    target: { url: notificationUrl },
    labels: {},
    isEnabled: true,
  }

  const response = await axios.post<WebhookSubscriptionResponse>(
    `${CDP_PLATFORM_BASE}${WEBHOOK_SUB_PATH}`,
    body,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    },
  )

  const webhookSecret = response.data.secret
  logger.info(`Webhook subscription created: ${response.data.subscriptionId}`)
  return webhookSecret
}
