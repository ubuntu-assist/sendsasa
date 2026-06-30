import { Injectable } from '@nestjs/common'
import { Networks, Keypair, Transaction } from '@stellar/stellar-sdk'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

// @stellar/stellar-sdk/contract is an ESM subpath export — use require() so
// TypeScript's CommonJS module resolver can find it at runtime.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Client: SorobanClient } = require('@stellar/stellar-sdk/contract') as {
  Client: any
}

const NETWORK_PASSPHRASE =
  config.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET

const SOROBAN_RPC_URL = config.STELLAR_SOROBAN_RPC_URL
const TRUSTLOCK_CONTRACT_ID = config.STELLAR_TRUSTLOCK_CONTRACT_ID

// Stellar Asset Contract address for USDC on the configured network.
// On testnet this is the SAC for the test USDC asset; on mainnet it is the
// canonical Circle USDC SAC.
const USDC_SAC_ADDRESS =
  config.STELLAR_NETWORK === 'mainnet'
    ? 'CCW67TSZV3SSS2HXMBQ5JFGCKJNXKZM7UQUWUZPUTHXSTZLEO7EJJUD'
    : 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA'

@Injectable()
export class SorobanTrustlockService {
  private readonly platformKeypair = Keypair.fromSecret(
    config.STELLAR_PLATFORM_SECRET || Keypair.random().secret(),
  )

  private buildSigner() {
    return async (xdr: string) => {
      const tx = new Transaction(xdr, NETWORK_PASSPHRASE)
      tx.sign(this.platformKeypair)
      return tx.toXDR()
    }
  }

  private async getClient(): Promise<any> {
    if (!TRUSTLOCK_CONTRACT_ID) {
      throw new Error('[Soroban] STELLAR_TRUSTLOCK_CONTRACT_ID is not set')
    }
    return SorobanClient.from({
      contractId: TRUSTLOCK_CONTRACT_ID,
      networkPassphrase: NETWORK_PASSPHRASE,
      rpcUrl: SOROBAN_RPC_URL,
      signTransaction: this.buildSigner(),
    })
  }

  /**
   * Lock USDC into the TrustLock escrow contract.
   * The client's Stellar public key must have pre-authorized this invocation
   * (custodial model: the platform key signs on behalf of the user).
   *
   * @param clientPublicKey   Stellar public key of the client (payer)
   * @param providerPublicKey Stellar public key of the service provider (payee)
   * @param usdcAmount        Amount in USDC (e.g. 150.0)
   * @returns transaction hash
   */
  async lock(
    clientPublicKey: string,
    providerPublicKey: string,
    usdcAmount: number,
  ): Promise<string> {
    logger.info(`[Soroban] Locking ${usdcAmount} USDC (${clientPublicKey} → ${providerPublicKey})`)

    const client = await this.getClient()
    // Convert to stroops-like integer (Soroban USDC uses 7 decimal places)
    const amount = BigInt(Math.round(usdcAmount * 1e7))

    const result = await (client as any).lock({
      client: clientPublicKey,
      provider: providerPublicKey,
      amount,
      token: USDC_SAC_ADDRESS,
    })

    const hash = await result.signAndSend()
    logger.info(`[Soroban] Lock tx: ${hash}`)
    return hash as string
  }

  /**
   * Release USDC from escrow to the service provider.
   * Called when the client confirms satisfactory delivery in WhatsApp.
   */
  async release(clientPublicKey: string): Promise<string> {
    logger.info(`[Soroban] Releasing escrow for client ${clientPublicKey}`)

    const client = await this.getClient()
    const result = await (client as any).release({ client: clientPublicKey })

    const hash = await result.signAndSend()
    logger.info(`[Soroban] Release tx: ${hash}`)
    return hash as string
  }

  /**
   * Refund USDC back to the client.
   * Called by the platform key after a Gemini AI dispute verdict of REFUND.
   */
  async refund(clientPublicKey: string): Promise<string> {
    logger.info(`[Soroban] Refunding escrow for client ${clientPublicKey}`)

    const client = await this.getClient()
    const result = await (client as any).refund({ client: clientPublicKey })

    const hash = await result.signAndSend()
    logger.info(`[Soroban] Refund tx: ${hash}`)
    return hash as string
  }

  /**
   * Trigger an automatic release after the 72-hour timeout.
   * Permissionless — anyone can call this once the ledger timestamp
   * exceeds lock_time + 259200 seconds.
   */
  async autoRelease(dealShortCode: string): Promise<string> {
    logger.info(`[Soroban] Auto-releasing deal ${dealShortCode}`)

    const client = await this.getClient()
    const result = await (client as any).auto_release()

    const hash = await result.signAndSend()
    logger.info(`[Soroban] Auto-release tx: ${hash}`)
    return hash as string
  }
}
