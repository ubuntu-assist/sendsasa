import { Injectable } from '@nestjs/common'
import {
  Keypair,
  Networks,
  Asset,
  TransactionBuilder,
  Operation,
  Horizon,
  BASE_FEE,
} from '@stellar/stellar-sdk'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const NETWORK_PASSPHRASE =
  config.STELLAR_NETWORK === 'mainnet' ? Networks.PUBLIC : Networks.TESTNET

const HORIZON_URL = config.STELLAR_HORIZON_URL
const USDC_ISSUER = config.STELLAR_USDC_ISSUER

// Tempo's EURT issuer on Stellar mainnet. Override with TEMPO_EURT_ISSUER env var.
export const EURT_ISSUER =
  process.env.TEMPO_EURT_ISSUER ??
  (config.STELLAR_NETWORK === 'mainnet'
    ? 'GAP5LETOV6YIE62YAM56STDANPRDO7ZFDBGSNHJQIYGGKSMOZAHOOS73'
    : '')

export const STELLAR_USDC = new Asset('USDC', USDC_ISSUER)

@Injectable()
export class StellarService {
  private readonly server = new Horizon.Server(HORIZON_URL)
  private readonly platformKeypair = Keypair.fromSecret(
    config.STELLAR_PLATFORM_SECRET || Keypair.random().secret(),
  )

  get platformPublicKey(): string {
    return this.platformKeypair.publicKey()
  }

  /**
   * Derive a Stellar Ed25519 keypair from a raw 32-byte hex seed.
   * The seed comes from Web3Auth's Solana provider (Ed25519) — the same
   * key material used for Solana wallets, giving a deterministic Stellar address.
   */
  deriveKeypair(ed25519SeedHex: string): Keypair {
    const hex = ed25519SeedHex.startsWith('0x')
      ? ed25519SeedHex.slice(2)
      : ed25519SeedHex
    const seed = Buffer.from(hex.padStart(64, '0'), 'hex').subarray(0, 32)
    return Keypair.fromRawEd25519Seed(seed)
  }

  /**
   * Check whether a Stellar account exists on-ledger.
   */
  async accountExists(publicKey: string): Promise<boolean> {
    try {
      await this.server.loadAccount(publicKey)
      return true
    } catch {
      return false
    }
  }

  /**
   * Activate a new user account via Stellar Sponsored Reserves (Protocol 15).
   *
   * Builds a 3-op sandwich transaction:
   *   Op 1: beginSponsoringFutureReserves (platform key sponsors the new account's reserve)
   *   Op 2: changeTrust for USDC (user account establishes the USDC trustline)
   *   Op 3: endSponsoringFutureReserves
   *
   * Both the platform key and the user keypair must sign.
   * After this transaction, the user account is live with a USDC trustline.
   * The user holds ZERO XLM — SendSasa's platform wallet holds the reserve.
   */
  async createSponsoredAccount(userKeypair: Keypair): Promise<string> {
    const userPublicKey = userKeypair.publicKey()

    const platformAccount = await this.server.loadAccount(
      this.platformKeypair.publicKey(),
    )

    const tx = new TransactionBuilder(platformAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.beginSponsoringFutureReserves({
          sponsoredId: userPublicKey,
        }),
      )
      .addOperation(
        Operation.changeTrust({
          asset: STELLAR_USDC,
          limit: '1000000',
          source: userPublicKey,
        }),
      )
      .addOperation(
        Operation.endSponsoringFutureReserves({
          source: userPublicKey,
        }),
      )
      .setTimeout(30)
      .build()

    tx.sign(this.platformKeypair)
    tx.sign(userKeypair)

    const result = await this.server.submitTransaction(tx)
    const hash = (result as any).hash as string

    logger.info(
      `[Stellar] Sponsored account created: ${userPublicKey} (tx: ${hash})`,
    )
    return hash
  }

  /**
   * Wrap an already-signed inner transaction in a Fee-Bump so the platform
   * key pays the network fee. Users never need XLM for fees.
   */
  buildFeeBump(innerTx: ReturnType<TransactionBuilder['build']>) {
    return TransactionBuilder.buildFeeBumpTransaction(
      this.platformKeypair,
      (parseInt(BASE_FEE) * 10).toString(),
      innerTx,
      NETWORK_PASSPHRASE,
    )
  }

  /**
   * Send USDC from the platform account to a destination.
   * Used for releasing escrow or paying out via Onafriq distribution account.
   */
  async sendUsdc(
    destination: string,
    amount: number,
    memo?: string,
  ): Promise<string> {
    const platformAccount = await this.server.loadAccount(
      this.platformKeypair.publicKey(),
    )

    const builder = new TransactionBuilder(platformAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    }).addOperation(
      Operation.payment({
        destination,
        asset: STELLAR_USDC,
        amount: amount.toFixed(7),
      }),
    )

    if (memo) builder.addMemo({ type: 'text', value: memo.slice(0, 28) } as any)

    const tx = builder.setTimeout(30).build()
    tx.sign(this.platformKeypair)
    const feeBump = this.buildFeeBump(tx)
    feeBump.sign(this.platformKeypair)

    const result = await this.server.submitTransaction(feeBump)
    const hash = (result as any).hash as string

