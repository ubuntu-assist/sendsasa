/// <reference types="node" />
/**
 * Bulk wallet migration: derives Web3Auth addresses for all users who still
 * have migration_status = 'pending' and no xrpl_address cached.
 *
 * Safe to run multiple times — skips users that are already migrated.
 *
 *   npx ts-node scripts/migrate-wallets.ts
 */

import 'dotenv/config'
import mongoose from 'mongoose'
import { User } from '../src/models'
import { walletService } from '../src/services/wallet.service'
import config from '../src/utils/config'

async function main() {
  if (!config.MONGODB_URI) {
    console.error('MONGODB_URI is not set in .env')
    process.exit(1)
  }

  console.log('Connecting to MongoDB...')
  await mongoose.connect(config.MONGODB_URI)

  // Find all users that need migration
  const pending = await User.find({
    $or: [
      { migration_status: 'pending' },
      { xrpl_address: { $exists: false } },
      { xrpl_address: null },
    ],
  }).select('phoneNumber whatsappId migration_status')

  console.log(`\nFound ${pending.length} user(s) to migrate\n`)

  if (pending.length === 0) {
    console.log('Nothing to do.')
    await mongoose.disconnect()
    process.exit(0)
  }

  let success = 0
  let failed = 0

  for (const user of pending) {
    const phone = user.phoneNumber
    process.stdout.write(`Migrating ${phone.slice(0, 6)}*** ... `)

    try {
      const wallets = await walletService.getOrCreateWallets(phone)

      // Mark migration complete
      await User.updateOne(
        { phoneNumber: phone },
        { $set: { migration_status: 'completed' } },
      )

      console.log(
        `✅  EVM: ${wallets.evmAddress.slice(0, 10)}...  XRPL: ${wallets.xrplAddress.slice(0, 10)}...  Solana: ${wallets.solanaAddress.slice(0, 10)}...`,
      )
      success++
    } catch (err: any) {
      console.log(`❌  ${err.message}`)
      failed++
    }
  }

  console.log(`\nDone: ${success} migrated, ${failed} failed`)

  if (failed > 0) {
    console.log('Re-run the script to retry failed users.')
  }

  await mongoose.disconnect()
  process.exit(failed > 0 ? 1 : 0)
}

main().catch((err) => {
  console.error('Fatal:', err.message)
  process.exit(1)
})
