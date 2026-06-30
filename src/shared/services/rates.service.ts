import { Injectable } from '@nestjs/common'
import { fxRateService, OFFRAMP_SPREAD } from './fx-rate.service'
import logger from '@common/utils/logger'

interface ProviderRate {
  name: string
  rate: number // XAF per USD
}

interface RatesComparison {
  midMarketRate: number
  providers: ProviderRate[]
  updatedAt: Date
}

// Spreads applied to mid-market rate, sourced from public USD→XAF pricing (updated 2026-05)
const COMPETITOR_SPREADS: Array<{ name: string; spread: number }> = [
  { name: 'SendSasa', spread: OFFRAMP_SPREAD }, // 0.5%
  { name: 'Western Union', spread: 0.0054 }, // ~0.54%
  { name: 'MoneyGram', spread: 0.0094 }, // ~0.94%
  { name: 'WorldRemit', spread: 0.0157 }, // ~1.57%
]

const USD_PEGGED = new Set([
  'USDC',
  'RLUSD',
  'USDT',
  'USDC_BSC',
  'USDC_SOL',
  'USDT_SOL',
])

let cache: RatesComparison | null = null
let cacheExpiry = 0
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutes

async function getCompetitorRates(): Promise<RatesComparison> {
  const now = Date.now()
  if (cache && now < cacheExpiry) return cache

  const midMarketRate = await fxRateService.getUSDtoXAF()
  const providers: ProviderRate[] = COMPETITOR_SPREADS.map(
    ({ name, spread }) => ({
      name,
      rate: midMarketRate * (1 - spread),
    }),
  )

  cache = { midMarketRate, providers, updatedAt: new Date() }
  cacheExpiry = now + CACHE_TTL_MS
  return cache
}

function fmt(n: number): string {
  return Math.floor(n).toLocaleString('en-US')
}

/**
 * Full WhatsApp text message for the "rates" command.
 * usdAmount defaults to 100 so users see a concrete example.
 */
export async function formatRatesMessage(usdAmount = 100): Promise<string> {
  const { midMarketRate, providers } = await getCompetitorRates()

  const rows = providers.map((p) => {
    const xaf = fmt(usdAmount * p.rate)
    return `${p.name === 'SendSasa' ? '✅' : '❌'} *${p.name}*: XAF ${xaf}`
  })

  const sendsasaXaf = Math.floor(
    usdAmount * providers.find((p) => p.name === 'SendSasa')!.rate,
  )
  const worstXaf = Math.min(
    ...providers
      .filter((p) => p.name !== 'SendSasa')
      .map((p) => Math.floor(usdAmount * p.rate)),
  )
  const savings = sendsasaXaf - worstXaf

  return [
    `💱 *Exchange Rate Comparison*`,
    `Sending $${usdAmount} USD → XAF`,
    `Mid-market rate: ${fmt(midMarketRate)} XAF/USD`,
    ``,
    ...rows,
    ``,
    `_SendSasa gives you up to XAF ${fmt(savings)} more than competitors._`,
    `_Our 0.5% spread is among the lowest on the market._`,
  ].join('\n')
}

/**
 * Compact plain-text block for the send money confirmation flow screen.
 * Returns empty string for non-USD-pegged currencies (skips the section).
 */
export async function getFlowRateComparison(
  usdAmount: number,
  currency: string,
): Promise<string> {
  if (!USD_PEGGED.has(currency)) return ''

  try {
    const { providers } = await getCompetitorRates()
    const rows = providers.map((p) => {
      const xaf = fmt(usdAmount * p.rate)
      const tag = p.name === 'SendSasa' ? ' (best)' : ''
      return `${p.name}: XAF ${xaf}${tag}`
    })
    return rows.join('\n')
  } catch (err) {
    logger.error('rates.service: getFlowRateComparison failed', err)
    return '' // degrade gracefully — don't block the send flow
  }
}

@Injectable()
export class RatesService {
  formatRatesMessage(usdAmount?: number) { return formatRatesMessage(usdAmount) }
  getFlowRateComparison(usdAmount: number, currency: string) { return getFlowRateComparison(usdAmount, currency) }
}
