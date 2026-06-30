import { Injectable } from '@nestjs/common'
import { ethers } from 'ethers'
import { walletService } from '@blockchain/chains/wallet.service'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const BATCH_ABI = [
  'function batchPay(address[] calldata recipients, uint256[] calldata amounts) external',
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
]

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    config.LISK_RPC_URL ?? 'https://rpc.api.lisk.com',
  )
}

export interface BatchPayItem {
  recipientAddress: string
  usdcAmount: string
}

@Injectable()
export class PayDayBatchService {
  private get contractAddress(): string {
    const addr = config.LISK_PAYDAY_BATCH_ADDRESS
    if (!addr) throw new Error('LISK_PAYDAY_BATCH_ADDRESS is not configured')
    return addr
  }

  private get usdcAddress(): string {
    const addr = config.LISK_USDC_ADDRESS
    if (!addr) throw new Error('LISK_USDC_ADDRESS is not configured')
    return addr
  }

  /**
   * Execute a batch USDC payout on Lisk in a single transaction.
   * @param employerPhone - used to sign the transaction
   * @param items - list of {recipientAddress, usdcAmount} (USDC in human units, 6 decimals)
   * @returns transaction hash
   */
  async batchPayout(
    employerPhone: string,
    items: BatchPayItem[],
  ): Promise<string> {
    if (items.length === 0) throw new Error('No payout items')
    if (items.length > 100) throw new Error('Max 100 recipients per batch')

    const provider = getProvider()
    const key = await walletService.getPrivateKey(employerPhone)
    const employerWallet = new ethers.Wallet('0x' + key, provider)

    const recipients = items.map((i) => i.recipientAddress)
    const amounts = items.map((i) => ethers.parseUnits(i.usdcAmount, 6))
    const total = amounts.reduce((sum, a) => sum + a, 0n)

    const usdc = new ethers.Contract(
      this.usdcAddress,
      ERC20_ABI,
      employerWallet,
    )
    const contract = new ethers.Contract(
      this.contractAddress,
      BATCH_ABI,
      employerWallet,
    )

    const approveTx = await usdc.approve(this.contractAddress, total)
    await approveTx.wait()
    logger.info(
      `[PayDayBatch] Approved ${ethers.formatUnits(total, 6)} USDC for batch of ${items.length}`,
    )

    const tx = await contract.batchPay(recipients, amounts)
    const receipt = await tx.wait()

    logger.info(
      `[PayDayBatch] Batch payout complete for ${items.length} recipients: ${receipt?.hash}`,
    )
    return receipt?.hash as string
  }
}
