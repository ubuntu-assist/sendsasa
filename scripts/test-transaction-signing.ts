/**
 * Test: Transaction signing on testnets
 *
 * Verifies:
 *   1. Gas estimation on BSC Testnet
 *   2. EVM balance check on BSC Testnet
 *   3. XRPL balance check on XRPL Testnet
 *   4. XRPL account activation status
 *   5. EVM wallet address derivation from Web3Auth key
 *   6. XRPL wallet address derivation from Web3Auth key
 *
 * Live sends are skipped by default — set ENABLE_LIVE_SENDS=true to run them.
 * WARNING: Live sends require funded testnet accounts.
 *
 * Usage:
 *   pnpm test:tx
 *   ENABLE_LIVE_SENDS=true TEST_PHONE="+237612345678" pnpm test:tx
 */

import 'dotenv/config'
import { connectDatabase, disconnectDatabase } from '../src/config/database'
import { walletService } from '../src/services/wallet.service'
import { evmService } from '../src/services/evm.service'
import {
  deriveXRPLWalletFromSecp256k1,
  isAccountActivated,
  getBalance,
  sendXRP,
} from '../src/services/xrpl.service'
import { normalizeToE164 } from '../src/services/phone-number.service'

// ── Config ────────────────────────────────────────────────────────────────────

const TEST_PHONE = process.env.TEST_PHONE || '+237612345678'
const TEST_PHONE_2 = process.env.TEST_PHONE_2 || '+254712345678'
const ENABLE_LIVE_SENDS = process.env.ENABLE_LIVE_SENDS === 'true'

// BSC Testnet explorer
const BSC_TESTNET_EXPLORER = 'https://testnet.bscscan.com/tx'
// XRPL Testnet explorer
const XRPL_TESTNET_EXPLORER = 'https://testnet.xrpl.org/transactions'

// Override chains.ts to use testnets for this test
process.env.BSC_RPC_URL = process.env.BSC_TESTNET_RPC_URL || 'https://data-seed-prebsc-1-s1.binance.org:8545'

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

function skip(label: string, reason?: string): void {
  console.log(`  ⏭️  SKIP: ${label}${reason ? `  (${reason})` : ''}`)
}

function section(title: string): void {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`)
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testKeyDerivation(): Promise<{ secp256k1Key: string; evmAddress: string; xrplAddress: string }> {
  section('Key & Address Derivation')

  const phone = normalizeToE164(TEST_PHONE, 'CM')
  console.log(`  Phone: ${phone}`)

  const secp256k1Key = await walletService.getPrivateKey(phone)
  ok('getPrivateKey returns 64-char hex', secp256k1Key.length === 64, `${secp256k1Key.length} chars`)

  const evmWallet = walletService.deriveEVMWallet(secp256k1Key)
  ok('EVM address is valid', evmWallet.address.startsWith('0x') && evmWallet.address.length === 42, evmWallet.address)

  const xrplWallet = deriveXRPLWalletFromSecp256k1(secp256k1Key)
  ok('XRPL address is valid', xrplWallet.classicAddress.startsWith('r') && xrplWallet.classicAddress.length >= 25, xrplWallet.classicAddress)

  console.log(`  EVM  : ${evmWallet.address}`)
  console.log(`  XRPL : ${xrplWallet.classicAddress}`)

  return {
    secp256k1Key,
    evmAddress: evmWallet.address,
    xrplAddress: xrplWallet.classicAddress,
  }
}

async function testEVMBalanceAndGas(evmAddress: string): Promise<void> {
  section('EVM — Balance & Gas Estimation (BSC Testnet)')

  try {
    // Gas estimation
    const gasFee = await evmService.estimateNativeTransferFee('bsc')
    const gasFeeNum = parseFloat(gasFee)
    ok(
      'Gas fee estimation succeeds',
      !isNaN(gasFeeNum) && gasFeeNum >= 0,
      `${gasFee} BNB`,
    )
    console.log(`  ⛽ Estimated gas fee: ${gasFee} BNB`)

    // BNB balance
    const bnbBalance = await evmService.getBalance(evmAddress, 'bsc')
    ok('BNB balance fetch succeeds', !isNaN(parseFloat(bnbBalance)), `${bnbBalance} BNB`)
    console.log(`  💰 BNB balance: ${bnbBalance} BNB`)

    // USDT balance (BSC testnet — token may not exist, just checking no crash)
    try {
      const usdtBalance = await evmService.getBalance(evmAddress, 'bsc', 'USDT')
      ok('USDT balance fetch succeeds', !isNaN(parseFloat(usdtBalance)), `${usdtBalance} USDT`)
      console.log(`  💰 USDT balance: ${usdtBalance} USDT`)
    } catch (e: any) {
      // BSC testnet USDT contract may not behave — log but don't fail
      console.log(`  ⚠️  USDT balance query: ${e.message} (may be normal on testnet)`)
    }
  } catch (e: any) {
    ok('EVM balance/gas check (no crash)', false, e.message)
  }
}

async function testXRPLBalanceAndActivation(xrplAddress: string): Promise<void> {
  section('XRPL — Balance & Activation (Testnet)')

  try {
    const activated = await isAccountActivated(xrplAddress)
    console.log(`  Account activated: ${activated}`)

    if (activated) {
      const { balance } = await getBalance(xrplAddress)
      ok('XRP balance fetch succeeds', !isNaN(parseFloat(balance)), `${balance} XRP`)
      console.log(`  💰 XRP balance: ${balance} XRP`)
    } else {
      skip('XRP balance', 'account not yet activated on testnet')
      console.log(`  ℹ️  Fund this address to activate: ${xrplAddress}`)
      console.log(`  ℹ️  Use the testnet faucet: https://faucet.altnet.rippletest.net/accounts`)
    }

    ok('XRPL activation check completed without crash', true)
  } catch (e: any) {
    ok('XRPL activation check (no crash)', false, e.message)
  }
}

