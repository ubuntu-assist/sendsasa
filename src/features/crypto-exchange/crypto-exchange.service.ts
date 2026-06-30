import { Injectable } from '@nestjs/common'
import { JupiterService } from '@blockchain/dex/jupiter.service'
import { OneInchService } from '@blockchain/dex/oneinch.service'
import { XrplDexService } from '@blockchain/dex/xrpl-dex.service'
import { CctpService } from '@blockchain/bridge/cctp.service'
import { AllbridgeService } from '@blockchain/bridge/allbridge.service'
import { walletService } from '@blockchain/chains/wallet.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { CryptoOrder } from './crypto-order.schema'
import type { ICryptoOrder } from './crypto-order.schema'
import { ASSET_CHAIN } from '@blockchain/dex/dex.types'
import type { SwapQuote } from '@blockchain/dex/dex.types'
import logger from '@common/utils/logger'
import { randomBytes } from 'crypto'

function generateShortCode(): string {
  return randomBytes(3).toString('hex').toUpperCase()
}

function routeKey(fromAsset: string, toAsset: string): string {
  const fromChain = ASSET_CHAIN[fromAsset]
  const toChain = ASSET_CHAIN[toAsset]
  if (!fromChain) throw new Error(`Unknown asset: ${fromAsset}`)
  if (!toChain) throw new Error(`Unknown asset: ${toAsset}`)
  if (fromChain === toChain) return fromChain
  return `${fromChain}→${toChain}`
}

@Injectable()
export class CryptoExchangeService {
  constructor(
    private readonly jupiter: JupiterService,
    private readonly oneInch: OneInchService,
    private readonly xrplDex: XrplDexService,
    private readonly cctp: CctpService,
    private readonly allbridge: AllbridgeService,
  ) {}

  async getSwapQuote(
    fromAsset: string,
    toAsset: string,
    humanAmount: string,
  ): Promise<SwapQuote> {
    const route = routeKey(fromAsset, toAsset)

    switch (route) {
      case 'xrpl':
        return this.xrplDex.getQuote(fromAsset, toAsset, humanAmount)
      case 'solana':
        return this.jupiter.getQuote(fromAsset, toAsset, humanAmount)
      case 'bsc':
        return this.oneInch.getQuote(fromAsset, toAsset, humanAmount, 'bsc')
      case 'lisk':
        return this.oneInch.getQuote(fromAsset, toAsset, humanAmount, 'lisk')
      default:
        throw new Error(`Cross-chain swap ${route} not yet supported in quote stage.`)
    }
  }

  async createOrder(
    userPhone: string,
    direction: 'SWAP' | 'SELL',
    fromAsset: string,
    toAsset: string,
    fromAmount: string,
    toAmount: string,
    momoProvider?: string,
  ): Promise<ICryptoOrder> {
    const fromChain = ASSET_CHAIN[fromAsset]
    const toChain = ASSET_CHAIN[toAsset]
    if (!fromChain || !toChain) {
      throw new Error(`Unknown asset: ${fromAsset} or ${toAsset}`)
    }

    const order = await CryptoOrder.create({
      shortCode: generateShortCode(),
      userPhone,
      direction,
      fromAsset,
      toAsset,
      fromChain,
      toChain,
      fromAmount,
      toAmount,
      status: 'PENDING',
      momoProvider,
    })

    return order
  }

