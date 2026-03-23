import { Client, Wallet, Payment, TrustSet, xrpToDrops } from 'xrpl'
import crypto from 'node:crypto'
import config from '../utils/config'

const ENCRYPTION_KEY = config.ENCRYPTION_KEY!
const ALGORITHM = 'aes-256-gcm' as const
const IV_LENGTH = 16

const XRPL_NETWORK = config.XRPL_NETWORK
const WEBSOCKET_URL =
  XRPL_NETWORK === 'mainnet'
    ? 'wss://xrplcluster.com'
    : 'wss://s.altnet.rippletest.net:51233'

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

export async function generateWallet(): Promise<{
  address: string
  seed: string
}> {
  console.log('\nGenerating new wallet...')

  const client = new Client(WEBSOCKET_URL)
  await client.connect()

  try {
    if (XRPL_NETWORK === 'mainnet') {
      const wallet = Wallet.generate()
      await client.disconnect()
      return {
        address: wallet.classicAddress,
        seed: wallet.seed!,
      }
    } else {
      const { wallet, balance } = await client.fundWallet()
      await client.disconnect()
      console.log('Wallet created and funded!')
      console.log(`Address: ${wallet.classicAddress}`)
      console.log(`Balance: ${balance} XRP`)
      return {
        address: wallet.classicAddress,
        seed: wallet.seed!,
      }
    }
  } catch (error) {
    await client.disconnect()
    console.error('❌ Error generating wallet:', error)
    throw error
  }
}

/**
 * Encrypt wallet seed using AES-256-GCM
 * Format: iv:authTag:encryptedData
 */
export function encryptSeed(seed: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv,
  )

  let encrypted = cipher.update(seed, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()

  return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted
}

/**
 * Decrypt wallet seed using AES-256-GCM
 */
export function decryptSeed(encryptedSeed: string): string {
  const parts = encryptedSeed.split(':')

  if (parts.length !== 3) {
    throw new Error('Invalid encrypted seed format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const authTag = Buffer.from(parts[1], 'hex')
  const encryptedText = parts[2]

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    Buffer.from(ENCRYPTION_KEY, 'hex'),
    iv,
  )
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(encryptedText, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}

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

    console.error('Error checking account activation:', error)
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

    return {
      balance: balanceInXRP.toString(),
      account: address,
    }
  } catch (error: any) {
    await client.disconnect()

    if (
      error?.data?.error === 'actNotFound' ||
      error?.message?.includes('Account not found')
    ) {
      return { balance: '0', account: address }
    }

    console.error('Error getting balance:', error)
    throw new Error('Failed to get balance')
  }
}

export async function createTrustLine(
  walletSeed: string,
  currency: string,
  issuer: string,
  trustLimit: string = '1000000',
): Promise<{ success: boolean; hash: string }> {
  const client = new Client(WEBSOCKET_URL, { connectionTimeout: 15000 })

  try {
    await client.connect()

    const wallet = Wallet.fromSeed(walletSeed)

    const trustSet: TrustSet = {
      TransactionType: 'TrustSet',
      Account: wallet.address,
      LimitAmount: {
        currency: currency,
        issuer: issuer,
        value: trustLimit,
      },
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
      console.log(
        `✅ Trust line created for ${currency}: ${result.result.hash}`,
      )
    } else {
      console.log(`❌ Trust line failed: ${meta.TransactionResult}`)
    }

    return { success, hash: result.result.hash }
  } catch (error) {
    await client.disconnect()
    console.error('❌ Error creating trust line:', error)
    throw new Error('Failed to create trust line')
  }
}

export async function createRLUSDTrustLine(
  walletSeed: string,
): Promise<{ success: boolean; hash: string }> {
  return createTrustLine(walletSeed, RLUSD.currency, RLUSD.issuer)
}

