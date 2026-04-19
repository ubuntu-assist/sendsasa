/// <reference types="node" />
/**
 * Phase B fund migration: moves XRP, RLUSD, and USDC from legacy encrypted-seed
 * wallets (xrplAddress) to Web3Auth-derived wallets (xrpl_address).
 *
 * Sequence per user:
 *   1. Decrypt old seed  →  old XRPL wallet
 *   2. Derive new wallet via Web3Auth XRPL provider
 *   3. Activate new address (send 2 XRP from old → new)
 *   4. Create RLUSD trustline on new address  (if old had RLUSD)
 *   5. Create USDC  trustline on new address  (if old had USDC)
 *   6. Transfer RLUSD balance old → new
 *   7. Transfer USDC  balance old → new
 *   8. Transfer remaining XRP  old → new  (leaves 1.6 XRP reserve on old)
 *   9. Update DB flags
 *
 * Safe to re-run — every step checks current on-ledger state before acting.
 *
 * Usage:
 *   npx ts-node scripts/migrate-funds.ts             # live run
 *   npx ts-node scripts/migrate-funds.ts --dry-run   # preview only, no txns
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { Client, Wallet, xrpToDrops, dropsToXrp, type Payment, type TrustSet } from 'xrpl'
import { User } from '../src/models'
import { walletService } from '../src/services/wallet.service'
import { decryptSeed } from '../src/utils/encryption'
import { RLUSD, USDC, SENDSASA_SOURCE_TAG } from '../src/services/xrpl.service'
import config from '../src/utils/config'

// ── Config ────────────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run')

const XRPL_NETWORK = config.XRPL_NETWORK
const WEBSOCKET_URL =
  XRPL_NETWORK === 'mainnet'
    ? 'wss://xrplcluster.com'
    : 'wss://s.altnet.rippletest.net:51233'

/**
 * XRP to keep on the old address after migration.
 * As of December 2024, XRPL base reserve = 1 XRP.
 *   1.0 XRP base reserve
 * + 0.4 XRP owner reserve (2 trustlines × 0.2 XRP each — kept because deleting
 *   zero-balance trustlines is an optional cleanup step not done here)
 * + 0.1 XRP fee buffer
 */
const KEEP_ON_OLD_XRP = 1.5

/**
 * XRP to send first to activate the new address and cover its trustline reserves.
 * As of December 2024, XRPL base reserve = 1 XRP.
 *   1.0 XRP base reserve
 * + 0.4 XRP for up to 2 trustlines (0.2 XRP each)
 * + 0.1 XRP fee buffer
 */
const ACTIVATION_XRP = 1.5

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function log(msg: string) {
  process.stdout.write(msg)
}

function logLine(msg: string) {
  console.log(msg)
}

// ── Low-level XRPL helpers (operate on Wallet directly, no Web3Auth) ─────────

async function xrplIsActivated(client: Client, address: string): Promise<boolean> {
  try {
    await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
    return true
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return false
    throw e
  }
}

async function xrplGetXRP(client: Client, address: string): Promise<number> {
  try {
    const res = await client.request({ command: 'account_info', account: address, ledger_index: 'validated' })
    return Number(dropsToXrp(res.result.account_data.Balance))
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return 0
    throw e
  }
}

async function xrplGetTokenBalance(
  client: Client,
  address: string,
  currency: string,
  issuer: string,
): Promise<number> {
  try {
    const res = await client.request({ command: 'account_lines', account: address, ledger_index: 'validated' })
    const line = res.result.lines.find((l: any) => l.currency === currency && l.account === issuer)
    return line ? Math.abs(Number(line.balance)) : 0
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return 0
    throw e
  }
}

async function xrplHasTrustLine(
  client: Client,
  address: string,
  currency: string,
  issuer: string,
): Promise<boolean> {
  try {
    const res = await client.request({ command: 'account_lines', account: address, ledger_index: 'validated' })
    return res.result.lines.some((l: any) => l.currency === currency && l.account === issuer)
  } catch (e: any) {
    if (e?.data?.error === 'actNotFound') return false
    throw e
  }
}

