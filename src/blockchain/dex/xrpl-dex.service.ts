import { Injectable } from '@nestjs/common'
import { Client, Wallet, xrpToDrops, getBalanceChanges } from 'xrpl'
import { XRPL_RLUSD_ISSUER, XRPL_RLUSD_HEX } from './dex.types'
import type { SwapQuote, SwapResult } from './dex.types'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

type XrplCurrency =
  | { currency: 'XRP' }
  | { currency: string; issuer: string }

function assetToCurrency(asset: string): XrplCurrency {
  if (asset === 'XRP') return { currency: 'XRP' }
  if (asset === 'RLUSD') return { currency: XRPL_RLUSD_HEX, issuer: XRPL_RLUSD_ISSUER }
  throw new Error(`Unknown XRPL asset: ${asset}`)
}

function currencyToAmount(asset: string, humanAmount: string): string | { currency: string; issuer: string; value: string } {
  if (asset === 'XRP') return xrpToDrops(humanAmount)
  return { currency: XRPL_RLUSD_HEX, issuer: XRPL_RLUSD_ISSUER, value: humanAmount }
}

@Injectable()
export class XrplDexService {
  private getClient(): Client {
    return new Client(config.XRPL_WSS_URL ?? 'wss://xrplcluster.com')
  }

  async getQuote(
    fromAsset: string,
    toAsset: string,
    humanAmount: string,
  ): Promise<SwapQuote> {
    const client = this.getClient()
    await client.connect()
    try {
      const takerGets = assetToCurrency(fromAsset)
      const takerPays = assetToCurrency(toAsset)

      const res = await client.request({
        command: 'book_offers',
        taker_gets: takerGets as any,
        taker_pays: takerPays as any,
        limit: 10,
        ledger_index: 'validated',
      } as any)

      const offers = (res.result as any).offers ?? []
      if (!offers.length) throw new Error('No liquidity on XRPL DEX for this pair')

      // quality = TakerPays / TakerGets (what you receive per unit you give)
      const bestOffer = offers[0]
      const quality = parseFloat(bestOffer.quality ?? '1')
      // quality = drops_pays / drops_gets OR value_pays / value_gets
      // We give fromAmount → we receive fromAmount * quality (for XRP→RLUSD, quality is RLUSD per XRP)
      const toAmountHuman = (parseFloat(humanAmount) * quality).toFixed(6)

      return {
        fromAsset,
        fromChain: 'xrpl',
        toAsset,
        toChain: 'xrpl',
        fromAmount: humanAmount,
        fromAmountAtomic: fromAsset === 'XRP' ? xrpToDrops(humanAmount) : humanAmount,
        toAmount: toAmountHuman,
        toAmountAtomic: toAsset === 'XRP' ? xrpToDrops(toAmountHuman) : toAmountHuman,
        priceImpactPct: '< 1',
        routeLabel: 'XRPL DEX',
        expiresAt: Date.now() + 30_000,
        _raw: { fromAsset, toAsset, humanAmount, quality },
      }
    } finally {
      await client.disconnect()
    }
  }

  async executeSwap(quote: SwapQuote, wallet: Wallet): Promise<SwapResult> {
    const client = this.getClient()
    await client.connect()
    try {
      const offer: any = {
        TransactionType: 'OfferCreate',
        Account: wallet.address,
        TakerGets: currencyToAmount(quote.fromAsset, quote.fromAmount),
        TakerPays: currencyToAmount(quote.toAsset, quote.toAmount),
        Flags: 0x00020000, // tfImmediateOrCancel — fill available, cancel remainder
      }

      const prepared = await client.autofill(offer)
      const signed = wallet.sign(prepared)
      const result = await client.submitAndWait(signed.tx_blob)

      const txResult = (result.result.meta as any)?.TransactionResult ?? 'unknown'
      if (txResult !== 'tesSUCCESS') {
        throw new Error(`XRPL offer failed: ${txResult}`)
      }

      const changes = getBalanceChanges((result.result as any).meta)
      logger.info(`[XRPL DEX] Swap confirmed: ${result.result.hash}`, changes)

      return {
        txHash: result.result.hash,
        fromAmount: quote.fromAmount,
        toAmount: quote.toAmount,
        fromAsset: quote.fromAsset,
        toAsset: quote.toAsset,
        chain: 'xrpl',
      }
    } finally {
      await client.disconnect()
    }
  }
}
