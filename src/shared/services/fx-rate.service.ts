import { Injectable } from '@nestjs/common'
import axios from 'axios'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const FIXER_BASE = 'https://data.fixer.io/api'
const COINGECKO_BASE = 'https://api.coingecko.com/api/v3'
const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

export const OFFRAMP_SPREAD = 0.005   // 0.5%
export const FIAT_CURRENCY = 'XAF'

// Stablecoins treated as exactly 1 USD
const STABLECOIN_USD: Record<string, number> = {
  RLUSD: 1,
  USDC: 1,
  USDT: 1,
}

export interface QuoteResult {
  cryptoAmount: number
  cryptoCurrency: string
  cryptoAmountUSD: number     // USD equivalent
  fixerRate: number           // raw Fixer.io USD/XAF
  sendSasaRate: number        // after spread
  xafAmount: number           // recipient receives
  feeXAF: number              // SendSasa fee
  rateDisplay: string         // "1 USDC = 597 XAF"
}

interface CacheEntry {
  value: number
  expiresAt: number
}

@Injectable()
export class FxRateService {
  private readonly cache = new Map<string, CacheEntry>()

  // ── Internal helpers ──────────────────────────────────────────────────────

  private getCached(key: string): number | null {
    const entry = this.cache.get(key)
    if (entry && Date.now() < entry.expiresAt) return entry.value
    return null
  }

  private setCached(key: string, value: number): void {
    this.cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS })
  }

  // ── Fixer.io: USD → XAF ───────────────────────────────────────────────────
  //
  // Free plan base = EUR. Derive USD/XAF:
  //   rates.XAF / rates.USD  =  (XAF per EUR) / (USD per EUR)  =  XAF per USD
  //
  // Paid plan base = USD: rates.XAF gives USD/XAF directly.

  async getUSDtoXAF(): Promise<number> {
    const cacheKey = 'USD_XAF'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    const apiKey = config.FIXER_API_KEY
    if (!apiKey) {
      logger.info('FIXER_API_KEY not set — using fallback rate 612 XAF/USD')
      return 612  // approximate fallback; replace with real key in production
    }

    try {
      const { data } = await axios.get(`${FIXER_BASE}/latest`, {
        params: { access_key: apiKey, symbols: 'XAF,USD' },
        timeout: 8000,
      })

      if (!data.success) {
        throw new Error(`Fixer.io error: ${JSON.stringify(data.error)}`)
      }

      const rates = data.rates as Record<string, number>

      // Free plan (EUR base): XAF/EUR ÷ USD/EUR = XAF/USD
      // Paid plan (USD base): rates.XAF is already XAF/USD
      const usdXaf = data.base === 'USD'
        ? rates.XAF
        : rates.XAF / rates.USD

      this.setCached(cacheKey, usdXaf)
      logger.info(`Fixer.io USD/XAF rate: ${usdXaf}`)
      return usdXaf
    } catch (error: any) {
      logger.error('Fixer.io request failed:', error.message)
      // Return cached value even if stale before throwing
      const stale = this.cache.get(cacheKey)
      if (stale) {
        logger.info('Using stale Fixer.io rate due to API error')
        return stale.value
      }
      throw new Error('Failed to fetch exchange rate. Please try again.')
    }
  }

  // ── CoinGecko: XRP → USD ──────────────────────────────────────────────────

  async getXRPtoUSD(): Promise<number> {
    const cacheKey = 'XRP_USD'
    const cached = this.getCached(cacheKey)
    if (cached) return cached

    try {
      const { data } = await axios.get(`${COINGECKO_BASE}/simple/price`, {
        params: { ids: 'ripple', vs_currencies: 'usd' },
        timeout: 8000,
      })

      const price = data.ripple.usd as number
      this.setCached(cacheKey, price)
      logger.info(`CoinGecko XRP/USD: ${price}`)
      return price
    } catch (error: any) {
      logger.error('CoinGecko request failed:', error.message)
      const stale = this.cache.get(cacheKey)
      if (stale) return stale.value
      throw new Error('Failed to fetch XRP price. Please try again.')
    }
  }

  // ── Raw rates (for card payment quote) ───────────────────────────────────

  async getRates(): Promise<{ fixerRate: number; sendSasaRate: number }> {
    const fixerRate = await this.getUSDtoXAF()
    const sendSasaRate = fixerRate * (1 - OFFRAMP_SPREAD)
    return { fixerRate, sendSasaRate }
  }

  // ── Quote calculation ─────────────────────────────────────────────────────

  async calculateQuote(
    cryptoAmount: number,
    cryptoCurrency: string,
  ): Promise<QuoteResult> {
    // 1. Determine USD value of the crypto amount
    let cryptoAmountUSD: number
    if (STABLECOIN_USD[cryptoCurrency] !== undefined) {
      cryptoAmountUSD = cryptoAmount * STABLECOIN_USD[cryptoCurrency]
    } else if (cryptoCurrency === 'XRP') {
      const xrpUsd = await this.getXRPtoUSD()
      cryptoAmountUSD = cryptoAmount * xrpUsd
    } else {
      throw new Error(`Unsupported off-ramp currency: ${cryptoCurrency}`)
    }

    // 2. Get Fixer.io rate and apply spread
    const fixerRate = await this.getUSDtoXAF()
    const sendSasaRate = fixerRate * (1 - OFFRAMP_SPREAD)

    // 3. Calculate XAF amounts
    const grossXAF = cryptoAmountUSD * fixerRate
    const xafAmount = Math.floor(cryptoAmountUSD * sendSasaRate)
    const feeXAF = Math.ceil(grossXAF - xafAmount)

    return {
      cryptoAmount,
      cryptoCurrency,
      cryptoAmountUSD,
      fixerRate,
      sendSasaRate,
      xafAmount,
      feeXAF,
      rateDisplay: `1 ${cryptoCurrency} = ${Math.floor(sendSasaRate * (cryptoAmountUSD / cryptoAmount))} ${FIAT_CURRENCY}`,
    }
  }
}

export const fxRateService = new FxRateService()