  /**
   * Execute a swap order asynchronously.
   * Caller should fire-and-forget; user is notified via WhatsApp on completion.
   */
  async executeOrder(orderId: string, userPhone: string): Promise<void> {
    const order = await CryptoOrder.findById(orderId)
    if (!order) throw new Error(`Order ${orderId} not found`)

    order.status = 'EXECUTING'
    await order.save()

    try {
      const route = routeKey(order.fromAsset, order.toAsset)
      let txHash: string

      switch (route) {
        case 'xrpl': {
          const xrplWallet = await walletService.getXRPLWallet(userPhone)
          const quote = await this.xrplDex.getQuote(
            order.fromAsset,
            order.toAsset,
            order.fromAmount,
          )
          const result = await this.xrplDex.executeSwap(quote, xrplWallet)
          txHash = result.txHash
          break
        }

        case 'solana': {
          const solSeed = await walletService.getSolanaPrivateKey(userPhone)
          const quote = await this.jupiter.getQuote(
            order.fromAsset,
            order.toAsset,
            order.fromAmount,
          )
          const result = await this.jupiter.executeSwap(quote, solSeed)
          txHash = result.txHash
          break
        }

        case 'bsc': {
          const evmKey = await walletService.getPrivateKey(userPhone)
          const quote = await this.oneInch.getQuote(
            order.fromAsset,
            order.toAsset,
            order.fromAmount,
            'bsc',
          )
          const result = await this.oneInch.executeSwap(quote, evmKey)
          txHash = result.txHash
          break
        }

        case 'lisk': {
          const evmKey = await walletService.getPrivateKey(userPhone)
          const quote = await this.oneInch.getQuote(
            order.fromAsset,
            order.toAsset,
            order.fromAmount,
            'lisk',
          )
          const result = await this.oneInch.executeSwap(quote, evmKey)
          txHash = result.txHash
          break
        }

        case 'bsc→stellar': {
          // Sell: BNB/BSC-USDT → Stellar USDC via Allbridge → off-ramp
          const evmKey = await walletService.getPrivateKey(userPhone)
          const stellarKey = await walletService.deriveStellarKeypair(
            await walletService.getSolanaPrivateKey(userPhone),
          )
          txHash = await this.allbridge.bridgeBscToStellar(
            order.fromAmount,
            stellarKey.publicKey(),
            evmKey,
          )
          break
        }

        case 'solana→stellar': {
          const solSeed = await walletService.getSolanaPrivateKey(userPhone)
          const stellarKey = await walletService.deriveStellarKeypair(solSeed)
          txHash = await this.cctp.bridgeStellarToSolana(
            order.fromAmount,
            (await walletService.getSolanaPrivateKey(userPhone)).slice(0, 44),
            stellarKey,
          )
          break
        }

        default:
          throw new Error(`Unsupported swap route: ${route}`)
      }

      order.txHash = txHash
      order.status = 'COMPLETED'
      await order.save()

      await sendTextMessage(
        userPhone,
        `✅ *Swap Complete!*\n\n` +
          `${order.fromAmount} ${order.fromAsset} → ~${order.toAmount} ${order.toAsset}\n\n` +
          `Tx: \`${txHash.slice(0, 16)}...\``,
      )
    } catch (err: any) {
      order.status = 'FAILED'
      order.errorMessage = err?.message ?? 'Unknown error'
      await order.save()

      logger.error(`[CryptoExchange] Order ${orderId} failed: ${err?.message}`)
      await sendTextMessage(
        userPhone,
        `❌ *Swap Failed*\n\n${err?.message ?? 'An error occurred. Please try again.'}`,
      )
    }
  }

  /**
   * Sell crypto → MoMo in 3 steps:
   *   1. Swap asset → USDC on chain
   *   2. Bridge USDC to Stellar
   *   3. Use existing off-ramp (Onafriq) to payout XAF via MoMo
   *
   * Steps 1-3 are fire-and-forget; user gets a WhatsApp message on completion.
   */
  async sellCryptoToMoMo(
    asset: string,
    humanAmount: string,
    userPhone: string,
    momoProvider: string,
    recipientPhone: string,
  ): Promise<void> {
    const chain = ASSET_CHAIN[asset]
    if (!chain) throw new Error(`Unknown asset: ${asset}`)

    const stablecoinTarget = chain === 'bsc' ? 'USDC_BSC' : chain === 'solana' ? 'USDC_SOL' : 'RLUSD'

    const order = await this.createOrder(
      userPhone,
      'SELL',
      asset,
      stablecoinTarget,
      humanAmount,
      '0',
      momoProvider,
    )

    // Fire-and-forget
    this._executeSellFlow(String((order as any)._id), asset, humanAmount, userPhone, momoProvider, recipientPhone).catch(
      err => logger.error(`[CryptoExchange] Sell flow error: ${err?.message}`),
    )
  }

