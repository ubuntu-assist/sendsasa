import { Injectable } from '@nestjs/common'
import { ethers, type TransactionReceipt } from 'ethers'
import { evmChains, tokenAddresses, type EVMChain } from '@config/chains'
import logger from '@common/utils/logger'

const MAX_RETRIES = 2

const ERC20_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
]

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const _providers: Partial<Record<EVMChain, ethers.JsonRpcProvider>> = {}

function getProvider(chain: EVMChain): ethers.JsonRpcProvider {
  let provider = _providers[chain]
  if (!provider) {
    const { rpcUrl, chainId } = evmChains[chain]
    provider = new ethers.JsonRpcProvider(
      rpcUrl,
      chainId,
      { staticNetwork: ethers.Network.from(chainId) },
    )
    _providers[chain] = provider
  }
  return provider
}

function getSigner(secp256k1Key: string, chain: EVMChain): ethers.Wallet {
  const key = secp256k1Key.startsWith('0x') ? secp256k1Key : '0x' + secp256k1Key
  return new ethers.Wallet(key, getProvider(chain))
}

async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
  let lastError: Error = new Error('Unknown error')

  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      return await fn()
    } catch (error: any) {
      lastError = error instanceof Error ? error : new Error(String(error))

      if (
        error?.code === 'INSUFFICIENT_FUNDS' ||
        error?.message?.includes('insufficient funds')
      ) {
        throw new Error('Insufficient balance for transaction + gas fees')
      }

      logger.error(
        `${label} attempt ${attempt}/${MAX_RETRIES + 1} failed: ${lastError.message}`,
      )

      if (attempt <= MAX_RETRIES) {
        await sleep(10_000)
      }
    }
  }

  throw new Error(
    `${label} failed after ${MAX_RETRIES + 1} attempts: ${lastError.message}`,
  )
}

@Injectable()
export class EVMService {
  /**
   * Transfer an ERC-20 token (USDT, USDC, BUSD) on the specified chain.
   *
   * @param secp256k1Key  Raw hex private key (no 0x prefix needed)
   * @param chain         'bsc' | 'base' | 'ethereum'
   * @param tokenSymbol   Token symbol as configured in config/chains.ts
   * @param to            Recipient 0x address
   * @param amount        Human-readable amount (e.g. "10.5")
   */
  async transferToken(
    secp256k1Key: string,
    chain: EVMChain,
    tokenSymbol: string,
    to: string,
    amount: string,
  ): Promise<TransactionReceipt> {
    const tokenAddress = tokenAddresses[chain][tokenSymbol]
    if (!tokenAddress) {
      throw new Error(
        `Token "${tokenSymbol}" is not configured on chain "${chain}"`,
      )
    }

    return withRetry(`EVM transferToken(${tokenSymbol}@${chain})`, async () => {
      const signer = getSigner(secp256k1Key, chain)
      const contract = new ethers.Contract(tokenAddress, ERC20_ABI, signer)

      const decimals: bigint = await contract.decimals()
      const parsedAmount = ethers.parseUnits(amount, decimals)

      const tx = await contract.transfer(to, parsedAmount)
      logger.info(
        `EVM token transfer sent: ${tx.hash} (${amount} ${tokenSymbol} on ${chain})`,
      )

      const receipt = await tx.wait(1)
      if (receipt?.status !== 1) {
        throw new Error(`Transaction reverted: ${tx.hash}`)
      }

      logger.info(`EVM token transfer confirmed: ${tx.hash}`)
      return receipt as TransactionReceipt
    })
  }

  /**
   * Transfer the native token (BNB on BSC, ETH on Base/Ethereum).
   *
   * @param secp256k1Key  Raw hex private key
   * @param chain         'bsc' | 'base' | 'ethereum'
   * @param to            Recipient 0x address
   * @param amount        Human-readable amount (e.g. "0.01")
   */
  async transferNative(
    secp256k1Key: string,
    chain: EVMChain,
    to: string,
    amount: string,
  ): Promise<TransactionReceipt> {
    return withRetry(
      `EVM transferNative(${evmChains[chain].nativeCurrency}@${chain})`,
      async () => {
        const signer = getSigner(secp256k1Key, chain)
        const parsedAmount = ethers.parseEther(amount)

        const tx = await signer.sendTransaction({ to, value: parsedAmount })
        logger.info(
          `EVM native transfer sent: ${tx.hash}` +
            ` (${amount} ${evmChains[chain].nativeCurrency} on ${chain})`,
        )

        const receipt = await tx.wait(1)
        if (receipt?.status !== 1) {
          throw new Error(`Transaction reverted: ${tx.hash}`)
        }

        logger.info(`EVM native transfer confirmed: ${tx.hash}`)
        return receipt
      },
    )
  }

  /**
   * Get balance for an address.
   * Pass tokenSymbol to get ERC-20 balance; omit for native (BNB/ETH).
   *
   * Returns a human-readable string (e.g. "42.5").
   */
  async getBalance(
    address: string,
    chain: EVMChain,
    tokenSymbol?: string,
  ): Promise<string> {
    const provider = getProvider(chain)

    if (!tokenSymbol) {
      const raw = await provider.getBalance(address)
      return ethers.formatEther(raw)
    }

    const tokenAddress = tokenAddresses[chain][tokenSymbol]
    if (!tokenAddress) {
      throw new Error(
        `Token "${tokenSymbol}" is not configured on chain "${chain}"`,
      )
    }

    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, provider)
    const [raw, decimals]: [bigint, bigint] = await Promise.all([
      contract.balanceOf(address),
      contract.decimals(),
    ])

    return ethers.formatUnits(raw, decimals)
  }

  /**
   * Estimate gas cost for a native token transfer (in native currency units).
   */
  async estimateNativeTransferFee(chain: EVMChain): Promise<string> {
    const provider = getProvider(chain)
    const feeData = await provider.getFeeData()
    const gasPrice = feeData.gasPrice ?? 0n
    // Standard native transfer costs 21,000 gas
    const estimatedFee = gasPrice * 21_000n
    return ethers.formatEther(estimatedFee)
  }
}

export const evmService = new EVMService()
