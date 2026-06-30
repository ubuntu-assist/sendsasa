import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { Keypair, Transaction, Networks } from '@stellar/stellar-sdk'
import config from '@common/utils/config'
import logger from '@common/utils/logger'
import type {
  Sep10Challenge,
  Sep38Quote,
  Sep38PriceResponse,
  Sep31TransactionRequest,
  Sep31TransactionResponse,
} from './stellar.types'

const NETWORK_PASSPHRASE =
  config.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET

// Circle's Stellar anchor base URL.
// On mainnet: https://circle.stellar.org
// On testnet: https://testanchor.stellar.org
const CIRCLE_ANCHOR_URL =
  config.STELLAR_NETWORK === 'mainnet'
    ? 'https://circle.stellar.org'
    : 'https://testanchor.stellar.org'

// Onafriq's SEP-31 receiving anchor URL (replace with actual endpoint when available)
const ONAFRIQ_ANCHOR_URL =
  process.env.ONAFRIQ_ANCHOR_URL ?? 'https://api.onafriq.com/stellar/sep31'

// Onafriq's Stellar distribution account (replace with actual key when available)
const ONAFRIQ_DISTRIBUTION_ACCOUNT =
  process.env.ONAFRIQ_DISTRIBUTION_ACCOUNT ?? ''

// Tempo — European anchor for SEPA → EURT on Stellar (France, EU corridors)
// On testnet: use Circle testanchor as stand-in
const TEMPO_ANCHOR_URL =
  process.env.TEMPO_ANCHOR_URL ??
  (process.env.STELLAR_NETWORK === 'mainnet'
    ? 'https://tempo.eu.com'
    : 'https://testanchor.stellar.org')

// Tempo's EURT issuer on Stellar mainnet
// Source: https://tempo.eu.com/.well-known/stellar.toml
const TEMPO_EURT_ISSUER =
  process.env.TEMPO_EURT_ISSUER ??
  (process.env.STELLAR_NETWORK === 'mainnet'
    ? 'GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS73'
    : '')

@Injectable()
export class StellarAnchorService {
  private readonly platformKeypair = Keypair.fromSecret(
    config.STELLAR_PLATFORM_SECRET || Keypair.random().secret(),
  )

  // ─── SEP-10 WebAuth ────────────────────────────────────────────────────────

  /**
   * Complete a SEP-10 WebAuth challenge against any anchor.
   * Returns a JWT that can be used as Bearer token for SEP-24/31/38 calls.
   *
   * Flow:
   *   1. GET /auth?account=<platformPublicKey>  → challenge XDR
   *   2. Sign the challenge transaction with the platform keypair
   *   3. POST /auth with signed XDR → JWT
   */
  async getSep10Jwt(
    anchorUrl: string,
    accountPublicKey?: string,
  ): Promise<string> {
    const account = accountPublicKey ?? this.platformKeypair.publicKey()

    // Step 1 — fetch challenge
    const challengeRes = await axios.get<Sep10Challenge>(`${anchorUrl}/auth`, {
      params: { account },
    })
    const { transaction, network_passphrase } = challengeRes.data

    // Step 2 — sign challenge
    const tx = new Transaction(
      transaction,
      network_passphrase ?? NETWORK_PASSPHRASE,
    )
    tx.sign(this.platformKeypair)

    // Step 3 — exchange for JWT
    const tokenRes = await axios.post<{ token: string }>(`${anchorUrl}/auth`, {
      transaction: tx.toEnvelope().toXDR('base64'),
    })

    return tokenRes.data.token
  }

  // ─── SEP-38 FX Quotes ──────────────────────────────────────────────────────