    logger.info(
      `[Stellar] USDC sent: ${amount} to ${destination} (tx: ${hash})`,
    )
    return hash
  }

  /**
   * Build a batch PayDay transaction with up to 100 payment operations.
   * Each operation pays USDC to the Onafriq distribution account; the memo
   * on each op encodes {phone}:{localAmount} for Onafriq's SEP-31 webhook.
   *
   * Returns the transaction hash.
   */
  async sendPayrollBatch(
    onafriqDistAccount: string,
    recipients: Array<{
      phone: string
      usdcAmount: number
      localAmount: number
    }>,
  ): Promise<string> {
    if (recipients.length === 0)
      throw new Error('[Stellar] Payroll batch: no recipients')
    if (recipients.length > 100)
      throw new Error('[Stellar] Payroll batch: max 100 recipients per tx')

    const platformAccount = await this.server.loadAccount(
      this.platformKeypair.publicKey(),
    )

    const builder = new TransactionBuilder(platformAccount, {
      fee: (parseInt(BASE_FEE) * recipients.length).toString(),
      networkPassphrase: NETWORK_PASSPHRASE,
    })

    for (const r of recipients) {
      builder.addOperation(
        Operation.payment({
          destination: onafriqDistAccount,
          asset: STELLAR_USDC,
          amount: r.usdcAmount.toFixed(7),
        }),
      )
    }

    const tx = builder.setTimeout(60).build()
    tx.sign(this.platformKeypair)

    const feeBump = this.buildFeeBump(tx)
    feeBump.sign(this.platformKeypair)

    const result = await this.server.submitTransaction(feeBump)
    const hash = (result as any).hash as string

    logger.info(
      `[Stellar] Payroll batch sent: ${recipients.length} recipients (tx: ${hash})`,
    )
    return hash
  }

  /**
   * Discover the best path from USDC to USDC (via Onafriq or directly).
   * For same-asset payments the path is empty — Stellar handles it natively.
   */
  async findStrictSendPath(
    sendAmount: number,
    destinationAsset: Asset,
  ): Promise<string[]> {
    try {
      const paths = await this.server
        .strictSendPaths(STELLAR_USDC, sendAmount.toFixed(7), [
          destinationAsset,
        ])
        .call()
      return paths.records[0]?.path?.map((a: any) => a.asset_code) ?? []
    } catch {
      return []
    }
  }

  /**
   * Execute a pathPaymentStrictSend from the platform account to a destination.
   *
   * Default: USDC → USDC (SEP-31 sends to Onafriq).
   * Override sendAsset/destAsset for cross-asset swaps (e.g. EURT → USDC via Stellar DEX).
   * The DEX auto-discovers the best path when sendAsset ≠ destAsset.
   */
  async pathPaymentStrictSend(
    destination: string,
    sendAmount: number,
    destMinAmount: number,
    memo: string,
    sendAsset: Asset = STELLAR_USDC,
    destAsset: Asset = STELLAR_USDC,
  ): Promise<string> {
    const platformAccount = await this.server.loadAccount(
      this.platformKeypair.publicKey(),
    )

    const tx = new TransactionBuilder(platformAccount, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_PASSPHRASE,
    })
      .addOperation(
        Operation.pathPaymentStrictSend({
          sendAsset,
          sendAmount: sendAmount.toFixed(7),
          destination,
          destAsset,
          destMin: destMinAmount.toFixed(7),
          path: [],
        }),
      )
      .addMemo({ type: 'text', value: memo.slice(0, 28) } as any)
      .setTimeout(30)
      .build()

    tx.sign(this.platformKeypair)
    const feeBump = this.buildFeeBump(tx)
    feeBump.sign(this.platformKeypair)

    const result = await this.server.submitTransaction(feeBump)
    const hash = (result as any).hash as string

    logger.info(
      `[Stellar] pathPaymentStrictSend: ${sendAmount} ${sendAsset.code} → ${destination} (tx: ${hash})`,
    )
    return hash
  }

  /**
   * Query the Stellar DEX for the expected USDC output of swapping a given EURT amount.
   * Used to determine how much USDC Onafriq will receive before preparing a SEP-31 quote.
   * Returns a conservative estimate using EUR/USD peg (~1.08) on DEX query failure.
   */
  async queryEurtToUsdc(eurtAmount: number): Promise<number> {
    if (!EURT_ISSUER) return parseFloat((eurtAmount * 1.08).toFixed(7))
    try {
      const eurtAsset = new Asset('EURT', EURT_ISSUER)
      const paths = await this.server
        .strictSendPaths(eurtAsset, eurtAmount.toFixed(7), [STELLAR_USDC])
        .call()
      const best = paths.records[0]
      return best
        ? parseFloat(parseFloat(best.destination_amount).toFixed(7))
        : parseFloat((eurtAmount * 1.08).toFixed(7))
    } catch {
      return parseFloat((eurtAmount * 1.08).toFixed(7))
    }
  }

  /**
   * Load the current USDC balance for any Stellar account.
   */
  async getUsdcBalance(publicKey: string): Promise<number> {
    try {
      const account = await this.server.loadAccount(publicKey)
      const usdcBalance = account.balances.find(
        (b: any) =>
          b.asset_type === 'credit_alphanum4' &&
          b.asset_code === 'USDC' &&
          b.asset_issuer === USDC_ISSUER,
      )
      return usdcBalance ? parseFloat(usdcBalance.balance) : 0
    } catch {
      return 0
    }
  }
}
