import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { Connection, VersionedTransaction, Keypair } from '@solana/web3.js'
import { SOLANA_MINTS, SOLANA_DECIMALS } from './dex.types'
import type { SwapQuote, SwapResult } from './dex.types'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const JUPITER_BASE = 'https://api.jup.ag/swap/v1'

function toHuman(atomic: string, mint: string): string {
  const decimals = SOLANA_DECIMALS[mint] ?? 9
  const val = Number(atomic) / Math.pow(10, decimals)
  return val.toFixed(Math.min(decimals, 6))
}

function toAtomic(human: string, mint: string): string {
  const decimals = SOLANA_DECIMALS[mint] ?? 9
  return Math.round(parseFloat(human) * Math.pow(10, decimals)).toString()
}

@Injectable()
export class JupiterService {
  private readonly headers = {
    'x-api-key': config.JUPITER_API_KEY ?? '',
    'Content-Type': 'application/json',
  }

  private getConnection(): Connection {
    return new Connection(
      config.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
      'confirmed',
    )
  }

  async getQuote(
    fromAsset: string,
    toAsset: string,
    humanAmount: string,
    slippageBps = 50,
  ): Promise<SwapQuote> {
    const inputMint = SOLANA_MINTS[fromAsset]
    const outputMint = SOLANA_MINTS[toAsset]
    if (!inputMint || !outputMint) {
      throw new Error(`Unknown Solana asset: ${fromAsset} or ${toAsset}`)
    }

    const amountLamports = toAtomic(humanAmount, inputMint)

    const res = await axios.get(`${JUPITER_BASE}/quote`, {
      headers: this.headers,
      params: {
        inputMint,
        outputMint,
        amount: amountLamports,
        slippageBps,
        restrictIntermediateTokens: true,
      },
    })
    const q = res.data

    return {
      fromAsset,
      fromChain: 'solana',
      toAsset,
      toChain: 'solana',
      fromAmount: humanAmount,
      fromAmountAtomic: q.inAmount,
      toAmount: toHuman(q.outAmount, outputMint),
      toAmountAtomic: q.outAmount,
      priceImpactPct: q.priceImpactPct ?? '0',
      routeLabel: q.routePlan?.[0]?.swapInfo?.label ?? 'Jupiter',
      expiresAt: Date.now() + 30_000,
      _raw: { quoteResponse: q, inputMint, outputMint },
    }
  }

  async executeSwap(quote: SwapQuote, solanaSeedHex: string): Promise<SwapResult> {
    if (!quote._raw?.quoteResponse) throw new Error('Missing raw quote data for Jupiter swap')

    const seedHex = solanaSeedHex.startsWith('0x') ? solanaSeedHex.slice(2) : solanaSeedHex
    const seed = Buffer.from(seedHex.padStart(64, '0'), 'hex').subarray(0, 32)
    const keypair = Keypair.fromSeed(seed)

    const swapRes = await axios.post(
      `${JUPITER_BASE}/swap`,
      {
        quoteResponse: quote._raw.quoteResponse,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: { priorityLevel: 'high', maxLamports: 5_000_000 },
        },
      },
      { headers: this.headers },
    )

    const txBuffer = Buffer.from(swapRes.data.swapTransaction, 'base64')
    const tx = VersionedTransaction.deserialize(txBuffer)
    tx.sign([keypair])

    const conn = this.getConnection()
    const sig = await conn.sendRawTransaction(tx.serialize(), {
      skipPreflight: true,
      maxRetries: 2,
    })
    await conn.confirmTransaction(
      {
        signature: sig,
        blockhash: tx.message.recentBlockhash,
        lastValidBlockHeight: swapRes.data.lastValidBlockHeight,
      },
      'confirmed',
    )

    logger.info(`[Jupiter] Swap confirmed: ${sig}`)
    return {
      txHash: sig,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      fromAsset: quote.fromAsset,
      toAsset: quote.toAsset,
      chain: 'solana',
    }
  }
}
