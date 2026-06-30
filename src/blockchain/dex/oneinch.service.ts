import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { ethers } from 'ethers'
import { BSC_TOKENS, LISK_TOKENS } from './dex.types'
import type { SwapQuote, SwapResult } from './dex.types'
import { evmChains } from '@config/chains'
import type { EVMChain } from '@config/chains'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const CHAIN_TOKENS: Record<string, Record<string, string>> = {
  bsc: BSC_TOKENS,
  lisk: LISK_TOKENS,
}

const CHAIN_DECIMALS: Record<string, number> = {
  bsc: 18,
  lisk: 18,
}

function getBaseUrl(chain: EVMChain): string {
  return `https://api.1inch.com/swap/v6.1/${evmChains[chain].chainId}`
}

function getRpcUrl(chain: EVMChain): string {
  if (chain === 'lisk') return config.LISK_RPC_URL ?? 'https://rpc.api.lisk.com'
  if (chain === 'bsc') return config.BSC_RPC_URL ?? 'https://bsc-dataseed.binance.org/'
  return config.ETHEREUM_RPC_URL ?? 'https://rpc.ankr.com/eth'
}

function toHuman(atomic: string, decimals: number): string {
  return parseFloat(ethers.formatUnits(atomic, decimals)).toFixed(6)
}

function toAtomic(human: string, decimals: number): string {
  return ethers.parseUnits(parseFloat(human).toFixed(decimals), decimals).toString()
}

@Injectable()
export class OneInchService {
  private readonly headers = {
    Authorization: `Bearer ${config.ONEINCH_API_KEY ?? ''}`,
  }

  private getProvider(chain: EVMChain): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(getRpcUrl(chain))
  }

  async getQuote(
    fromAsset: string,
    toAsset: string,
    humanAmount: string,
    chain: EVMChain = 'bsc',
  ): Promise<SwapQuote> {
    const tokens = CHAIN_TOKENS[chain]
    if (!tokens) throw new Error(`1inch does not support chain: ${chain}`)

    const src = tokens[fromAsset]
    const dst = tokens[toAsset]
    if (!src || !dst) throw new Error(`Unknown ${chain} asset: ${fromAsset} or ${toAsset}`)

    const decimals = CHAIN_DECIMALS[chain] ?? 18
    const amount = toAtomic(humanAmount, decimals)

    const res = await axios.get(`${getBaseUrl(chain)}/quote`, {
      headers: this.headers,
      params: { src, dst, amount },
    })

    return {
      fromAsset,
      fromChain: chain,
      toAsset,
      toChain: chain,
      fromAmount: humanAmount,
      fromAmountAtomic: amount,
      toAmount: toHuman(res.data.dstAmount, decimals),
      toAmountAtomic: res.data.dstAmount,
      priceImpactPct: '< 1',
      routeLabel: '1inch',
      expiresAt: Date.now() + 60_000,
      _raw: { src, dst, amount, chain },
    }
  }

  async executeSwap(quote: SwapQuote, evmPrivKey: string): Promise<SwapResult> {
    const chain = (quote._raw?.chain ?? 'bsc') as EVMChain
    const key = evmPrivKey.startsWith('0x') ? evmPrivKey : '0x' + evmPrivKey
    const provider = this.getProvider(chain)
    const wallet = new ethers.Wallet(key, provider)

    const res = await axios.get(`${getBaseUrl(chain)}/swap`, {
      headers: this.headers,
      params: {
        src: quote._raw?.src,
        dst: quote._raw?.dst,
        amount: quote.fromAmountAtomic,
        from: wallet.address,
        slippage: 1,
        disableEstimate: false,
      },
    })

    const { tx } = res.data
    const txResponse = await wallet.sendTransaction({
      to: tx.to,
      data: tx.data,
      value: BigInt(tx.value ?? '0'),
      gasLimit: BigInt(Math.ceil((tx.gas ?? 300000) * 1.2)),
    })
    const receipt = await txResponse.wait()

    logger.info(`[1inch/${chain}] Swap confirmed: ${receipt?.hash ?? txResponse.hash}`)
    return {
      txHash: receipt?.hash ?? txResponse.hash,
      fromAmount: quote.fromAmount,
      toAmount: quote.toAmount,
      fromAsset: quote.fromAsset,
      toAsset: quote.toAsset,
      chain,
    }
  }
}
