import { Client, Wallet, ECDSA, encodeSeed, Payment, TrustSet, xrpToDrops } from 'xrpl'
import config from '../utils/config'
import logger from '../utils/logger'

export const SENDSASA_SOURCE_TAG = 115611156

const XRPL_NETWORK = config.XRPL_NETWORK
const WEBSOCKET_URL =
  XRPL_NETWORK === 'mainnet'
    ? 'wss://xrplcluster.com'
    : 'wss://s.altnet.rippletest.net:51233'

// ─── Token Configs ────────────────────────────────────────────────────────────

export const RLUSD_MAINNET = {
  issuer: 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De',
  currency: '524C555344000000000000000000000000000000',
}

export const RLUSD_TESTNET = {
  issuer: 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV',
  currency: '524C555344000000000000000000000000000000',
}

export const USDC_MAINNET = {
  issuer: 'rGm7WCVp9gb4jZHWTEtGUr4dd74z2XuWhE',
  currency: '5553444300000000000000000000000000000000',
}

export const USDC_TESTNET = {
  issuer: 'rHuGNhqTG32mfmAvWA8hUyWRLV3tCSwKQt',
  currency: '5553444300000000000000000000000000000000',
}

export const RLUSD = XRPL_NETWORK === 'mainnet' ? RLUSD_MAINNET : RLUSD_TESTNET
export const USDC = XRPL_NETWORK === 'mainnet' ? USDC_MAINNET : USDC_TESTNET

// ─── Key Derivation ──────────────────────────────────────────────────────────

/**
 * Derive an XRPL Wallet from a secp256k1 private key (as returned by Web3Auth).
 *
 * Replicates the algorithm used by @web3auth/xrpl-provider (XrplPrivateKeyProvider):
 *   1. Take the first 16 bytes of the 32-byte key as seed entropy
 *   2. Encode as a secp256k1 XRPL seed (base58 format via xrpl.encodeSeed)
 *   3. Derive the wallet with Wallet.fromSeed using the secp256k1 algorithm
 *
 * This produces the same XRPL address as calling xrpl_getKeyPair through
 * the XrplPrivateKeyProvider, making it suitable for transaction signing when
 * you already have the secp256k1 key from Web3Auth.
 *
 * @param secp256k1Key  64-char hex string, no "0x" prefix required
 */
export function deriveXRPLWalletFromSecp256k1(secp256k1Key: string): Wallet {
  const keyHex = secp256k1Key.startsWith('0x')
    ? secp256k1Key.slice(2)
    : secp256k1Key

  // encodeSeed accepts exactly 16 bytes of entropy for secp256k1 seeds
  const entropy = Buffer.from(keyHex.padStart(64, '0'), 'hex').subarray(0, 16)
  const seed = encodeSeed(entropy, 'secp256k1')

  return Wallet.fromSeed(seed, { algorithm: ECDSA.secp256k1 })
}

// ─── Account Queries ─────────────────────────────────────────────────────────

export async function isAccountActivated(address: string): Promise<boolean> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()
    await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    })
    await client.disconnect()
    return true
  } catch (error: any) {
    await client.disconnect()

    if (
      error?.data?.error === 'actNotFound' ||
      error?.message?.includes('Account not found')
    ) {
      return false
    }

    logger.error('Error checking account activation:', error)
    return false
  }
}

export async function getBalance(
  address: string,
): Promise<{ balance: string; account: string }> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const response = await client.request({
      command: 'account_info',
      account: address,
      ledger_index: 'validated',
    })

    await client.disconnect()

    const balanceInDrops = response.result.account_data.Balance
    const balanceInXRP = Number(balanceInDrops) / 1_000_000

    return { balance: balanceInXRP.toString(), account: address }
  } catch (error: any) {
    await client.disconnect()

    if (
      error?.data?.error === 'actNotFound' ||
      error?.message?.includes('Account not found')
    ) {
      return { balance: '0', account: address }
    }

    logger.error('Error getting XRP balance:', error)
    throw new Error('Failed to get XRP balance')
  }
}

