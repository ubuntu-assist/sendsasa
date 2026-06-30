import { Injectable } from '@nestjs/common'
import { ethers } from 'ethers'
import { walletService } from '@blockchain/chains/wallet.service'
import { getAdminSecp256k1Key } from '@config/admin-wallet'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const TRUSTLOCK_ABI = [
  'function lock(bytes32 dealId, address seller, uint256 amount, uint256 expiresAt) external',
  'function release(bytes32 dealId) external',
  'function dispute(bytes32 dealId) external',
  'function adminRelease(bytes32 dealId) external',
  'function adminRefund(bytes32 dealId) external',
  'function deals(bytes32) external view returns (address buyer, address seller, uint256 amount, uint256 fee, uint8 status, uint256 expiresAt)',
  'event DealLocked(bytes32 indexed dealId, address buyer, address seller, uint256 amount)',
  'event DealReleased(bytes32 indexed dealId)',
  'event DealRefunded(bytes32 indexed dealId)',
  'event DealDisputed(bytes32 indexed dealId)',
]

const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]

function getProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    config.LISK_RPC_URL ?? 'https://rpc.api.lisk.com',
  )
}

function dealIdBytes(shortCode: string): string {
  return ethers.zeroPadValue(ethers.toUtf8Bytes(shortCode), 32)
}

@Injectable()
export class LiskTrustlockService {
  private get contractAddress(): string {
    const addr = config.LISK_TRUSTLOCK_ADDRESS
    if (!addr) throw new Error('LISK_TRUSTLOCK_ADDRESS is not configured')
    return addr
  }

  private get usdcAddress(): string {
    const addr = config.LISK_USDC_ADDRESS
    if (!addr) throw new Error('LISK_USDC_ADDRESS is not configured')
    return addr
  }

  /**
   * Lock USDC in the TrustLock contract on behalf of the buyer.
   * The platform admin wallet sends USDC to the contract (after receiving XAF via pawaPay).
   */
  async lockDeal(
    dealShortCode: string,
    sellerLiskAddress: string,
    usdcAmount: string,
    expiresAt: Date,
  ): Promise<string> {
    const provider = getProvider()
    const adminKey = await getAdminSecp256k1Key()
    const adminWallet = new ethers.Wallet('0x' + adminKey, provider)

    const usdc = new ethers.Contract(this.usdcAddress, ERC20_ABI, adminWallet)
    const contract = new ethers.Contract(
      this.contractAddress,
      TRUSTLOCK_ABI,
      adminWallet,
    )

    const amountWei = ethers.parseUnits(usdcAmount, 6) // USDC has 6 decimals
    const dealId = dealIdBytes(dealShortCode)
    const expiresTimestamp = Math.floor(expiresAt.getTime() / 1000)

    // Approve contract to pull USDC from admin wallet
    const approveTx = await usdc.approve(this.contractAddress, amountWei)
    await approveTx.wait()
    logger.info(
      `[LiskTrustlock] Approved ${usdcAmount} USDC for deal ${dealShortCode}`,
    )

    const tx = await contract.lock(
      dealId,
      sellerLiskAddress,
      amountWei,
      expiresTimestamp,
    )
    const receipt = await tx.wait()

    logger.info(`[LiskTrustlock] Locked deal ${dealShortCode}: ${receipt.hash}`)
    return receipt.hash as string
  }

  /**
   * Release funds to seller. Called when buyer confirms delivery.
   * Buyer signs the release via their derived Lisk wallet.
   */
  async releaseDeal(
    dealShortCode: string,
    buyerPhone: string,
  ): Promise<string> {
    const provider = getProvider()
    const key = await walletService.getPrivateKey(buyerPhone)
    const buyerWallet = new ethers.Wallet('0x' + key, provider)
    const contract = new ethers.Contract(
      this.contractAddress,
      TRUSTLOCK_ABI,
      buyerWallet,
    )

    const dealId = dealIdBytes(dealShortCode)
    const tx = await contract.release(dealId)
    const receipt = await tx.wait()

    logger.info(
      `[LiskTrustlock] Released deal ${dealShortCode}: ${receipt.hash}`,
    )
    return receipt.hash as string
  }

  /**
   * File a dispute. Either buyer or seller can dispute.
   */
  async disputeDeal(
    dealShortCode: string,
    callerPhone: string,
  ): Promise<string> {
    const provider = getProvider()
    const key = await walletService.getPrivateKey(callerPhone)
    const callerWallet = new ethers.Wallet('0x' + key, provider)
    const contract = new ethers.Contract(
      this.contractAddress,
      TRUSTLOCK_ABI,
      callerWallet,
    )

    const dealId = dealIdBytes(dealShortCode)
    const tx = await contract.dispute(dealId)
    const receipt = await tx.wait()

    logger.info(
      `[LiskTrustlock] Disputed deal ${dealShortCode}: ${receipt.hash}`,
    )
    return receipt.hash as string
  }

  /** Admin releases funds to seller after dispute resolution (Gemini AI verdict: RELEASE). */
  async adminRelease(dealShortCode: string): Promise<string> {
    return this._adminAction(dealShortCode, 'adminRelease')
  }

  /** Admin refunds buyer after dispute resolution (Gemini AI verdict: REFUND). */
  async adminRefund(dealShortCode: string): Promise<string> {
    return this._adminAction(dealShortCode, 'adminRefund')
  }

  private async _adminAction(
    dealShortCode: string,
    method: 'adminRelease' | 'adminRefund',
  ): Promise<string> {
    const provider = getProvider()
    const adminKey = await getAdminSecp256k1Key()
    const adminWallet = new ethers.Wallet('0x' + adminKey, provider)
    const contract = new ethers.Contract(
      this.contractAddress,
      TRUSTLOCK_ABI,
      adminWallet,
    )

    const dealId = dealIdBytes(dealShortCode)
    const tx = await (
      contract[method] as (id: string) => Promise<ethers.TransactionResponse>
    )(dealId)
    const receipt = await tx.wait()

    logger.info(
      `[LiskTrustlock] ${method} for deal ${dealShortCode}: ${receipt?.hash}`,
    )
    return receipt?.hash as string
  }

  async getDeal(dealShortCode: string) {
    const provider = getProvider()
    const contract = new ethers.Contract(
      this.contractAddress,
      TRUSTLOCK_ABI,
      provider,
    )
    const dealId = dealIdBytes(dealShortCode)
    return contract.deals(dealId)
  }
}
