import bcrypt from 'bcrypt'
import { User } from '@models/User'
import { FlowLauncherService } from '@messaging/flow/flow-launcher.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { sendMainMenu } from '@messaging/whatsapp/whatsapp-menu.service'
import {
  sendXRP,
  sendRLUSD,
  sendUSDC,
} from '@blockchain/chains/xrpl.service'
import { walletService } from '@blockchain/chains/wallet.service'
import { evmService } from '@blockchain/chains/evm.service'
import {
  mobileMoneyService,
  PROVIDER_DISPLAY,
  type MobileMoneyProvider,
} from '@shared/mobile-money.service'
import { OffRampTransaction } from '@models/index'
import { getAdminXRPLAddress, getAdminEVMAddress } from '@config/admin-wallet'

// ── Local helper (shared in orchestrator, copied here to avoid circular dep) ──

function getEffectiveXRPLAddress(user: any): string {
  return user.xrpl_address
}

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Handle "Cash Out" menu tap — launch the off-ramp flow.
 */
export async function handleOffRamp(
  _whatsappId: string,
  phoneNumber: string,
  user: any,
): Promise<void> {
  try {
    const isDefaultPin = await bcrypt.compare('0000', user.pinHash)
    if (isDefaultPin) {
      await sendTextMessage(
        phoneNumber,
        '⚠️ Please set up your transaction PIN first.\n\nLaunching PIN setup...',
      )
      await FlowLauncherService.launchPinSetupFlow(user)
      return
    }

    await FlowLauncherService.launchOffRampFlow(user)
  } catch (error) {
    console.error('❌ Error launching off-ramp flow:', error)
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}


/**
 * User tapped "Pay with Card" or "Apple / Google Pay" — launch the flow.
 * No PIN check — card payment authenticates the sender via Coinbase KYC.
 * No migration check — card payments don't touch the user's crypto wallet.
 */
export async function handleLaunchCardPaymentFlow(
  phoneNumber: string,
  user: any,
  paymentType: 'hosted' | 'headless',
): Promise<void> {
  try {
    await FlowLauncherService.launchCardPaymentFlow(user, paymentType)
  } catch (error) {
    console.error('❌ Error launching card payment flow:', error)
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}

/**
 * Handle Off-Ramp Flow Completion (nfm_reply from OFFRAMP_SUCCESS).
 *
 * Sequence:
 *   1. Re-derive quote (fresh rate) and confirm balance
 *   2. Transfer crypto from user → admin wallet
 *   3. Record OffRampTransaction
 *   4. Call Mobile Money payout API
 *   5. Send receipt to sender
 */
export async function handleOffRampComplete(
  whatsappId: string,
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  const {
    crypto_currency,
    crypto_amount,
    recipient_phone,
    mm_provider,
    xaf_amount,
    fixer_rate,
    sendsasa_rate,
    crypto_amount_usd,
    fee_xaf,
  } = flowData

  const user = await User.findOne({ whatsappId })
  if (!user) {
    await sendTextMessage(phoneNumber, '❌ User not found.')
    return
  }

  await sendTextMessage(phoneNumber, '_Processing your cash out..._')

  const numAmount = Number.parseFloat(crypto_amount)
  const numXAF = Number.parseInt(xaf_amount, 10)
  const provider = mm_provider as MobileMoneyProvider

  // Resolve admin address before touching the blockchain
  const isUSDT = crypto_currency === 'USDT'
  const adminAddress = isUSDT
    ? await getAdminEVMAddress()
    : await getAdminXRPLAddress()
  const cryptoChain = isUSDT ? 'bsc' : 'xrpl'

  // ── Step 1: create the record BEFORE sending ──────────────────────────────
  // If the server crashes after the on-chain tx confirms but before we write
  // to the DB, we would lose the record. Creating it first lets us recover.
  const offRamp = await OffRampTransaction.create({
    senderPhone: user.phoneNumber,
    senderAddress: getEffectiveXRPLAddress(user),
    cryptoAmount: numAmount,
    cryptoCurrency: crypto_currency,
    cryptoChain,
    adminAddress,
    cryptoAmountUSD: Number.parseFloat(crypto_amount_usd || '0'),
    fixerRate: Number.parseFloat(fixer_rate || '0'),
    sendSasaRate: Number.parseFloat(sendsasa_rate || '0'),
    feeXAF: Number.parseInt(fee_xaf || '0', 10),
    recipientPhone: recipient_phone,
    mmProvider: provider,
    xafAmount: numXAF,
    status: 'pending',
  })

  const refId = (offRamp._id as { toString(): string }).toString()

  // ── Step 2: send crypto to admin wallet ───────────────────────────────────
  // submitAndWait (XRPL) and tx.wait(1) (EVM) both block until the tx is
  // in a validated ledger / mined block with a success status — so when
  // these return without throwing, the admin wallet has the funds.
  let cryptoTxHash: string

  try {
    offRamp.status = 'crypto_sent'
    await offRamp.save()

    if (isUSDT) {
      const senderKey = await walletService.getPrivateKey(user.phoneNumber)
      const receipt = await evmService.transferToken(
        senderKey, 'bsc', 'USDT', adminAddress, numAmount.toString(),
      )
      cryptoTxHash = receipt.hash
    } else {
      const xrplWallet = await walletService.getXRPLWallet(user.phoneNumber)
      let result: { hash: string }
      if (crypto_currency === 'XRP') {
        result = await sendXRP(xrplWallet, adminAddress, numAmount)
      } else if (crypto_currency === 'RLUSD') {
        result = await sendRLUSD(xrplWallet, adminAddress, numAmount)
      } else {
        result = await sendUSDC(xrplWallet, adminAddress, numAmount)
      }
      cryptoTxHash = result.hash
    }

    offRamp.cryptoTxHash = cryptoTxHash
    offRamp.status = 'crypto_confirmed'
    await offRamp.save()
    console.log(`✅ Off-ramp crypto confirmed: ${cryptoTxHash} (ref: ${refId})`)
  } catch (error: any) {
    offRamp.status = 'failed'
    offRamp.failureReason = error.message
    await offRamp.save()
    console.error('❌ Off-ramp crypto transfer failed:', error)
    await sendTextMessage(
      phoneNumber,
      `❌ *Transfer Failed*\n\n` +
        `Could not send ${crypto_currency} to our wallet.\n` +
        `${error.message || 'Please try again.'}\n\n` +
        `· · · · · · · · · ·\n` +
        `*Ref:* \`${refId}\``,
    )
    return
  }

  // ── Step 3: trigger Mobile Money payout ──────────────────────────────────
  try {
    const payoutResult = await mobileMoneyService.payout({
      provider,
      recipientPhone: recipient_phone,
      amount: numXAF,
      currency: 'XAF',
      reference: refId,
      description: `SendSasa payment from ${user.username}`,
    })

    offRamp.status = payoutResult.success ? 'completed' : 'payout_initiated'
    offRamp.mmTxId = payoutResult.providerTxId
    if (payoutResult.success) offRamp.completedAt = new Date()
    await offRamp.save()
  } catch (error: any) {
    // Crypto is safely in admin wallet — flag for manual payout
    offRamp.status = 'failed'
    offRamp.failureReason = error.message
    await offRamp.save()
    console.error('❌ Mobile Money payout failed:', error)
    await sendTextMessage(
      phoneNumber,
      `⚠️ *Crypto Received — Payout Pending*\n\n` +
        `We received your *${numAmount} ${crypto_currency}*.\n` +
        `The Mobile Money payout is being processed manually.\n\n` +
        `· · · · · · · · · ·\n` +
        `*Ref:* \`${refId}\`\n` +
        `_Our team will complete your payout shortly._`,
    )
    return
  }

  // ── Step 4: receipt ───────────────────────────────────────────────────────
  const providerName = PROVIDER_DISPLAY[provider]
  const dateTime = new Date().toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })

  await sendTextMessage(
    phoneNumber,
    `✅ *Cash Out Successful!*\n\n` +
      `*Sent:* ${numAmount} ${crypto_currency}\n` +
      `*Delivered:* ${numXAF.toLocaleString()} XAF\n` +
      `*To:* ${providerName} ${recipient_phone}\n` +
      `*Time:* ${dateTime}\n\n` +
      `· · · · · · · · · ·\n` +
      `*Ref:* \`${refId}\``,
  )

  await sendMainMenu(phoneNumber, user.username)
}