async function xrplSendXRP(
  client: Client,
  senderWallet: Wallet,
  destination: string,
  amountXrp: number,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) return 'DRY_RUN'

  const payment: Payment = {
    TransactionType: 'Payment',
    Account: senderWallet.address,
    Destination: destination,
    Amount: xrpToDrops(amountXrp),
    SourceTag: SENDSASA_SOURCE_TAG,
  }

  const prepared = await client.autofill(payment)
  const signed = senderWallet.sign(prepared)
  const result = await client.submitAndWait(signed.tx_blob)

  const meta = result.result.meta
  if (!meta || typeof meta === 'string' || meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`XRP send failed: ${typeof meta === 'string' ? meta : meta?.TransactionResult}`)
  }
  return result.result.hash
}

async function xrplSendToken(
  client: Client,
  senderWallet: Wallet,
  destination: string,
  amount: number,
  currency: string,
  issuer: string,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) return 'DRY_RUN'

  const payment: Payment = {
    TransactionType: 'Payment',
    Account: senderWallet.address,
    Destination: destination,
    Amount: { currency, issuer, value: amount.toFixed(6) },
    SourceTag: SENDSASA_SOURCE_TAG,
  }

  const prepared = await client.autofill(payment)
  const signed = senderWallet.sign(prepared)
  const result = await client.submitAndWait(signed.tx_blob)

  const meta = result.result.meta
  if (!meta || typeof meta === 'string' || meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`Token send failed: ${typeof meta === 'string' ? meta : meta?.TransactionResult}`)
  }
  return result.result.hash
}

async function xrplCreateTrustLine(
  client: Client,
  wallet: Wallet,
  currency: string,
  issuer: string,
  dryRun: boolean,
): Promise<string> {
  if (dryRun) return 'DRY_RUN'

  const trustSet: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.address,
    LimitAmount: { currency, issuer, value: '1000000' },
    SourceTag: SENDSASA_SOURCE_TAG,
  }

  const prepared = await client.autofill(trustSet)
  const signed = wallet.sign(prepared)
  const result = await client.submitAndWait(signed.tx_blob)

  const meta = result.result.meta
  if (!meta || typeof meta === 'string' || meta.TransactionResult !== 'tesSUCCESS') {
    throw new Error(`TrustSet failed: ${typeof meta === 'string' ? meta : meta?.TransactionResult}`)
  }
  return result.result.hash
}

// ── Per-user migration ────────────────────────────────────────────────────────

interface MigrationResult {
  phone: string
  status: 'skipped' | 'success' | 'failed'
  reason?: string
  steps: string[]
}

