import {
  Wallet,
  Payment,
  xrpToDrops,
  dropsToXrp,
  isValidClassicAddress,
  rippleTimeToUnixTime,
  AccountTxTransaction,
} from 'xrpl'
import { xrplClient } from '../config/xrpl'
import { decryptSeed, encryptSeed } from '../utils/encryption'
import {
  WalletInfo,
  TransactionResult,
  BalanceInfo,
  TransactionHistory,
} from '../types'

export async function generateWallet(): Promise<WalletInfo> {
  console.log('\nGenerating new wallet...')

  const client = xrplClient.getClient()

  if (xrplClient.isTestnet()) {
    const { wallet, balance } = await client.fundWallet()

    console.log('Wallet created and funded!')
    console.log(`Address: ${wallet.classicAddress}`)
    console.log(`Balance: ${balance} XRP`)
    console.log(`Seed: ${wallet.seed}`)

    return {
      address: wallet.classicAddress,
      seed: wallet.seed!,
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
    }
  } else {
    const wallet = Wallet.generate()

    console.log('Wallet created!')
    console.log(`Address: ${wallet.classicAddress}`)
    console.log(`Seed: ${wallet.seed}`)
    console.log('MAINNET: Deposit at least 10 XRP to activate this wallet')

    return {
      address: wallet.classicAddress,
      seed: wallet.seed!,
      publicKey: wallet.publicKey,
      privateKey: wallet.privateKey,
    }
  }
}

export function loadWallet(seed: string): Wallet {
  return Wallet.fromSeed(seed)
}

export function loadWalletFromEncrypted(encryptedSeed: string): Wallet {
  const seed = decryptSeed(encryptedSeed)
  return Wallet.fromSeed(seed)
}

export async function sendXRP(
  senderSeed: string,
  destinationAddress: string,
  amount: number,
): Promise<TransactionResult> {
  console.log(`Sending ${amount} XRP to ${destinationAddress}`)

  const client = xrplClient.getClient()
  const senderWallet = Wallet.fromSeed(senderSeed)

  if (!isValidClassicAddress(destinationAddress)) {
    throw new Error('Invalid destination address')
  }

  const tx: Payment = {
    TransactionType: 'Payment',
    Account: senderWallet.classicAddress,
    Destination: destinationAddress,
    Amount: xrpToDrops(amount.toString()),
  }

  try {
    const result = await client.submitAndWait(tx, {
      autofill: true,
      wallet: senderWallet,
    })

    if (!result.result.meta || typeof result.result.meta === 'string') {
      throw new Error('Transaction metadata is missing or invalid')
    }

    const txResult = result.result.meta.TransactionResult

    if (txResult === 'tesSUCCESS') {
      console.log(`Transaction successful: ${result.result.hash}`)

      return {
        success: true,
        hash: result.result.hash,
        amount: amount.toString(),
        from: senderWallet.classicAddress,
        to: destinationAddress,
        message: `Sent ${amount} XRP to ${destinationAddress}`,
      }
    } else {
      throw new Error(`Transaction failed: ${txResult}`)
    }
  } catch (error) {
    console.error('Transaction error:', error)
    throw error
  }
}

export async function getBalance(address: string): Promise<BalanceInfo> {
  console.log(`\nChecking balance for: ${address}`)

  if (!isValidClassicAddress(address)) {
    throw new Error('Invalid XRPL address')
  }

  const client = xrplClient.getClient()

  try {
    const balances = await client.getBalances(address)

    const xrpBalance = balances.find((b) => b.currency === 'XRP')
    const balance = xrpBalance?.value || '0'

    console.log(`Balance: ${balance} XRP`)

    return {
      address,
      balance,
      currency: 'XRP',
    }
  } catch (error: any) {
    if (error.data?.error === 'actNotFound') {
      console.log('Account not found (not yet funded)')
      return {
        address,
        balance: '0',
        currency: 'XRP',
      }
    }
    throw error
  }
}

export async function getHistory(
  address: string,
  limit: number = 10,
): Promise<TransactionHistory[]> {
  console.log(`\nGetting transaction history for: ${address}`)
  console.log(`Limit: ${limit} transactions`)

  if (!isValidClassicAddress(address)) {
    throw new Error('Invalid XRPL address')
  }

  const client = xrplClient.getClient()

  try {
    const request = {
      command: 'account_tx' as const,
      account: address,
      ledger_index_min: -1,
      ledger_index_max: -1,
      limit: limit,
    }

    const response = await client.request(request)

    const transactions: TransactionHistory[] = response.result.transactions
      .map(({ tx_json }: AccountTxTransaction) => {
        if (!tx_json) {
          return null
        }

        const unixTime = rippleTimeToUnixTime(tx_json.date || 0)

        const amount: string =
          typeof tx_json.DeliverMax === 'string'
            ? String(dropsToXrp(tx_json.DeliverMax))
            : '0'

        return {
          hash: tx_json.hash || '',
          date: new Date(unixTime * 1000),
          amount: amount,
          from: tx_json.Account || '',
          to: tx_json.Destination || '',
          direction: tx_json.Account === address ? 'sent' : 'received',
        }
      })
      .filter((tx): tx is TransactionHistory => tx !== null)

    console.log(`Found ${transactions.length} transactions`)

    return transactions
  } catch (error: any) {
    if (error.data?.error === 'actNotFound') {
      console.log('Account not found (no transaction history)')
      return []
    }
    throw error
  }
}

export async function printMoney(
  destinationAddress: string,
  amount: number = 90,
): Promise<string> {
  console.log(
    `\nPrint Money - Funding ${destinationAddress} with ${amount} XRP`,
  )

  if (!xrplClient.isTestnet()) {
    throw new Error('printMoney only works on testnet!')
  }

  const client = xrplClient.getClient()

  const { wallet: tempWallet, balance } = await client.fundWallet()
  console.log(`Temp wallet created: ${tempWallet.classicAddress}`)
  console.log(`Temp wallet balance: ${balance} XRP`)

  const tx: Payment = {
    TransactionType: 'Payment',
    Account: tempWallet.classicAddress,
    Destination: destinationAddress,
    Amount: xrpToDrops(amount.toString()),
  }

  console.log('Submitting payment transaction...')

  const result = await client.submitAndWait(tx, {
    autofill: true,
    wallet: tempWallet,
  })

  if (!result.result.meta || typeof result.result.meta === 'string') {
    throw new Error('Transaction metadata is missing or invalid')
  }

  if (result.result.meta.TransactionResult === 'tesSUCCESS') {
    console.log(`Successfully sent ${amount} XRP!`)
    console.log(`Hash: ${result.result.hash}`)

    const balances = await client.getBalances(destinationAddress)
    const xrpBalance = balances.find((b) => b.currency === 'XRP')
    console.log(`Destination balance: ${xrpBalance?.value || '0'} XRP`)

    return result.result.hash
  } else {
    throw new Error(
      `Transaction failed: ${result.result.meta.TransactionResult}`,
    )
  }
}

export function getEncryptedSeed(seed: string): string {
  return encryptSeed(seed)
}

export function getDecryptedSeed(encryptedSeed: string): string {
  return decryptSeed(encryptedSeed)
}