// ─── Trust Lines ─────────────────────────────────────────────────────────────

export async function hasTrustLine(
  address: string,
  currency: string,
  issuer: string,
): Promise<boolean> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    })

    await client.disconnect()

    return response.result.lines.some(
      (line: any) => line.currency === currency && line.account === issuer,
    )
  } catch (error: any) {
    await client.disconnect()
    logger.error('Error checking trust line:', error)
    return false
  }
}

export async function hasRLUSDTrustLine(address: string): Promise<boolean> {
  return hasTrustLine(address, RLUSD.currency, RLUSD.issuer)
}

export async function hasUSDCTrustLine(address: string): Promise<boolean> {
  return hasTrustLine(address, USDC.currency, USDC.issuer)
}

/**
 * Create a trust line on XRPL.
 *
 * @param secp256k1Key  Web3Auth-derived secp256k1 hex key
 */
export async function createTrustLine(
  secp256k1Key: string,
  currency: string,
  issuer: string,
  trustLimit: string = '1000000',
): Promise<{ success: boolean; hash: string }> {
  const client = new Client(WEBSOCKET_URL, { connectionTimeout: 15000 })

  try {
    await client.connect()

    const wallet = deriveXRPLWalletFromSecp256k1(secp256k1Key)

    const trustSet: TrustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: { currency, issuer, value: trustLimit },
      SourceTag: SENDSASA_SOURCE_TAG,
    }

    const prepared = await client.autofill(trustSet)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    await client.disconnect()

    const meta = result.result.meta
    if (!meta || typeof meta === 'string') {
      throw new Error('Transaction metadata unavailable')
    }

    const success = meta.TransactionResult === 'tesSUCCESS'

    if (success) {
      logger.info(`Trust line created for ${currency}: ${result.result.hash}`)
    } else {
      logger.error(`Trust line failed: ${meta.TransactionResult}`)
    }

    return { success, hash: result.result.hash }
  } catch (error) {
    await client.disconnect()
    logger.error('Error creating trust line:', error)
    throw new Error('Failed to create trust line')
  }
}

export async function createRLUSDTrustLine(
  secp256k1Key: string,
): Promise<{ success: boolean; hash: string }> {
  return createTrustLine(secp256k1Key, RLUSD.currency, RLUSD.issuer)
}

export async function createUSDCTrustLine(
  secp256k1Key: string,
): Promise<{ success: boolean; hash: string }> {
  return createTrustLine(secp256k1Key, USDC.currency, USDC.issuer)
}

// ─── Stablecoin Balances ─────────────────────────────────────────────────────

/**
 * Returns '0' if the account is not yet funded rather than throwing.
 */
export async function getStablecoinBalance(
  address: string,
  currency: string,
  issuer: string,
): Promise<string> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const response = await client.request({
      command: 'account_lines',
      account: address,
      ledger_index: 'validated',
    })

    await client.disconnect()

    const line = response.result.lines.find(
      (l: any) => l.currency === currency && l.account === issuer,
    )

    return line ? line.balance : '0'
  } catch (error: any) {
    await client.disconnect()

    if (
      error?.data?.error === 'actNotFound' ||
      error?.message?.includes('Account not found')
    ) {
      logger.info(
        `Account ${address} not yet on ledger — returning 0 for ${currency}`,
      )
      return '0'
    }

    logger.error('Error getting stablecoin balance:', error)
    return '0'
  }
}

export async function getRLUSDBalance(address: string): Promise<string> {
  return getStablecoinBalance(address, RLUSD.currency, RLUSD.issuer)
}

export async function getUSDCBalance(address: string): Promise<string> {
  return getStablecoinBalance(address, USDC.currency, USDC.issuer)
}

export async function getAllBalances(address: string): Promise<{
  xrp: string
  rlusd: string
  usdc: string
}> {
  const [xrpResult, rlusd, usdc] = await Promise.all([
    getBalance(address),
    getRLUSDBalance(address),
    getUSDCBalance(address),
  ])

  return { xrp: xrpResult.balance, rlusd, usdc }
}

