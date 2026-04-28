/**
 * One-off script: create RLUSD and USDC trust lines for an existing funded user.
 *
 * Usage:
 *   pnpm tsx scripts/create-trustlines.ts +237612345678
 */

import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database'
import { User } from '../src/models/User'
import { walletService } from '../src/services/wallet.service'
import { normalizeToE164 } from '../src/services/phone-number.service'
import {
  isAccountActivated,
  hasRLUSDTrustLine,
  hasUSDCTrustLine,
  createRLUSDTrustLine,
  createUSDCTrustLine,
} from '../src/services/xrpl.service'

async function main() {
  const rawPhone = process.argv[2]
  if (!rawPhone) {
    console.error('Usage: pnpm tsx scripts/create-trustlines.ts <phone>')
    process.exit(1)
  }

  const phone = normalizeToE164(rawPhone)
  console.log(`\nCreating trust lines for ${phone}\n`)

  await connectDatabase()

  const user = await User.findOne({ phoneNumber: phone })
  if (!user) {
    console.error(`No user found for ${phone}`)
    process.exit(1)
  }

  console.log(`User    : ${user.username}`)
  console.log(`Address : ${user.xrpl_address}`)

  const activated = await isAccountActivated(user.xrpl_address)
  if (!activated) {
    console.error(`\nXRPL account ${user.xrpl_address} is not activated yet.`)
    console.error('Fund the account with at least 1 XRP and try again.')
    process.exit(1)
  }
  console.log('Account : activated ✓\n')

  const xrplWallet = await walletService.getXRPLWallet(phone)

  if (xrplWallet.classicAddress !== user.xrpl_address) {
    console.error(`Address mismatch!`)
    console.error(`  DB      : ${user.xrpl_address}`)
    console.error(`  Derived : ${xrplWallet.classicAddress}`)
    console.error('Aborting — do not create trust lines on the wrong account.')
    process.exit(1)
  }

  // ── RLUSD ──────────────────────────────────────────────────────────────────
  if (user.rlusdTrustLineCreated) {
    console.log('RLUSD   : already created, skipping')
  } else {
    const alreadyExists = await hasRLUSDTrustLine(user.xrpl_address)
    if (alreadyExists) {
      console.log('RLUSD   : trust line already on ledger — marking in DB')
      user.rlusdTrustLineCreated = true
    } else {
      process.stdout.write('RLUSD   : creating trust line... ')
      const result = await createRLUSDTrustLine(xrplWallet)
      if (result.success) {
        user.rlusdTrustLineCreated = true
        user.rlusdTrustLineHash = result.hash
        console.log(`✅  ${result.hash}`)
      } else {
        console.log('❌  transaction did not succeed')
      }
    }
  }

  // ── USDC ───────────────────────────────────────────────────────────────────
  if (user.usdcTrustLineCreated) {
    console.log('USDC    : already created, skipping')
  } else {
    const alreadyExists = await hasUSDCTrustLine(user.xrpl_address)
    if (alreadyExists) {
      console.log('USDC    : trust line already on ledger — marking in DB')
      user.usdcTrustLineCreated = true
    } else {
      process.stdout.write('USDC    : creating trust line... ')
      const result = await createUSDCTrustLine(xrplWallet)
      if (result.success) {
        user.usdcTrustLineCreated = true
        user.usdcTrustLineHash = result.hash
        console.log(`✅  ${result.hash}`)
      } else {
        console.log('❌  transaction did not succeed')
      }
    }
  }

  await user.save()
  console.log('\nDB updated.')

  await disconnectDatabase()
  process.exit(0)
}

main().catch((err) => {
  console.error('\nFatal:', err.message ?? err)
  process.exit(1)
})
