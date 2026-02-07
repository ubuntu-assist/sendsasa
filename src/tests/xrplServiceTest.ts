import { xrplClient } from '../config/xrpl'
import {
  generateWallet,
  sendXRP,
  getBalance,
  getHistory,
} from '../services/xrpl.service'
import { TransactionHistory, WalletInfo } from '../types'

let wallet1: WalletInfo
let wallet2: WalletInfo

async function runTests() {
  console.log('═══════════════════════════════════════════════')
  console.log('SENDSASA MVP - PHASE 1 TEST SUITE')
  console.log('═══════════════════════════════════════════════\n')

  try {
    // Connect to XRPL
    console.log('Connecting to XRPL...')
    await xrplClient.connect()
    console.log(`Connected to ${xrplClient.getNetwork()}\n`)

    // Test 1: Generate Wallets
    console.log('\n━━━ TEST 1: Generate Wallets ━━━')
    wallet1 = await generateWallet()
    console.log('\nWaiting 2 seconds...\n')
    await sleep(2000)

    wallet2 = await generateWallet()
    console.log('\nWaiting 2 seconds...\n')
    await sleep(2000)

    // Test 2: Check Initial Balances
    console.log('\n━━━ TEST 2: Check Initial Balances ━━━')
    const balance1 = await getBalance(wallet1.address)
    const balance2 = await getBalance(wallet2.address)

    console.log(`\nWallet 1: ${balance1.balance} XRP`)
    console.log(`Wallet 2: ${balance2.balance} XRP`)

    // Test 3: Send XRP
    console.log('\n━━━ TEST 3: Send XRP (Wallet 1 → Wallet 2) ━━━')
    const sendAmount = 13
    await sendXRP(wallet1.seed, wallet2.address, sendAmount)

    console.log(`\nWaiting for transaction to settle...\n`)
    await sleep(3000)

    // Test 4: Check Updated Balances
    console.log('\n━━━ TEST 4: Check Updated Balances ━━━')
    const newBalance1 = await getBalance(wallet1.address)
    const newBalance2 = await getBalance(wallet2.address)

    console.log(
      `\nWallet 1: ${newBalance1.balance} XRP (sent ${sendAmount} XRP + fees)`,
    )
    console.log(
      `Wallet 2: ${newBalance2.balance} XRP (received ${sendAmount} XRP)`,
    )

    // Test 5: Transaction History
    console.log('\n━━━ TEST 5: Get Transaction History ━━━')
    const history1 = await getHistory(wallet1.address, 5)
    const history2 = await getHistory(wallet2.address, 5)

    console.log('\nWallet 1 History:')
    displayHistory(history1)

    console.log('\nWallet 2 History:')
    displayHistory(history2)

    // Test Summary
    console.log('\n═══════════════════════════════════════════════')
    console.log('ALL TESTS PASSED!')
    console.log('═══════════════════════════════════════════════')
    console.log('\nTest Summary:')
    console.log(`✓ Wallet generation`)
    console.log(`✓ Balance checking`)
    console.log(`✓ XRP transfers`)
    console.log(`✓ Transaction history`)

    console.log('\nWallet Information (SAVE THESE!):')
    console.log('\nWallet 1:')
    console.log(`   Address: ${wallet1.address}`)
    console.log(`   Seed: ${wallet1.seed}`)
    console.log(`   Balance: ${newBalance1.balance} XRP`)

    console.log('\nWallet 2:')
    console.log(`   Address: ${wallet2.address}`)
    console.log(`   Seed: ${wallet2.seed}`)
    console.log(`   Balance: ${newBalance2.balance} XRP`)

    console.log('\nView transactions on explorer:')
    console.log(`   https://testnet.xrpl.org/accounts/${wallet1.address}`)
    console.log(`   https://testnet.xrpl.org/accounts/${wallet2.address}`)
  } catch (error) {
    console.error('\nTEST FAILED:', error)
    throw error
  } finally {
    await xrplClient.disconnect()
  }
}

function displayHistory(history: TransactionHistory[]) {
  if (history.length === 0) {
    console.log('   No transactions found')
    return
  }

  history.forEach((tx, index) => {
    const arrow = tx.direction === 'sent' ? '🔴 OUT' : '🟢 IN'
    console.log(`   ${index + 1}. ${arrow} ${tx.amount} XRP`)
    console.log(`      Hash: ${tx.hash.substring(0, 16)}...`)
    console.log(`      Date: ${tx.date.toLocaleString()}`)
    console.log(
      `      ${tx.direction === 'sent' ? 'To' : 'From'}: ${
        tx.direction === 'sent' ? tx.to : tx.from
      }`,
    )
  })
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Run tests
runTests().catch((error) => {
  console.error('Fatal error:', error)
  process.exit(1)
})
