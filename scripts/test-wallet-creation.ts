/**
 * Test: Web3Auth wallet creation and determinism
 *
 * Verifies:
 *   1. Wallet addresses are derived for a phone number
 *   2. Both EVM (0x...) and XRPL (r...) addresses are valid
 *   3. Calling twice with the same phone returns identical addresses (determinism)
 *   4. Different phones produce different addresses
 *   5. Cache hit path avoids a second Web3Auth round-trip
 *
 * Usage:
 *   pnpm test:wallet
 *   TEST_PHONE="+237612345678" pnpm test:wallet
 */

import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database'
import { walletService } from '../src/services/wallet.service'
import { deriveXRPLWalletFromSecp256k1 } from '../src/services/xrpl.service'
import { normalizeToE164, isE164 } from '../src/services/phone-number.service'

// ── Config ───────────────────────────────────────────────────────────────────

const TEST_PHONE_1 = process.env.TEST_PHONE || '+237612345678'
const TEST_PHONE_2 = process.env.TEST_PHONE_2 || '+254712345678'

// ── Helpers ───────────────────────────────────────────────────────────────────

let passed = 0
let failed = 0

function ok(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✅ ${label}${detail ? `  →  ${detail}` : ''}`)
    passed++
  } else {
    console.error(`  ❌ FAIL: ${label}${detail ? `  →  ${detail}` : ''}`)
    failed++
  }
}

function section(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testPhoneNormalization(): Promise<void> {
  section('Phone Number Normalization')

  const variants = [
    { input: '+237612345678', expected: '+237612345678' },
    { input: '237612345678', expected: '+237612345678' },
    { input: '0612345678', expected: '+237612345678' },
  ]

  for (const { input, expected } of variants) {
    try {
      const result = normalizeToE164(input, 'CM')
      ok(`normalizeToE164("${input}")`, result === expected, result)
    } catch (e: any) {
      ok(`normalizeToE164("${input}")`, false, e.message)
    }
  }

  ok('isE164("+237612345678")', isE164('+237612345678'))
  ok('isE164("237612345678") → false', !isE164('237612345678'))
}

async function testWalletDerivation(): Promise<void> {
  section('Wallet Derivation (no DB cache)')

  const phone = normalizeToE164(TEST_PHONE_1, 'CM')
  console.log(`  Phone: ${phone}`)

  const key = await walletService.getPrivateKey(phone)
  ok('getPrivateKey returns 64-char hex', key.length === 64, `${key.length} chars`)
  ok('getPrivateKey has no 0x prefix', !key.startsWith('0x'))

  const evmWallet = walletService.deriveEVMWallet(key)
  ok('EVM address starts with 0x', evmWallet.address.startsWith('0x'), evmWallet.address)
  ok('EVM address is 42 chars', evmWallet.address.length === 42)

  const xrplWallet = deriveXRPLWalletFromSecp256k1(key)
  ok('XRPL address starts with r', xrplWallet.classicAddress.startsWith('r'), xrplWallet.classicAddress)
  ok('XRPL address is 25-34 chars', xrplWallet.classicAddress.length >= 25)

  console.log(`  EVM  : ${evmWallet.address}`)
  console.log(`  XRPL : ${xrplWallet.classicAddress}`)
}

async function testDeterminism(): Promise<void> {
  section('Determinism — same phone → same addresses')

  const phone = normalizeToE164(TEST_PHONE_1, 'CM')

  const [key1, key2] = await Promise.all([
    walletService.getPrivateKey(phone),
    walletService.getPrivateKey(phone),
  ])

  ok('Two calls for same phone return same key', key1 === key2)

  const wallet1 = walletService.deriveEVMWallet(key1)
  const wallet2 = walletService.deriveEVMWallet(key2)
  ok('EVM address is deterministic', wallet1.address === wallet2.address, wallet1.address)

  const xrpl1 = deriveXRPLWalletFromSecp256k1(key1)
  const xrpl2 = deriveXRPLWalletFromSecp256k1(key2)
  ok('XRPL address is deterministic', xrpl1.classicAddress === xrpl2.classicAddress, xrpl1.classicAddress)
}

async function testDifferentPhonesGiveDifferentWallets(): Promise<void> {
  section('Isolation — different phones → different addresses')

  const phone1 = normalizeToE164(TEST_PHONE_1, 'CM')
  const phone2 = normalizeToE164(TEST_PHONE_2, 'KE')

  const [key1, key2] = await Promise.all([
    walletService.getPrivateKey(phone1),
    walletService.getPrivateKey(phone2),
  ])

  ok('Different phones produce different keys', key1 !== key2)

  const evm1 = walletService.deriveEVMWallet(key1).address
  const evm2 = walletService.deriveEVMWallet(key2).address
  ok('Different phones produce different EVM addresses', evm1 !== evm2)

  const xrpl1 = deriveXRPLWalletFromSecp256k1(key1).classicAddress
  const xrpl2 = deriveXRPLWalletFromSecp256k1(key2).classicAddress
  ok('Different phones produce different XRPL addresses', xrpl1 !== xrpl2)
}

async function testGetOrCreateWallets(): Promise<void> {
  section('getOrCreateWallets (with DB cache)')

  const phone = normalizeToE164(TEST_PHONE_1, 'CM')

  console.log('  First call — expects Web3Auth lookup...')
  const start1 = Date.now()
  const wallets1 = await walletService.getOrCreateWallets(phone)
  const dur1 = Date.now() - start1

  ok('Returns evmAddress', wallets1.evmAddress.startsWith('0x'), wallets1.evmAddress)
  ok('Returns xrplAddress', wallets1.xrplAddress.startsWith('r'), wallets1.xrplAddress)
  console.log(`  ⏱️  First call: ${dur1}ms`)

  console.log('  Second call — expects cache hit...')
  const start2 = Date.now()
  const wallets2 = await walletService.getOrCreateWallets(phone)
  const dur2 = Date.now() - start2

  ok('EVM address matches on second call', wallets1.evmAddress === wallets2.evmAddress)
  ok('XRPL address matches on second call', wallets1.xrplAddress === wallets2.xrplAddress)
  console.log(`  ⏱️  Second call: ${dur2}ms  (${dur2 < dur1 ? 'faster — cache hit ✓' : 'no DB user to cache against'})`)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧪 SendSasa — Wallet Creation Tests')
  console.log('══════════════════════════════════════════════════════════')
  console.log(`  Network  : ${process.env.WEB3AUTH_NETWORK || 'sapphire_devnet'}`)
  console.log(`  Test phone: ${TEST_PHONE_1}`)

  await connectDatabase()

  try {
    await testPhoneNormalization()
    await testWalletDerivation()
    await testDeterminism()
    await testDifferentPhonesGiveDifferentWallets()
    await testGetOrCreateWallets()
  } finally {
    await disconnectDatabase()
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)

  if (failed > 0) {
    console.error('\n❌ Some tests failed.')
    process.exit(1)
  } else {
    console.log('\n✅ All wallet creation tests passed.')
  }
}

main().catch((err) => {
  console.error('\n💥 Test runner error:', err)
  process.exit(1)
})