async function migrateUser(
  client: Client,
  user: any,
  dryRun: boolean,
): Promise<MigrationResult> {
  const phone = user.phoneNumber
  const masked = phone.slice(0, 5) + '***'
  const steps: string[] = []

  // ── Validate prerequisites ─────────────────────────────────────────────────

  if (!user.encryptedSeed) {
    return { phone, status: 'skipped', reason: 'no encryptedSeed (new user)', steps }
  }
  if (!user.xrplAddress) {
    return { phone, status: 'skipped', reason: 'no xrplAddress', steps }
  }
  if (!user.xrpl_address) {
    return { phone, status: 'skipped', reason: 'no xrpl_address — run migrate-wallets.ts first', steps }
  }
  if (user.xrplAddress === user.xrpl_address) {
    return { phone, status: 'skipped', reason: 'old and new address are the same', steps }
  }

  const oldAddr = user.xrplAddress
  const newAddr = user.xrpl_address

  try {
    // ── Step 1: Get old wallet from encrypted seed ─────────────────────────

    let oldWallet: Wallet
    try {
      const seed = decryptSeed(user.encryptedSeed)
      oldWallet = Wallet.fromSeed(seed)
    } catch (e: any) {
      return { phone, status: 'failed', reason: `failed to decrypt old seed: ${e.message}`, steps }
    }

    if (oldWallet.classicAddress !== oldAddr) {
      return {
        phone,
        status: 'failed',
        reason: `seed derives ${oldWallet.classicAddress}, expected ${oldAddr} — seed mismatch`,
        steps,
      }
    }

    // ── Step 2: Check old balances ─────────────────────────────────────────

    const oldXRP = await xrplGetXRP(client, oldAddr)
    const oldRLUSD = await xrplGetTokenBalance(client, oldAddr, RLUSD.currency, RLUSD.issuer)
    const oldUSDC = await xrplGetTokenBalance(client, oldAddr, USDC.currency, USDC.issuer)

    steps.push(`old balances — XRP: ${oldXRP.toFixed(6)}, RLUSD: ${oldRLUSD}, USDC: ${oldUSDC}`)

    const hasAnything = oldXRP > KEEP_ON_OLD_XRP + 0.01 || oldRLUSD > 0 || oldUSDC > 0

    if (!hasAnything) {
      return { phone, status: 'skipped', reason: 'nothing to migrate (balances at or below reserve)', steps }
    }

    // ── Step 3: Get new XRPL wallet from Web3Auth ──────────────────────────

    let newWallet: Wallet
    try {
      const xrplWallet = await walletService.getXRPLWallet(phone)
      // xrpl library Wallet vs xrpl Wallet — both expose sign() and classicAddress
      newWallet = xrplWallet as unknown as Wallet
    } catch (e: any) {
      return { phone, status: 'failed', reason: `Web3Auth XRPL failed: ${e.message}`, steps }
    }

    if (newWallet.classicAddress !== newAddr) {
      return {
        phone,
        status: 'failed',
        reason: `Web3Auth derives ${newWallet.classicAddress}, DB says ${newAddr} — address mismatch`,
        steps,
      }
    }

    // ── Step 4: Activate new address ───────────────────────────────────────

    const newIsActivated = await xrplIsActivated(client, newAddr)
    if (!newIsActivated) {
      const activationAmount = Math.min(ACTIVATION_XRP, oldXRP - KEEP_ON_OLD_XRP)
      if (activationAmount < 1) {
        return {
          phone,
          status: 'failed',
          reason: `old address only has ${oldXRP.toFixed(6)} XRP — not enough to activate new address (need ${KEEP_ON_OLD_XRP + 1} XRP total)`,
          steps,
        }
      }
      const hash = await xrplSendXRP(client, oldWallet, newAddr, activationAmount, dryRun)
      steps.push(`activated new address: sent ${activationAmount.toFixed(6)} XRP  (tx: ${hash})`)
      if (!dryRun) await sleep(4000) // wait for ledger close
    } else {
      steps.push('new address already activated')
    }

    // ── Step 5: Create RLUSD trustline on new address ──────────────────────

    if (oldRLUSD > 0) {
      const hasRLUSD = await xrplHasTrustLine(client, newAddr, RLUSD.currency, RLUSD.issuer)
      if (!hasRLUSD) {
        const hash = await xrplCreateTrustLine(client, newWallet, RLUSD.currency, RLUSD.issuer, dryRun)
        steps.push(`created RLUSD trustline on new address  (tx: ${hash})`)
        if (!dryRun) await sleep(4000)
      } else {
        steps.push('RLUSD trustline already exists on new address')
      }
    }

    // ── Step 6: Create USDC trustline on new address ───────────────────────

    if (oldUSDC > 0) {
      const hasUSDC = await xrplHasTrustLine(client, newAddr, USDC.currency, USDC.issuer)
      if (!hasUSDC) {
        const hash = await xrplCreateTrustLine(client, newWallet, USDC.currency, USDC.issuer, dryRun)
        steps.push(`created USDC trustline on new address  (tx: ${hash})`)
        if (!dryRun) await sleep(4000)
      } else {
        steps.push('USDC trustline already exists on new address')
      }
    }

    // ── Step 7: Transfer RLUSD ─────────────────────────────────────────────

    if (oldRLUSD > 0) {
      const currentRLUSD = await xrplGetTokenBalance(client, oldAddr, RLUSD.currency, RLUSD.issuer)
      if (currentRLUSD > 0) {
        const hash = await xrplSendToken(
          client, oldWallet, newAddr, currentRLUSD, RLUSD.currency, RLUSD.issuer, dryRun,
        )
        steps.push(`transferred ${currentRLUSD} RLUSD  (tx: ${hash})`)
        if (!dryRun) await sleep(4000)
      }
    }

    // ── Step 8: Transfer USDC ──────────────────────────────────────────────

    if (oldUSDC > 0) {
      const currentUSDC = await xrplGetTokenBalance(client, oldAddr, USDC.currency, USDC.issuer)
      if (currentUSDC > 0) {
        const hash = await xrplSendToken(
          client, oldWallet, newAddr, currentUSDC, USDC.currency, USDC.issuer, dryRun,
        )
        steps.push(`transferred ${currentUSDC} USDC  (tx: ${hash})`)
        if (!dryRun) await sleep(4000)
      }
    }

    // ── Step 9: Transfer remaining XRP ────────────────────────────────────

    const currentOldXRP = await xrplGetXRP(client, oldAddr)
    const xrpToSend = currentOldXRP - KEEP_ON_OLD_XRP

    if (xrpToSend >= 0.01) {
      const hash = await xrplSendXRP(client, oldWallet, newAddr, xrpToSend, dryRun)
      steps.push(`transferred ${xrpToSend.toFixed(6)} XRP  (tx: ${hash})`)
      if (!dryRun) await sleep(4000)
    } else {
      steps.push(`XRP below sendable threshold after reserve — leaving ${currentOldXRP.toFixed(6)} XRP on old address`)
    }

    // ── Step 10: Update DB ─────────────────────────────────────────────────

    if (!dryRun) {
      const dbUpdates: Record<string, any> = {
        old_wallet_exists: false,
        fund_migration_at: new Date(),
      }
      if (oldRLUSD > 0) dbUpdates.rlusdTrustLineCreated = true
      if (oldUSDC > 0)  dbUpdates.usdcTrustLineCreated = true

      await User.updateOne({ phoneNumber: phone }, { $set: dbUpdates })
    }

    return { phone, status: 'success', steps }
  } catch (err: any) {
    return { phone, status: 'failed', reason: err.message, steps }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI is not set')
    process.exit(1)
  }

  if (DRY_RUN) {
    console.log('═══════════════════════════════════════════════')
    console.log('  DRY RUN — no transactions will be submitted  ')
    console.log('═══════════════════════════════════════════════\n')
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(config.MONGODB_URI)

  // Find users who have BOTH an old encrypted seed AND a new Web3Auth address
  const users = await User.find({
    encryptedSeed: { $exists: true, $ne: '' },
    xrplAddress:  { $exists: true, $ne: '' },
    xrpl_address: { $exists: true, $ne: '' },
  }).select('phoneNumber xrplAddress xrpl_address encryptedSeed rlusdTrustLineCreated usdcTrustLineCreated old_wallet_exists')

  console.log(`Found ${users.length} user(s) with old + new wallets\n`)

  if (users.length === 0) {
    console.log('Nothing to do.')
    await mongoose.disconnect()
    process.exit(0)
  }

  console.log('Connecting to XRPL...')
  const client = new Client(WEBSOCKET_URL, { connectionTimeout: 20000 })
  await client.connect()
  console.log(`Connected to ${WEBSOCKET_URL}\n`)

  let success = 0
  let skipped = 0
  let failed = 0

  for (const user of users) {
    const masked = user.phoneNumber.slice(0, 5) + '***'
    log(`Migrating ${masked} ... `)

    const result = await migrateUser(client, user, DRY_RUN)

    if (result.status === 'skipped') {
      skipped++
      logLine(`⏭  skipped: ${result.reason}`)
    } else if (result.status === 'success') {
      success++
      logLine('✅')
      for (const step of result.steps) {
        logLine(`       ${step}`)
      }
    } else {
      failed++
      logLine(`❌  ${result.reason}`)
      for (const step of result.steps) {
        logLine(`       ${step}`)
      }
    }

    // Brief pause between users to avoid Web3Auth rate limits
    await sleep(2000)
  }

  await client.disconnect()

  console.log('\n──────────────────────────────────────────────')
  console.log(`Done: ${success} migrated, ${skipped} skipped, ${failed} failed`)
  if (DRY_RUN) console.log('(dry run — nothing was actually sent)')
  if (failed > 0) console.log('Re-run the script to retry failed users.')
  console.log('──────────────────────────────────────────────')

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