async function testLiveSendXRP(secp256k1Key: string, fromAddress: string): Promise<void> {
  section('XRPL — Live XRP Send (Testnet)')

  if (!ENABLE_LIVE_SENDS) {
    skip('XRP send', 'set ENABLE_LIVE_SENDS=true to run')
    return
  }

  const activated = await isAccountActivated(fromAddress)
  if (!activated) {
    skip('XRP send', 'sender account not activated — fund via https://faucet.altnet.rippletest.net/accounts')
    return
  }

  try {
    // Derive recipient from phone 2 to keep it self-contained
    const phone2 = normalizeToE164(TEST_PHONE_2, 'KE')
    const key2 = await walletService.getPrivateKey(phone2)
    const recipient = deriveXRPLWalletFromSecp256k1(key2).classicAddress

    console.log(`  Sending 1 XRP to ${recipient}...`)
    const result = await sendXRP(secp256k1Key, recipient, 1)

    ok('XRP send succeeded', result.result === 'tesSUCCESS', result.hash)
    console.log(`  🔗 Explorer: ${XRPL_TESTNET_EXPLORER}/${result.hash}`)
  } catch (e: any) {
    ok('XRP send (no crash)', false, e.message)
  }
}

async function testLiveSendBNB(secp256k1Key: string, evmAddress: string): Promise<void> {
  section('EVM — Live BNB Send (BSC Testnet)')

  if (!ENABLE_LIVE_SENDS) {
    skip('BNB send', 'set ENABLE_LIVE_SENDS=true to run')
    return
  }

  const balance = await evmService.getBalance(evmAddress, 'bsc')
  const balanceNum = parseFloat(balance)

  if (balanceNum < 0.001) {
    skip('BNB send', `insufficient balance (${balance} BNB) — fund via https://testnet.bnbchain.org/faucet-smart`)
    return
  }

  try {
    // Send a tiny amount to a derived recipient
    const phone2 = normalizeToE164(TEST_PHONE_2, 'KE')
    const key2 = await walletService.getPrivateKey(phone2)
    const recipient = walletService.deriveEVMWallet(key2).address

    console.log(`  Sending 0.0001 BNB to ${recipient}...`)
    const receipt = await evmService.transferNative(secp256k1Key, 'bsc', recipient, '0.0001')

    ok('BNB send succeeded', receipt.status === 1, receipt.hash)
    console.log(`  🔗 Explorer: ${BSC_TESTNET_EXPLORER}/${receipt.hash}`)
  } catch (e: any) {
    ok('BNB send (no crash)', false, e.message)
  }
}

async function testDifferentPhonesGiveDifferentKeys(): Promise<void> {
  section('Isolation — different phones → different keys')

  const phone1 = normalizeToE164(TEST_PHONE, 'CM')
  const phone2 = normalizeToE164(TEST_PHONE_2, 'KE')

  const [key1, key2] = await Promise.all([
    walletService.getPrivateKey(phone1),
    walletService.getPrivateKey(phone2),
  ])

  ok('Different phones produce different secp256k1 keys', key1 !== key2)

  const evm1 = walletService.deriveEVMWallet(key1).address
  const evm2 = walletService.deriveEVMWallet(key2).address
  ok('Different EVM addresses', evm1 !== evm2)

  const xrpl1 = deriveXRPLWalletFromSecp256k1(key1).classicAddress
  const xrpl2 = deriveXRPLWalletFromSecp256k1(key2).classicAddress
  ok('Different XRPL addresses', xrpl1 !== xrpl2)
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('\n🧪 SendSasa — Transaction Signing Tests')
  console.log('══════════════════════════════════════════════════════════')
  console.log(`  Network      : ${process.env.WEB3AUTH_NETWORK || 'sapphire_devnet'}`)
  console.log(`  BSC RPC      : ${process.env.BSC_RPC_URL || 'BSC Testnet (default)'}`)
  console.log(`  XRPL Network : ${process.env.XRPL_NETWORK || 'testnet'}`)
  console.log(`  Test phone   : ${TEST_PHONE}`)
  console.log(`  Live sends   : ${ENABLE_LIVE_SENDS ? '✅ ENABLED' : '⏭️  disabled'}`)

  await connectDatabase()

  try {
    const { secp256k1Key, evmAddress, xrplAddress } = await testKeyDerivation()
    await testEVMBalanceAndGas(evmAddress)
    await testXRPLBalanceAndActivation(xrplAddress)
    await testDifferentPhonesGiveDifferentKeys()
    await testLiveSendXRP(secp256k1Key, xrplAddress)
    await testLiveSendBNB(secp256k1Key, evmAddress)
  } finally {
    await disconnectDatabase()
  }

  console.log('\n══════════════════════════════════════════════════════════')
  console.log(`  Results: ${passed} passed, ${failed} failed`)

  if (ENABLE_LIVE_SENDS) {
    console.log('\n  💡 Check explorer links above for transaction confirmations.')
  } else {
    console.log('\n  💡 Run with ENABLE_LIVE_SENDS=true to test actual on-chain sends.')
  }

  if (failed > 0) {
    console.error('\n❌ Some tests failed.')
    process.exit(1)
  } else {
    console.log('\n✅ All transaction signing tests passed.')
  }
}

main().catch((err) => {
  console.error('\n💥 Test runner error:', err)
  process.exit(1)
})