// ─── Payments ─────────────────────────────────────────────────────────────────

/**
 * Send XRP to a recipient.
 *
 * @param secp256k1Key  Web3Auth-derived secp256k1 hex key
 */
export async function sendXRP(
  secp256k1Key: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const wallet = deriveXRPLWalletFromSecp256k1(secp256k1Key)

    const payment: Payment = {
      TransactionType: 'Payment',
      Account: wallet.address,
      Destination: recipientAddress,
      Amount: xrpToDrops(amount),
      SourceTag: SENDSASA_SOURCE_TAG,
    }

    const prepared = await client.autofill(payment)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    await client.disconnect()

    const meta = result.result.meta
    if (!meta || typeof meta === 'string') {
      throw new Error('Transaction metadata unavailable')
    }

    if (meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`XRP payment failed: ${meta.TransactionResult}`)
    }

    logger.info(`XRP payment sent: ${result.result.hash}`)
    return { hash: result.result.hash, result: meta.TransactionResult }
  } catch (error) {
    await client.disconnect()
    logger.error('Error sending XRP:', error)
    throw error
  }
}

/**
 * Send an XRPL stablecoin (RLUSD or USDC).
 *
 * @param secp256k1Key  Web3Auth-derived secp256k1 hex key
 */
export async function sendStablecoin(
  secp256k1Key: string,
  recipientAddress: string,
  amount: number,
  currency: string,
  issuer: string,
): Promise<{ hash: string; result: string }> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const wallet = deriveXRPLWalletFromSecp256k1(secp256k1Key)

    const payment: Payment = {
      TransactionType: 'Payment',
      Account: wallet.address,
      Destination: recipientAddress,
      Amount: { currency, issuer, value: amount.toString() },
      SourceTag: SENDSASA_SOURCE_TAG,
    }

    const prepared = await client.autofill(payment)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    await client.disconnect()

    const meta = result.result.meta
    if (!meta || typeof meta === 'string') {
      throw new Error('Transaction metadata unavailable')
    }

    if (meta.TransactionResult !== 'tesSUCCESS') {
      throw new Error(`${currency} payment failed: ${meta.TransactionResult}`)
    }

    return { hash: result.result.hash, result: meta.TransactionResult }
  } catch (error) {
    await client.disconnect()
    logger.error(`Error sending ${currency}:`, error)
    throw error
  }
}

export async function sendRLUSD(
  secp256k1Key: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  return sendStablecoin(
    secp256k1Key,
    recipientAddress,
    amount,
    RLUSD.currency,
    RLUSD.issuer,
  )
}

export async function sendUSDC(
  secp256k1Key: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  return sendStablecoin(
    secp256k1Key,
    recipientAddress,
    amount,
    USDC.currency,
    USDC.issuer,
  )
}

// ─── Transaction History ──────────────────────────────────────────────────────

export async function getHistory(address: string): Promise<any[]> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const response = await client.request({
      command: 'account_tx',
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: 10,
    })

    await client.disconnect()
    return response.result.transactions || []
  } catch (error) {
    await client.disconnect()
    logger.error('Error getting XRPL history:', error)
    return []
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function getDisplayCurrency(currencyCode: string): string {
  if (currencyCode === 'RLUSD') return 'RLUSD'
  if (currencyCode === '5553444300000000000000000000000000000000') return 'USDC'
  if (currencyCode === 'XRP') return 'XRP'
  return currencyCode
}

export function getCurrencyConfig(currency: 'XRP' | 'RLUSD' | 'USDC'): {
  currency: string
  issuer?: string
} {
  if (currency === 'XRP') return { currency: 'XRP' }
  if (currency === 'RLUSD') return { currency: RLUSD.currency, issuer: RLUSD.issuer }
  if (currency === 'USDC') return { currency: USDC.currency, issuer: USDC.issuer }
  throw new Error(`Unknown currency: ${currency}`)
}
