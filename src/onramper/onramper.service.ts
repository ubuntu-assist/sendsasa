import { Injectable } from '@nestjs/common'
import crypto from 'node:crypto'
import axios from 'axios'
import config from '../utils/config'
import logger from '../utils/logger'
import { OnramperTransaction } from '../models/OnramperTransaction'

// ── Constants ──────────────────────────────────────────────────────────────

const WIDGET_BASE = config.ONRAMPER_SANDBOX === 'true'
  ? 'https://buy.onramper.dev'
  : 'https://buy.onramper.com'

const API_BASE = config.ONRAMPER_SANDBOX === 'true'
  ? 'https://api-stg.onramper.com'
  : 'https://api.onramper.com'

// Onramper token ID format: {ticker}_{network} (lowercase)
const ONRAMPER_CRYPTO = 'usdc_base'

// ── URL builder ────────────────────────────────────────────────────────────

export interface BuildUrlOptions {
  walletAddress: string
  partnerContext: string
  defaultFiat?: string    // ISO 4217, e.g. 'USD', 'EUR', 'XAF'
  defaultAmount?: number
}

/**
 * Builds a signed Onramper widget URL.
 * The `wallets` parameter requires an HMAC-SHA256 signature when a
 * signing secret is configured. Without a signing secret the wallet
 * address is omitted (user enters it manually in the widget).
 */
export function buildWidgetUrl(opts: BuildUrlOptions): string {
  const { walletAddress, partnerContext, defaultFiat, defaultAmount } = opts

  const params: Record<string, string> = {
    apiKey:                config.ONRAMPER_API_KEY!,
    onlyCryptos:           ONRAMPER_CRYPTO,
    defaultCrypto:         ONRAMPER_CRYPTO,
    partnerContext,
    successRedirectUrl:    `${config.SELF_URL}/onramper/success`,
    failureRedirectUrl:    `${config.SELF_URL}/onramper/failure`,
    enableCountrySelector: 'true',
  }

  if (defaultFiat)   params.defaultFiat   = defaultFiat
  if (defaultAmount) params.defaultAmount = String(defaultAmount)

  // wallets parameter requires HMAC-SHA256 signing
  // Sign content = alphabetically sorted sensitive params joined by &
  // (only wallets present here; add networkWallets/walletAddressTags if added later)
  const walletsValue = `${ONRAMPER_CRYPTO}:${walletAddress}`
  const signingSecret = config.ONRAMPER_SIGNING_SECRET
  if (signingSecret) {
    const signContent = `wallets=${walletsValue}`
    const signature = crypto
      .createHmac('sha256', signingSecret)
      .update(signContent)
      .digest('hex')
    params.wallets   = walletsValue
    params.signature = signature
  }

  return `${WIDGET_BASE}?${new URLSearchParams(params).toString()}`
}

/**
 * Creates a pending transaction record and returns the widget URL.
 * Called when the user requests the "buy" link.
 */
export async function createBuyLink(
  whatsappId: string,
  phoneNumber: string,
  walletAddress: string,
  opts?: { fiat?: string; amount?: number },
): Promise<string> {
  // Generate once — stored in DB AND embedded in URL so webhook lookup succeeds
  const partnerContext = `user_${whatsappId}_${Date.now()}`

  await OnramperTransaction.create({
    whatsappId,
    phoneNumber,
    walletAddress,
    partnerContext,
    status: 'url_generated',
  })

  const url = buildWidgetUrl({
    walletAddress,
    partnerContext,
    defaultFiat:   opts?.fiat,
    defaultAmount: opts?.amount,
  })

  logger.info(`[Onramper] Buy link created for ${whatsappId}: ${url}`)
  return url
}

// ── Webhook signature verification ─────────────────────────────────────────

export function verifyWebhookSignature(
  signature: string,
  rawBody: Buffer,
): boolean {
  const secret = config.ONRAMPER_WEBHOOK_SECRET
  if (!secret) {
    logger.info('[Onramper] ONRAMPER_WEBHOOK_SECRET not set — skipping verification')
    return true
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex')
  return signature === expected
}

// ── Webhook payload handler ─────────────────────────────────────────────────

export interface OnramperWebhookPayload {
  transactionId:      string
  onrampTransactionId?: string
  status:             string
  partnerContext?:    string
  walletAddress?:     string
  sourceCurrency:     string
  targetCurrency:     string
  inAmount:           number
  outAmount:          number
  transactionHash?:   string
  onramp?:            string
  statusReason?:      string
}

/**
 * Persists the webhook event and returns the updated transaction.
 * Caller (route) is responsible for sending WhatsApp notification.
 */
export async function handleWebhookPayload(
  payload: OnramperWebhookPayload,
): Promise<{ whatsappId: string | null; phoneNumber: string | null; status: string }> {
  const { transactionId, status, partnerContext, walletAddress } = payload

  // Upsert by partnerContext or onramperTxId
  const filter = partnerContext
    ? { partnerContext }
    : { onramperTxId: transactionId }

  const update: Record<string, unknown> = {
    status: mapStatus(status),
    onramperTxId:     transactionId,
    inAmount:         payload.inAmount,
    inCurrency:       payload.sourceCurrency,
    outAmount:        payload.outAmount,
    onramp:           payload.onramp,
  }
  if (payload.transactionHash) update.transactionHash = payload.transactionHash
  if (walletAddress)            update.walletAddress   = walletAddress
  if (status === 'completed')   update.completedAt     = new Date()
  if (payload.statusReason)     update.failureReason   = payload.statusReason

  const doc = await OnramperTransaction.findOneAndUpdate(
    filter,
    { $set: update },
    { new: true, upsert: true },
  )

  return {
    whatsappId:  doc?.whatsappId  ?? null,
    phoneNumber: doc?.phoneNumber ?? null,
    status:      doc?.status      ?? status,
  }
}

function mapStatus(s: string): string {
  const map: Record<string, string> = {
    new: 'new', pending: 'pending', paid: 'paid',
    completed: 'completed', failed: 'failed', canceled: 'canceled',
  }
  return map[s] ?? 'pending'
}

// ── Transaction status polling ──────────────────────────────────────────────

export async function getTransactionStatus(txId: string): Promise<unknown> {
  const { data } = await axios.get(`${API_BASE}/transactions/${txId}`, {
    headers: {
      Authorization:        config.ONRAMPER_API_KEY!,
      'x-onramper-secret':  config.ONRAMPER_WEBHOOK_SECRET ?? '',
    },
    timeout: 10_000,
  })
  return data
}

@Injectable()
export class OnramperService {
  buildWidgetUrl(opts: BuildUrlOptions) { return buildWidgetUrl(opts) }
  createBuyLink(whatsappId: string, phoneNumber: string, walletAddress: string, opts?: { fiat?: string; amount?: number }) { return createBuyLink(whatsappId, phoneNumber, walletAddress, opts) }
  verifyWebhookSignature(signature: string, rawBody: Buffer) { return verifyWebhookSignature(signature, rawBody) }
  handleWebhookPayload(payload: OnramperWebhookPayload) { return handleWebhookPayload(payload) }
  getTransactionStatus(txId: string) { return getTransactionStatus(txId) }
}
