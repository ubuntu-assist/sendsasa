import { User } from '@models/User'
import { Transaction } from '@models/Transaction'
import { PaymentRequest } from '@models/PaymentRequest'
import { FlowLauncherService } from '@messaging/flow/flow-launcher.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { sendWalletMenu } from '@messaging/whatsapp/whatsapp-menu.service'
import {
  getAllBalances,
  sendXRP,
  sendRLUSD,
  sendUSDC,
} from '@blockchain/chains/xrpl.service'
import { walletService } from '@blockchain/chains/wallet.service'
import { evmService } from '@blockchain/chains/evm.service'
import { getAllBalances as getSolanaBalances } from '@blockchain/chains/solana.service'
import { normalizeToE164 } from '@shared/phone-number.service'

// ── Local helpers (shared in orchestrator, copied here to avoid circular dep) ─

function getEffectiveXRPLAddress(user: any): string {
  return user.xrpl_address
}

async function fetchAllBalances(user: any): Promise<{
  xrp: string
  rlusd: string
  usdc: string
  bnb: string
  bscUsdt: string
  bscUsdc: string
  sol: string
  solUsdc: string
  solUsdt: string
  solEurc: string
}> {
  const xrplAddress = getEffectiveXRPLAddress(user)
  const evmAddress: string | undefined = user.evm_address
  const solanaAddress: string | undefined = user.solana_address

  async function safe(fn: () => Promise<string>): Promise<string> {
    try {
      return await fn()
    } catch {
      return '0'
    }
  }

  const safeSolana = async (): Promise<{
    sol: string
    usdc: string
    usdt: string
    eurc: string
  }> => {
    if (!solanaAddress) return { sol: '0', usdc: '0', usdt: '0', eurc: '0' }
    try {
      return await getSolanaBalances(solanaAddress)
    } catch {
      return { sol: '0', usdc: '0', usdt: '0', eurc: '0' }
    }
  }

  const [xrplBalances, bnb, bscUsdt, bscUsdc, solana] = await Promise.all([
    getAllBalances(xrplAddress),
    evmAddress
      ? safe(() => evmService.getBalance(evmAddress, 'bsc'))
      : Promise.resolve('0'),
    evmAddress
      ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDT'))
      : Promise.resolve('0'),
    evmAddress
      ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDC'))
      : Promise.resolve('0'),
    safeSolana(),
  ])

  return {
    ...xrplBalances,
    bnb,
    bscUsdt,
    bscUsdc,
    sol: solana.sol,
    solUsdc: solana.usdc,
    solUsdt: solana.usdt,
    solEurc: solana.eurc,
  }
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Handle My Wallet
 */
export async function handleMyWallet(
  phoneNumber: string,
  user: any,
): Promise<void> {
  try {
    const balances = await fetchAllBalances(user)

    // Send each address in its own bubble so the user can long-press to copy
    await sendTextMessage(phoneNumber, `📬 *Your Wallet Addresses*`)
    await sendTextMessage(phoneNumber, `*XRPL*\n${user.xrpl_address}`)
    await sendTextMessage(
      phoneNumber,
      `*EVM* (BSC / Base / Ethereum)\n${user.evm_address}`,
    )
    await sendTextMessage(phoneNumber, `*Solana*\n${user.solana_address}`)

    await sendWalletMenu(phoneNumber, balances, user.username)
  } catch (error) {
    console.error('❌ Error handling my wallet:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Transaction History
 */
export async function handleTransactionHistory(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })
    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found.')
      return
    }

    const transactions = await Transaction.find({
      $or: [
        { fromAddress: user.xrpl_address },
        { toAddress: user.xrpl_address },
      ],
    })
      .sort({ timestamp: -1 })
      .limit(5)

    if (transactions.length === 0) {
      await sendTextMessage(
        phoneNumber,
        `📜 *Transaction History*\n\nNo transactions yet.\n\nType anything to get started.`,
      )
      return
    }

    let message = '📜 *Transaction History*\n\n'

    transactions.forEach((tx, index) => {
      const isSent = tx.fromAddress === user.xrpl_address

      message += `*${isSent ? 'Sent' : 'Received'}*   ${tx.amount} ${tx.currency}\n`
      message += `*${isSent ? 'To' : 'From'}*      \`${isSent ? tx.toAddress.slice(0, 8) : tx.fromAddress.slice(0, 8)}...\`\n`
      message += `_${new Date(tx.timestamp).toLocaleDateString()}_`

      if (index < transactions.length - 1)
        message += '\n\n· · · · · · · · · ·\n\n'
    })

    message += '\n\n· · · · · · · · · ·\n_Last 5 transactions_'

    await sendTextMessage(phoneNumber, message)
  } catch (error) {
    console.error('❌ Error getting transaction history:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Pending Payment Requests
 */
export async function handlePendingRequests(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })
    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found.')
      return
    }

    const requests = await PaymentRequest.find({
      payerAddress: user.xrpl_address,
      status: 'pending',
    }).sort({ createdAt: -1 })

    if (requests.length === 0) {
      await sendTextMessage(phoneNumber, '📋 No pending payment requests.')
      return
    }

    let message = '📋 *Pending Payment Requests*\n\n'

    for (const req of requests) {
      const requester = await User.findOne({
        xrpl_address: req.requesterAddress,
      })

      message += `*Amount*   ${req.amount} ${req.currency}\n`
      message += `*From*     ${requester?.username || 'Unknown'}\n`
      if (req.message) message += `*Note*     ${req.message}\n`
      message += `_Ref: ${req.requestId.slice(-8)}_\n\n· · · · · · · · · ·\n\n`
    }

    message = message.trimEnd()
    message +=
      '\n\n· · · · · · · · · ·\n_Tap the approval buttons above to respond._'

    await sendTextMessage(phoneNumber, message)
  } catch (error) {
    console.error('❌ Error getting pending requests:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Approve Payment Request
 */
export async function handleApproveRequest(
  phoneNumber: string,
  user: any,
  requestId: string,
): Promise<void> {
  try {
    const paymentRequest = await PaymentRequest.findOne({ requestId })

    if (!paymentRequest) {
      await sendTextMessage(phoneNumber, '❌ Payment request not found.')
      return
    }

    if (paymentRequest.status !== 'pending') {
      await sendTextMessage(
        phoneNumber,
        '⚠️ This request has already been processed.',
      )
      return
    }

    if (paymentRequest.payerAddress !== user.xrpl_address) {
      await sendTextMessage(phoneNumber, '❌ This request is not for you.')
      return
    }

    const balances = await getAllBalances(getEffectiveXRPLAddress(user))
    let sufficient = false

    if (paymentRequest.currency === 'XRP') {
      sufficient = Number.parseFloat(balances.xrp) >= paymentRequest.amount + 1
    } else if (paymentRequest.currency === 'RLUSD') {
      sufficient = Number.parseFloat(balances.rlusd) >= paymentRequest.amount
    } else if (paymentRequest.currency === 'USDC') {
      sufficient = Number.parseFloat(balances.usdc) >= paymentRequest.amount
    }

    if (!sufficient) {
      await sendTextMessage(
        phoneNumber,
        `❌ Insufficient ${paymentRequest.currency} balance.\n\nYou need ${paymentRequest.amount} ${paymentRequest.currency}.`,
      )
      return
    }

    const requester = await User.findOne({
      xrpl_address: paymentRequest.requesterAddress,
    })
    if (!requester) {
      await sendTextMessage(phoneNumber, '❌ Requester not found.')
      return
    }

    const xrplWallet = await walletService.getXRPLWallet(user.phoneNumber)
    let result: any

    if (paymentRequest.currency === 'XRP') {
      result = await sendXRP(
        xrplWallet,
        requester.xrpl_address,
        paymentRequest.amount,
      )
    } else if (paymentRequest.currency === 'RLUSD') {
      result = await sendRLUSD(
        xrplWallet,
        requester.xrpl_address,
        paymentRequest.amount,
      )
    } else {
      result = await sendUSDC(
        xrplWallet,
        requester.xrpl_address,
        paymentRequest.amount,
      )
    }

    paymentRequest.status = 'approved'
    paymentRequest.txHash = result.hash
    paymentRequest.completedAt = new Date()
    await paymentRequest.save()

    await Transaction.create({
      txHash: result.hash,
      fromAddress: user.xrpl_address,
      toAddress: requester.xrpl_address,
      fromPhone: user.phoneNumber,
      toPhone: requester.phoneNumber,
      amount: paymentRequest.amount,
      currency: paymentRequest.currency,
      status: 'success',
      timestamp: new Date(),
    })

    await sendTextMessage(
      phoneNumber,
      `✅ *Payment Sent!*\n\n` +
        `*Amount*   ${paymentRequest.amount} ${paymentRequest.currency}\n` +
        `*To*       ${requester.username}\n\n` +
        `· · · · · · · · · ·\n` +
        `_TX: \`${result.hash.slice(0, 8)}...${result.hash.slice(-6)}\`_`,
    )

    await sendTextMessage(
      requester.phoneNumber,
      `✅ *Payment Received!*\n\n` +
        `*Amount*   ${paymentRequest.amount} ${paymentRequest.currency}\n` +
        `*From*     ${user.username}\n\n` +
        `· · · · · · · · · ·\n` +
        `_TX: \`${result.hash.slice(0, 8)}...${result.hash.slice(-6)}\`_`,
    )
  } catch (error) {
    console.error('❌ Error approving request:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Reject Payment Request
 */
export async function handleRejectRequest(
  phoneNumber: string,
  requestId: string,
): Promise<void> {
  try {
    const paymentRequest = await PaymentRequest.findOne({ requestId })

    if (!paymentRequest) {
      await sendTextMessage(phoneNumber, '❌ Payment request not found.')
      return
    }

    if (paymentRequest.status !== 'pending') {
      await sendTextMessage(
        phoneNumber,
        '⚠️ This request has already been processed.',
      )
      return
    }

    paymentRequest.status = 'rejected'
    paymentRequest.completedAt = new Date()
    await paymentRequest.save()

    const requester = await User.findOne({
      xrpl_address: paymentRequest.requesterAddress,
    })

    if (requester) {
      await sendTextMessage(
        requester.phoneNumber,
        `❌ *Payment Request Declined*\n\n` +
          `Your request for *${paymentRequest.amount} ${paymentRequest.currency}* was declined.\n\n` +
          `· · · · · · · · · ·\n` +
          `_You can send a new request at any time._`,
      )
    }

    await sendTextMessage(phoneNumber, `✅ Payment request declined.`)
    console.log(`✅ Payment request ${requestId} declined`)
  } catch (error) {
    console.error('❌ Error declining request:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

export async function handleMyContacts(
  phoneNumber: string,
  user: any,
): Promise<void> {
  try {
    await FlowLauncherService.launchManageContactsFlow(user)
  } catch (error) {
    console.error('❌ Error launching manage contacts flow:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

export async function handleSaveContact(
  phoneNumber: string,
  user: any,
  contactPhone: string,
): Promise<void> {
  try {
    const normalizedPhone = normalizeToE164(contactPhone)

    const already = (user.beneficiaries ?? []).some(
      (b: any) => b.phoneNumber === normalizedPhone,
    )
    if (already) {
      await sendTextMessage(phoneNumber, '⚠️ This contact is already saved.')
      return
    }

    const contactUser = await User.findOne({ phoneNumber: normalizedPhone })
    const nickname = contactUser?.username || normalizedPhone

    const { randomBytes } = await import('node:crypto')
    user.beneficiaries.push({
      id: randomBytes(8).toString('hex'),
      nickname,
      phoneNumber: normalizedPhone,
      addedAt: new Date(),
    })
    await user.save()

    await sendTextMessage(
      phoneNumber,
      `✅ *${nickname}* has been saved to your contacts.\n\n_You can now select them from "Saved Contact" when sending money._`,
    )
  } catch (error) {
    console.error('❌ Error saving contact:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}
