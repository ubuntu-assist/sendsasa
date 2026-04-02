/**
 * Migration script: Prepare existing users for Web3Auth wallet infrastructure.
 *
 * What it does:
 *  - Users with a non-empty encryptedSeed (old wallet):
 *      migration_status = 'pending'
 *      old_wallet_exists = true
 *      web3auth_verifier = 'sendsasa-whatsapp'
 *      web3auth_verifier_id = phoneNumber   (E.164 already stored)
 *
 *  - Users already migrated (evm_address set):
 *      Skipped (idempotent)
 *
 *  - Users without a seed (already Web3Auth):
 *      migration_status = 'n/a'  (default — no change needed)
 *
 * Usage:
 *   pnpm migrate:web3auth              # Apply changes
 *   pnpm migrate:web3auth:dry-run      # Preview without writing
 *
 * The script is idempotent: running it twice produces the same result.
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { connectDatabase, disconnectDatabase } from '../src/config/database'
import { User } from '../src/models/User'

const BATCH_SIZE = 100
const DRY_RUN = process.argv.includes('--dry-run')

// ─── Counters ────────────────────────────────────────────────────────────────

interface Stats {
  total: number
  skippedAlreadyMigrated: number
  markedPending: number          // old wallet → needs migration
  markedNA: number               // no old wallet → nothing to migrate
  errors: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function log(msg: string): void {
  const ts = new Date().toISOString()
  console.log(`[${ts}] ${msg}`)
}

function hasOldWallet(user: any): boolean {
  return typeof user.encryptedSeed === 'string' && user.encryptedSeed.length > 0
}

function alreadyMigrated(user: any): boolean {
  // An evm_address means walletService already ran for this user
  return typeof user.evm_address === 'string' && user.evm_address.length > 0
}

// ─── Core migration logic ─────────────────────────────────────────────────────

async function processBatch(
  users: any[],
  stats: Stats,
): Promise<void> {
  for (const user of users) {
    try {
      if (alreadyMigrated(user)) {
        stats.skippedAlreadyMigrated++
        continue
      }

      const update: Record<string, unknown> = {
        web3auth_verifier: 'sendsasa-whatsapp',
        web3auth_verifier_id: user.phoneNumber,
      }

      if (hasOldWallet(user)) {
        update.migration_status = 'pending'
        update.old_wallet_exists = true
        stats.markedPending++
      } else {
        update.migration_status = 'n/a'
        stats.markedNA++
      }

      if (!DRY_RUN) {
        await User.updateOne({ _id: user._id }, { $set: update })
      }
    } catch (error: any) {
      stats.errors++
      log(`  ⚠️  Error processing user ${user._id}: ${error.message}`)
    }
  }
}

async function ensureIndexes(): Promise<void> {
  if (DRY_RUN) return

  log('Ensuring indexes on web3auth_verifier_id, evm_address, xrpl_address...')
  const col = mongoose.connection.collection('users')

  await col.createIndex({ web3auth_verifier_id: 1 }, { unique: true, sparse: true, background: true })
  await col.createIndex({ evm_address: 1 }, { sparse: true, background: true })
  await col.createIndex({ xrpl_address: 1 }, { sparse: true, background: true })

  log('Indexes ready.')
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  log(`Starting Web3Auth migration${DRY_RUN ? ' [DRY RUN — no writes]' : ''}`)
  log('─'.repeat(60))

  await connectDatabase()

  const stats: Stats = {
    total: 0,
    skippedAlreadyMigrated: 0,
    markedPending: 0,
    markedNA: 0,
    errors: 0,
  }

  // Count total users upfront
  stats.total = await User.countDocuments()
  log(`Total users in database: ${stats.total}`)

  if (stats.total === 0) {
    log('No users to process. Exiting.')
    await disconnectDatabase()
    return
  }

  // Stream through users in batches using cursor
  let batchNumber = 0
  let processed = 0

  const cursor = User.find(
    {},
    { _id: 1, phoneNumber: 1, encryptedSeed: 1, evm_address: 1, migration_status: 1 },
  ).cursor({ batchSize: BATCH_SIZE })

  let batch: any[] = []

  for await (const user of cursor) {
    batch.push(user)

    if (batch.length === BATCH_SIZE) {
      batchNumber++
      await processBatch(batch, stats)
      processed += batch.length
      log(`  Batch ${batchNumber}: processed ${processed}/${stats.total} users`)
      batch = []
    }
  }

  // Process remaining users in the last partial batch
  if (batch.length > 0) {
    batchNumber++
    await processBatch(batch, stats)
    processed += batch.length
    log(`  Batch ${batchNumber}: processed ${processed}/${stats.total} users`)
  }

  await ensureIndexes()

  // ─── Summary ────────────────────────────────────────────────────────────────

  log('─'.repeat(60))
  log('Migration complete. Summary:')
  log('')
  log(`  Total users processed      : ${stats.total}`)
  log(`  Skipped (already migrated) : ${stats.skippedAlreadyMigrated}`)
  log(`  Marked pending (old wallet): ${stats.markedPending}`)
  log(`  Marked n/a (Web3Auth only) : ${stats.markedNA}`)
  log(`  Errors                     : ${stats.errors}`)
  log('')

  if (DRY_RUN) {
    log('⚠️  DRY RUN — no changes were written to the database.')
  } else if (stats.errors > 0) {
    log(`⚠️  Migration completed with ${stats.errors} error(s). Check logs above.`)
  } else {
    log('✅ Migration completed successfully.')
  }

  log('')
  log('Next steps:')
  log('  1. For each "pending" user, run walletService.getOrCreateWallets(phone)')
  log('     to derive and cache their Web3Auth addresses (Phase 8 bulk migration).')
  log('  2. Monitor migration_status field to track progress.')

  await disconnectDatabase()
}

main().catch((error) => {
  console.error('Fatal migration error:', error)
  process.exit(1)
})