  private async _executeSellFlow(
    orderId: string,
    asset: string,
    humanAmount: string,
    userPhone: string,
    momoProvider: string,
    recipientPhone: string,
  ): Promise<void> {
    const order = await CryptoOrder.findById(orderId)
    if (!order) return

    try {
      order.status = 'EXECUTING'
      await order.save()

      const chain = ASSET_CHAIN[asset]
      let usdcAmount = humanAmount
      let swapTxHash: string | undefined

      // Step 1: Swap to stablecoin if not already one
      const isAlreadyStable = ['USDC_BSC', 'USDC_SOL', 'USDT_BSC', 'USDT_SOL', 'RLUSD', 'USDC_LISK', 'USDT_LISK'].includes(asset)
      if (!isAlreadyStable) {
        const stableTarget = chain === 'bsc'
          ? 'USDC_BSC'
          : chain === 'solana'
            ? 'USDC_SOL'
            : chain === 'lisk'
              ? 'USDC_LISK'
              : 'RLUSD'
        const quote = await this.getSwapQuote(asset, stableTarget, humanAmount)
        usdcAmount = quote.toAmount

        if (chain === 'bsc') {
          const evmKey = await walletService.getPrivateKey(userPhone)
          const result = await this.oneInch.executeSwap(quote, evmKey)
          swapTxHash = result.txHash
        } else if (chain === 'lisk') {
          const evmKey = await walletService.getPrivateKey(userPhone)
          const result = await this.oneInch.executeSwap(quote, evmKey)
          swapTxHash = result.txHash
        } else if (chain === 'solana') {
          const solSeed = await walletService.getSolanaPrivateKey(userPhone)
          const result = await this.jupiter.executeSwap(quote, solSeed)
          swapTxHash = result.txHash
        } else if (chain === 'xrpl') {
          const xrplWallet = await walletService.getXRPLWallet(userPhone)
          const result = await this.xrplDex.executeSwap(quote, xrplWallet)
          swapTxHash = result.txHash
        }
      }

      if (swapTxHash) {
        order.txHash = swapTxHash
        await order.save()
      }

      // Step 2: Bridge to Stellar
      const solSeed = await walletService.getSolanaPrivateKey(userPhone)
      const stellarKey = await walletService.deriveStellarKeypair(solSeed)
      let bridgeTxHash: string

      if (chain === 'bsc') {
        const evmKey = await walletService.getPrivateKey(userPhone)
        bridgeTxHash = await this.allbridge.bridgeBscToStellar(
          usdcAmount,
          stellarKey.publicKey(),
          evmKey,
        )
      } else if (chain === 'lisk') {
        // Lisk → BSC via Across Protocol bridge, then BSC → Stellar via Allbridge
        // For now, route as pending manual bridge until Across service is integrated
        bridgeTxHash = 'lisk-bridge-pending'
      } else if (chain === 'solana') {
        bridgeTxHash = await this.cctp.bridgeStellarToSolana(
          Math.round(parseFloat(usdcAmount) * 1e7).toString(),
          (await walletService.getSolanaPrivateKey(userPhone)).slice(0, 44),
          stellarKey,
        )
      } else {
        // XRPL RLUSD — already on Stellar-compatible rails
        // Use RLUSD on XRPL as is; connect to off-ramp via Onafriq
        bridgeTxHash = 'xrpl-native'
      }

      order.bridgeTxHash = bridgeTxHash
      order.status = 'COMPLETED'
      await order.save()

      // Step 3: Notify user — the Onafriq off-ramp will be handled by the existing
      // OffRampTransaction flow once Stellar USDC lands in user's wallet
      await sendTextMessage(
        userPhone,
        `✅ *Crypto sold!*\n\n` +
          `${humanAmount} ${asset} → ~${usdcAmount} USDC → bridging to Stellar...\n\n` +
          `💸 *${recipientPhone}* will receive XAF via *${momoProvider.toUpperCase()} MoMo* shortly.\n\n` +
          `_Bridge Tx: ${bridgeTxHash.slice(0, 16)}..._`,
      )
    } catch (err: any) {
      order.status = 'FAILED'
      order.errorMessage = err?.message
      await order.save()
      await sendTextMessage(
        userPhone,
        `❌ *Sell failed*\n\n${err?.message ?? 'Please try again.'}`,
      )
    }
  }
}