export async function createUSDCTrustLine(
  walletSeed: string,
): Promise<{ success: boolean; hash: string }> {
  return createTrustLine(walletSeed, USDC.currency, USDC.issuer)
}

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

    const trustLine = response.result.lines.find(
      (line: any) => line.currency === currency && line.account === issuer,
    )

    return !!trustLine
  } catch (error: any) {
    await client.disconnect()
    console.error('Error checking trust line:', error)
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
 * Get balance for a specific stablecoin.
 * Returns '0' if account not yet funded (actNotFound) instead of throwing.
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
      (line: any) => line.currency === currency && line.account === issuer,
    )

    return line ? line.balance : '0'
  } catch (error: any) {
    await client.disconnect()

    // Account not yet funded on mainnet — no trust lines possible
    if (
      error?.data?.error === 'actNotFound' ||
      error?.message?.includes('Account not found')
    ) {
      console.warn(
        `⚠️ Account ${address} not found on ledger. Returning 0 for ${currency}.`,
      )
      return '0'
    }

    console.error('Error getting stablecoin balance:', error)
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
  const [xrpBalance, rlusdBalance, usdcBalance] = await Promise.all([
    getBalance(address),
    getRLUSDBalance(address),
    getUSDCBalance(address),
  ])

  return {
    xrp: xrpBalance.balance,
    rlusd: rlusdBalance,
    usdc: usdcBalance,
  }
}

export async function sendXRP(
  senderSeed: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const wallet = Wallet.fromSeed(senderSeed)

    const payment: Payment = {
      TransactionType: 'Payment',
      Account: wallet.address,
      Destination: recipientAddress,
      Amount: xrpToDrops(amount),
    }

    const prepared = await client.autofill(payment)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    await client.disconnect()

    const meta = result.result.meta
    if (!meta || typeof meta === 'string') {
      throw new Error('Transaction metadata unavailable')
    }

    const success = meta.TransactionResult === 'tesSUCCESS'

    if (!success) {
      throw new Error(`Payment failed: ${meta.TransactionResult}`)
    }

    console.log(`✅ XRP payment sent: ${result.result.hash}`)

    return { hash: result.result.hash, result: meta.TransactionResult }
  } catch (error) {
    await client.disconnect()
    console.error('❌ Error sending XRP:', error)
    throw error
  }
}

export async function sendStablecoin(
  senderSeed: string,
  recipientAddress: string,
  amount: number,
  currency: string,
  issuer: string,
): Promise<{ hash: string; result: string }> {
  const client = new Client(WEBSOCKET_URL)

  try {
    await client.connect()

    const wallet = Wallet.fromSeed(senderSeed)

    const payment: Payment = {
      TransactionType: 'Payment',
      Account: wallet.address,
      Destination: recipientAddress,
      Amount: {
        currency: currency,
        issuer: issuer,
        value: amount.toString(),
      },
    }

    const prepared = await client.autofill(payment)
    const signed = wallet.sign(prepared)
    const result = await client.submitAndWait(signed.tx_blob)

    await client.disconnect()

    const meta = result.result.meta
    if (!meta || typeof meta === 'string') {
      throw new Error('Transaction metadata unavailable')
    }

    const success = meta.TransactionResult === 'tesSUCCESS'

    if (!success) {
      throw new Error(`Payment failed: ${meta.TransactionResult}`)
    }

    return { hash: result.result.hash, result: meta.TransactionResult }
  } catch (error) {
    await client.disconnect()
    console.error(`❌ Error sending ${currency}:`, error)
    throw error
  }
}

export async function sendRLUSD(
  senderSeed: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  return sendStablecoin(
    senderSeed,
    recipientAddress,
    amount,
    RLUSD.currency,
    RLUSD.issuer,
  )
}

export async function sendUSDC(
  senderSeed: string,
  recipientAddress: string,
  amount: number,
): Promise<{ hash: string; result: string }> {
  return sendStablecoin(
    senderSeed,
    recipientAddress,
    amount,
    USDC.currency,
    USDC.issuer,
  )
}

export function getDecryptedSeed(encryptedSeed: string): string {
  return decryptSeed(encryptedSeed)
}

export function getEncryptedSeed(seed: string): string {
  return encryptSeed(seed)
}

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
  if (currency === 'XRP') {
    return { currency: 'XRP' }
  } else if (currency === 'RLUSD') {
    return { currency: RLUSD.currency, issuer: RLUSD.issuer }
  } else if (currency === 'USDC') {
    return { currency: USDC.currency, issuer: USDC.issuer }
  }
  throw new Error(`Unknown currency: ${currency}`)
}

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
    console.error('Error getting history:', error)
    return []
  }
}