  /**
   * Fetch an indicative FX rate (no auth, <1s).
   * Used to show a preview XAF amount in WhatsApp before the user confirms.
   */
  async getIndicativePrice(
    anchorUrl: string,
    sellAsset: string,
    buyAsset: string,
    sellAmount: number,
  ): Promise<Sep38PriceResponse> {
    const res = await axios.get<Sep38PriceResponse>(
      `${anchorUrl}/sep38/price`,
      {
        params: {
          sell_asset: sellAsset,
          buy_asset: buyAsset,
          sell_amount: sellAmount.toFixed(7),
        },
      },
    )
    return res.data
  }

  /**
   * Fetch a firm SEP-38 quote (requires SEP-10 JWT).
   * Returns an id and expires_at that locks the exchange rate.
   * The quote id must be passed to SEP-31 POST /transactions as quote_id.
   */
  async getFirmQuote(
    anchorUrl: string,
    jwt: string,
    sellAsset: string,
    buyAsset: string,
    sellAmount: number,
  ): Promise<Sep38Quote> {
    const res = await axios.post<Sep38Quote>(
      `${anchorUrl}/sep38/quote`,
      {
        sell_asset: sellAsset,
        buy_asset: buyAsset,
        sell_amount: sellAmount.toFixed(7),
        context: 'sep31',
      },
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    logger.info(`[StellarAnchor] Firm quote: ${JSON.stringify(res.data)}`)
    return res.data
  }

  // ─── SEP-24 Hosted Deposit / Withdrawal ───────────────────────────────────

  /**
   * Initiate a SEP-24 interactive deposit (on-ramp: fiat → USDC).
   * Returns an interactive URL that SendSasa sends to the user as a WhatsApp
   * message link. The user completes fiat payment in the anchor's hosted UI.
   *
   * Used for: Circle USD/CAD/EUR on-ramps, MoneyGram MGUSD cash-out.
   */
  async initiateInteractiveDeposit(
    anchorUrl: string,
    jwt: string,
    assetCode: string,
    assetIssuer: string,
    account: string,
    amount: number,
  ): Promise<{ id: string; url: string }> {
    const res = await axios.post<{ id: string; type: string; url: string }>(
      `${anchorUrl}/sep24/transactions/deposit/interactive`,
      {
        asset_code: assetCode,
        asset_issuer: assetIssuer,
        account,
        amount: amount.toFixed(7),
      },
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    logger.info(`[StellarAnchor] SEP-24 deposit initiated: ${res.data.id}`)
    return { id: res.data.id, url: res.data.url }
  }

  /**
   * Initiate a SEP-24 interactive withdrawal (off-ramp: USDC → cash).
   * Used for MoneyGram Ramps cash pickup.
   */
  async initiateInteractiveWithdrawal(
    anchorUrl: string,
    jwt: string,
    assetCode: string,
    account: string,
    amount: number,
  ): Promise<{ id: string; url: string }> {
    const res = await axios.post<{ id: string; type: string; url: string }>(
      `${anchorUrl}/sep24/transactions/withdrawal/interactive`,
      {
        asset_code: assetCode,
        account,
        amount: amount.toFixed(7),
      },
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    logger.info(`[StellarAnchor] SEP-24 withdrawal initiated: ${res.data.id}`)
    return { id: res.data.id, url: res.data.url }
  }

  /**
   * Poll a SEP-24 transaction status.
   * Called when the anchor fires a callback to check current state.
   */
  async getSep24TransactionStatus(
    anchorUrl: string,
    jwt: string,
    transactionId: string,
  ): Promise<{ status: string; stellar_transaction_id?: string }> {
    const res = await axios.get<{
      transaction: { status: string; stellar_transaction_id?: string }
    }>(`${anchorUrl}/sep24/transaction`, {
      params: { id: transactionId },
      headers: { Authorization: `Bearer ${jwt}` },
    })
    return res.data.transaction
  }

  // ─── SEP-24 Convenience: Circle USDC On-Ramp ──────────────────────────────

  /**
   * Full Circle USD on-ramp flow: SEP-10 auth → SEP-38 indicative price →
   * SEP-24 interactive deposit initiation.
   *
   * Returns the interactive URL to send to the user and the sep24 transaction id.
   */
  async initiateCircleDeposit(
    userStellarPublicKey: string,
    currencyCode: 'USD' | 'CAD' | 'EUR',
    amount: number,
  ): Promise<{ interactiveUrl: string; sep24Id: string }> {
    const jwt = await this.getSep10Jwt(
      CIRCLE_ANCHOR_URL,
      this.platformKeypair.publicKey(),
    )

    const { id, url } = await this.initiateInteractiveDeposit(
      CIRCLE_ANCHOR_URL,
      jwt,
      'USDC',
      config.STELLAR_USDC_ISSUER,
      userStellarPublicKey,
      amount,
    )

    logger.info(
      `[StellarAnchor] Circle ${currencyCode} deposit for ${userStellarPublicKey}: ${id}`,
    )
    return { interactiveUrl: url, sep24Id: id }
  }

  // ─── SEP-31 Cross-Border (Onafriq Off-Ramp) ───────────────────────────────

  /**
   * Register a KYC receiver record with Onafriq via SEP-12 before sending.
   * Returns a receiver_id used in the SEP-31 transaction request.
   */
  async registerSep12Receiver(
    mobileNumber: string,
    countryCode: string,
  ): Promise<string> {
    const jwt = await this.getSep10Jwt(ONAFRIQ_ANCHOR_URL)

    const res = await axios.put<{ id: string }>(
      `${ONAFRIQ_ANCHOR_URL}/kyc/customer`,
      {
        type: 'receiver',
        mobile_number: mobileNumber,
        country_code: countryCode,
      },
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    return res.data.id
  }

  /**
   * Initiate a SEP-31 cross-border payment to Onafriq.
   *
   * Returns the SEP-31 transaction record including Onafriq's Stellar
   * distribution account and memo to use in the on-chain payment.
   */
  async initiateSep31Send(
    request: Sep31TransactionRequest,
  ): Promise<Sep31TransactionResponse> {
    const jwt = await this.getSep10Jwt(ONAFRIQ_ANCHOR_URL)

    const res = await axios.post<Sep31TransactionResponse>(
      `${ONAFRIQ_ANCHOR_URL}/sep31/transactions`,
      request,
      { headers: { Authorization: `Bearer ${jwt}` } },
    )

    logger.info(`[StellarAnchor] SEP-31 transaction created: ${res.data.id}`)
    return res.data
  }

  /**
   * Poll a SEP-31 transaction status.
   */
  async getSep31Status(transactionId: string): Promise<{ status: string }> {
    const jwt = await this.getSep10Jwt(ONAFRIQ_ANCHOR_URL)
    const res = await axios.get<{ transaction: { status: string } }>(
      `${ONAFRIQ_ANCHOR_URL}/sep31/transactions/${transactionId}`,
      { headers: { Authorization: `Bearer ${jwt}` } },
    )
    return res.data.transaction
  }

  /**
   * Full off-ramp flow: SEP-38 firm quote → SEP-31 transaction → return
   * Onafriq's Stellar distribution account and memo for the caller to
   * submit a pathPaymentStrictSend on-chain.
   */
  async prepareOnafriqOffRamp(params: {
    recipientPhone: string
    recipientCountryCode: string
    usdcAmount: number
    localCurrencyCode: string
  }): Promise<{
    sep31TransactionId: string
    onafriqStellarAccount: string
    stellarMemo: string
    firmQuote: Sep38Quote
  }> {
    // 1. SEP-10 JWT
    const jwt = await this.getSep10Jwt(ONAFRIQ_ANCHOR_URL)

    // 2. Firm SEP-38 quote
    const firmQuote = await this.getFirmQuote(
      ONAFRIQ_ANCHOR_URL,
      jwt,
      `stellar:USDC:${config.STELLAR_USDC_ISSUER}`,
      `iso4217:${params.localCurrencyCode}`,
      params.usdcAmount,
    )

    // 3. SEP-31 transaction
    const sep31Tx = await this.initiateSep31Send({
      amount: params.usdcAmount.toFixed(7),
      asset_code: 'USDC',
      asset_issuer: config.STELLAR_USDC_ISSUER,
      quote_id: firmQuote.id,
      stellar_payment_account_id: this.platformKeypair.publicKey(),
      fields: {
        receiver: {
          mobile_number: params.recipientPhone,
          country_code: params.recipientCountryCode,
        },
      },
    })

    const onafriqStellarAccount =
      sep31Tx.stellar_account_id || ONAFRIQ_DISTRIBUTION_ACCOUNT
    const stellarMemo = sep31Tx.stellar_memo || sep31Tx.id

    return {
      sep31TransactionId: sep31Tx.id,
      onafriqStellarAccount,
      stellarMemo,
      firmQuote,
    }
  }

  /**
   * Handle a SEP-31 status webhook from Onafriq.
   * Returns the status string ('completed', 'error', 'pending_receiver', etc.)
   */
  async onSep31Webhook(body: { id: string; status: string }): Promise<string> {
    logger.info(`[StellarAnchor] SEP-31 webhook: ${body.id} → ${body.status}`)
    return body.status
  }

  /**
   * Get an indicative XAF-per-USDC rate from Onafriq's SEP-38 anchor.
   * No auth required. Returns null on any failure so callers can fall back
   * to Fixer.io or another source.
   *
   * The SEP-38 `price` field is sell_asset per buy_asset (USDC per XAF),
   * so XAF-per-USDC = 1 / price.
   */
  async getXafPerUsdc(usdcEstimate: number): Promise<number | null> {
    try {
      const anchorBase = ONAFRIQ_ANCHOR_URL.replace(/\/sep\d+.*$/, '')
      const quote = await this.getIndicativePrice(
        anchorBase,
        `stellar:USDC:${config.STELLAR_USDC_ISSUER}`,
        'iso4217:XAF',
        usdcEstimate,
      )
      const xafPerUsdc = 1 / parseFloat(quote.price)
      if (!isFinite(xafPerUsdc) || xafPerUsdc <= 0) return null
      logger.info(`[StellarAnchor] SEP-38 indicative rate: 1 USDC = ${xafPerUsdc.toFixed(2)} XAF`)
      return xafPerUsdc
    } catch {
      return null
    }
  }

  // ─── SEP-24 Convenience: Tempo EURT On-Ramp (SEPA → EURT) ───────────────

  /**
   * Initiate a Tempo SEP-24 interactive deposit: SEPA EUR → EURT on Stellar.
   *
   * The French buyer receives a hosted payment URL from Tempo.
   * They complete a SEPA transfer (no Stellar wallet needed).
   * Tempo issues EURT to the platform's Stellar account on-chain.
   *
   * Designed for B2B export invoicing: exporter invoices a European buyer
   * who pays via SEPA; platform converts EURT → USDC → XAF via Onafriq.
   */
  async initiateTempoDeposit(
    eurAmount: number,
  ): Promise<{ interactiveUrl: string; sep24Id: string }> {
    const jwt = await this.getSep10Jwt(
      TEMPO_ANCHOR_URL,
      this.platformKeypair.publicKey(),
    )

    const { id, url } = await this.initiateInteractiveDeposit(
      TEMPO_ANCHOR_URL,
      jwt,
      'EURT',
      TEMPO_EURT_ISSUER,
      this.platformKeypair.publicKey(), // platform custody — exporter has no Stellar wallet
      eurAmount,
    )

    logger.info(`[StellarAnchor] Tempo SEPA deposit initiated: €${eurAmount} → sep24Id=${id}`)
    return { interactiveUrl: url, sep24Id: id }
  }

  get circleAnchorUrl(): string {
    return CIRCLE_ANCHOR_URL
  }

  get tempoAnchorUrl(): string {
    return TEMPO_ANCHOR_URL
  }

  get tempoEurtIssuer(): string {
    return TEMPO_EURT_ISSUER
  }
}
