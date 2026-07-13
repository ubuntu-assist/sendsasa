import bcrypt from 'bcrypt'
import { User } from '@models/User'
import { Transaction } from '@models/Transaction'
import { PaymentRequest } from '@models/PaymentRequest'
import { FlowLauncherService } from '@messaging/flow/flow-launcher.service'
import {
  sendTextMessage,
  sendPaymentRequestButtons,
  sendDocumentByMediaId,
} from '@messaging/whatsapp/whatsapp.service'
import { sendSaveContactPrompt } from '@messaging/whatsapp/whatsapp-menu.service'
import { sendXRP, sendRLUSD, sendUSDC } from '@blockchain/chains/xrpl.service'
import { walletService } from '@blockchain/chains/wallet.service'
import { evmService } from '@blockchain/chains/evm.service'
import {
  sendSOL,
  sendUSDC as sendSolanaUSDC,
  sendUSDT as sendSolanaUSDT,
  sendEURC as sendSolanaEURC,
} from '@blockchain/chains/solana.service'
import { generateAndUploadReceipt } from '@shared/receipt-generator.service'

// ── Local helper (shared in orchestrator, copied here to avoid circular dep) ──

function getEffectiveXRPLAddress(user: any): string {
  return user.xrpl_address
}

// ── Module-level types and constants ─────────────────────────────────────────

type ChainId = 'xrpl' | 'bsc' | 'solana'

const CURRENCY_CHAIN: Record<string, ChainId> = {
  XRP: 'xrpl',
  RLUSD: 'xrpl',
  USDC: 'xrpl',
  BNB: 'bsc',
  USDT: 'bsc',
  USDC_BSC: 'bsc',
  SOL: 'solana',
  USDC_SOL: 'solana',
  USDT_SOL: 'solana',
  EURC_SOL: 'solana',
}

export function getAddressForChain(
  user: any,
  chain: ChainId,
): string | undefined {
  if (chain === 'xrpl') return user.xrpl_address || user.xrpl_address
  if (chain === 'bsc') return user.evm_address
  if (chain === 'solana') return user.solana_address
  return undefined
}

/**
 * Handle Send Money Flow Completion
 *
 * PIN was already validated in FlowDataExchangeService.handleSendMoneyConfirm.
 * This handler executes the XRPL transaction and delivers receipts.
 * Runs after the user taps Done on SEND_MONEY_SUCCESS — no timeout risk.
 *
 * nfm_reply payload: currency, amount, total, recipient_display,
 *                    recipient_type, recipient
 */
export async function handleSendMoneyComplete(
  whatsappId: string,
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  try {
    const { currency, amount, recipient_type, recipient, recipient_display } =
      flowData

    const user = await User.findOne({ whatsappId })
    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found.')
      return
    }

    const chain = CURRENCY_CHAIN[currency] ?? 'xrpl'

    // Resolve recipient address
    let recipientAddress: string
    let recipientPhone: string | undefined

    if (recipient_type === 'Phone Number') {
      const cleanPhone = recipient.replaceAll('+', '').replaceAll(/\s/g, '')
      const recipientUser = await User.findOne({ whatsappId: cleanPhone })

      if (!recipientUser) {
        await sendTextMessage(
          phoneNumber,
          '❌ Recipient not found on SendSasa.',
        )
        return
      }

      if (chain === 'xrpl') {
        if (currency === 'RLUSD' && !recipientUser.rlusdTrustLineCreated) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have RLUSD enabled.`,
          )
          return
        }
        if (currency === 'USDC' && !recipientUser.usdcTrustLineCreated) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have USDC enabled.`,
          )
          return
        }
      }

      const addr = getAddressForChain(recipientUser, chain)
      if (!addr) {
        await sendTextMessage(
          phoneNumber,
          `❌ Recipient doesn't have a ${chain.toUpperCase()} wallet on SendSasa.`,
        )
        return
      }
      recipientAddress = addr
      recipientPhone = recipientUser.phoneNumber
    } else if (recipient_type === 'SendSasa Username') {
      const recipientUser = await User.findOne({
        username: recipient.toLowerCase(),
      })

      if (!recipientUser) {
        await sendTextMessage(phoneNumber, '❌ Username not found on SendSasa.')
        return
      }

      if (chain === 'xrpl') {
        if (currency === 'RLUSD' && !recipientUser.rlusdTrustLineCreated) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have RLUSD enabled.`,
          )
          return
        }
        if (currency === 'USDC' && !recipientUser.usdcTrustLineCreated) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have USDC enabled.`,
          )
          return
        }
      }

      const addr = getAddressForChain(recipientUser, chain)
      if (!addr) {
        await sendTextMessage(
          phoneNumber,
          `❌ Recipient doesn't have a ${chain.toUpperCase()} wallet on SendSasa.`,
        )
        return
      }
      recipientAddress = addr
      recipientPhone = recipientUser.phoneNumber
    } else {
      await sendTextMessage(phoneNumber, '❌ Invalid recipient type.')
      return
    }

    await sendTextMessage(phoneNumber, '_Processing transaction..._')

    const numAmount = Number.parseFloat(amount)
    const senderAddress =
      getAddressForChain(user, chain) ?? getEffectiveXRPLAddress(user)
    let txHash: string

    if (chain === 'xrpl') {
      const xrplWallet = await walletService.getXRPLWallet(user.phoneNumber)
      let result: { hash: string }
      if (currency === 'XRP')
        result = await sendXRP(xrplWallet, recipientAddress, numAmount)
      else if (currency === 'RLUSD')
        result = await sendRLUSD(xrplWallet, recipientAddress, numAmount)
      else result = await sendUSDC(xrplWallet, recipientAddress, numAmount)
      txHash = result.hash
    } else if (chain === 'bsc') {
      const senderKey = await walletService.getPrivateKey(user.phoneNumber)
      let receipt: { hash: string }
      if (currency === 'BNB') {
        receipt = await evmService.transferNative(
          senderKey,
          'bsc',
          recipientAddress,
          amount,
        )
      } else if (currency === 'USDT') {
        receipt = await evmService.transferToken(
          senderKey,
          'bsc',
          'USDT',
          recipientAddress,
          amount,
        )
      } else {
        // USDC_BSC
        receipt = await evmService.transferToken(
          senderKey,
          'bsc',
          'USDC',
          recipientAddress,
          amount,
        )
      }
      txHash = receipt.hash
    } else {
      // Solana
      const solanaSeed = await walletService.getSolanaPrivateKey(
        user.phoneNumber,
      )
      let result: { hash: string }
      if (currency === 'USDC_SOL')
        result = await sendSolanaUSDC(solanaSeed, recipientAddress, numAmount)
      else if (currency === 'USDT_SOL')
        result = await sendSolanaUSDT(solanaSeed, recipientAddress, numAmount)
      else if (currency === 'EURC_SOL')
        result = await sendSolanaEURC(solanaSeed, recipientAddress, numAmount)
      else result = await sendSOL(solanaSeed, recipientAddress, numAmount)
      txHash = result.hash
    }

    await Transaction.create({
      txHash,
      fromAddress: senderAddress,
      toAddress: recipientAddress,
      fromPhone: user.phoneNumber,
      toPhone: recipientPhone,
      amount: numAmount,
      currency,
      status: 'success',
      timestamp: new Date(),
    })

    console.log(`✅ Transaction completed: ${txHash}`)

    const dateTime = new Date().toLocaleString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Send receipt to sender
    try {
      const mediaId = await generateAndUploadReceipt({
        transactionId: txHash,
        dateTime,
        senderName: user.username,
        senderPhone: phoneNumber,
        recipientName: recipient_display || recipient,
        recipientPhone: recipientPhone || 'N/A',
        amount: Number.parseFloat(amount),
        currency,
        transactionType: 'Send Money',
      })

      await sendTextMessage(
        phoneNumber,
        `✅ *Payment Successful!*\n\n` +
          `*Sent*   ${amount} ${currency}\n` +
          `*To*     ${recipient_display || recipient}\n\n` +
          `· · · · · · · · · ·\n` +
          `_Your receipt is attached._`,
      )

      await sendDocumentByMediaId(
        phoneNumber,
        mediaId,
        `receipt_${Date.now()}.pdf`,
        `✅ Transaction Receipt — ${amount} ${currency} sent`,
      )
    } catch (receiptError) {
      console.error('⚠️ Error generating sender receipt:', receiptError)
      await sendTextMessage(
        phoneNumber,
        `✅ *Payment Successful!*\n\n` +
          `*Sent*   ${amount} ${currency}\n` +
          `*To*     ${recipient_display || recipient}\n\n` +
          `· · · · · · · · · ·\n` +
          `_TX: \`${txHash.slice(0, 8)}...${txHash.slice(-6)}\`_`,
      )
    }

    // Offer to save contact if the recipient was found by phone and not already saved
    if (recipient_type === 'Phone Number' && recipientPhone) {
      const alreadySaved = (user.beneficiaries ?? []).some(
        (b: any) =>
          b.phoneNumber === recipient || b.phoneNumber === recipientPhone,
      )
      if (!alreadySaved) {
        const recipientUser = await User.findOne({
          phoneNumber: recipientPhone,
        })
        const nickname = recipientUser?.username || recipient
        sendSaveContactPrompt(phoneNumber, nickname, recipient).catch(() => {})
      }
    }

    // Send receipt to recipient if they are on SendSasa
    if (recipientPhone) {
      try {
        const recipientMediaId = await generateAndUploadReceipt({
          transactionId: txHash,
          dateTime,
          senderName: user.username,
          senderPhone: phoneNumber,
          recipientName: recipient_display || recipient,
          recipientPhone: recipientPhone,
          amount: Number.parseFloat(amount),
          currency,
          transactionType: 'Send Money',
        })

        await sendTextMessage(
          recipientPhone,
          `✅ *Payment Received!*\n\n` +
            `*Amount*   ${amount} ${currency}\n` +
            `*From*     ${user.username}\n\n` +
            `· · · · · · · · · ·\n` +
            `_Your receipt is attached._`,
        )

        await sendDocumentByMediaId(
          recipientPhone,
          recipientMediaId,
          `receipt_${Date.now()}.pdf`,
          `✅ Payment Receipt — ${amount} ${currency} received`,
        )
      } catch (recipientError) {
        console.error('⚠️ Error sending receipt to recipient:', recipientError)
        await sendTextMessage(
          recipientPhone,
          `✅ *Payment Received!*\n\n` +
            `*Amount*   ${amount} ${currency}\n` +
            `*From*     ${user.username}\n\n` +
            `· · · · · · · · · ·\n` +
            `_TX: \`${txHash.slice(0, 8)}...${txHash.slice(-6)}\`_`,
        )
      }
    }
  } catch (error) {
    console.error('❌ Error completing send money:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Transaction failed. Please try again.',
    )
  }
}

/**
 * Handle Request Money Flow Completion
 */
export async function handleRequestMoneyComplete(
  whatsappId: string,
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  try {
    const { currency, amount, recipient_type, recipient, note } = flowData

    const user = await User.findOne({ whatsappId })
    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found.')
      return
    }

    let payerAddress: string
    let payerPhone: string
    let recipientUsername: string

    if (recipient_type === 'Phone Number') {
      const cleanPhone = recipient.replaceAll('+', '').replaceAll(/\s/g, '')
      const recipientUser = await User.findOne({ whatsappId: cleanPhone })

      if (!recipientUser) {
        await sendTextMessage(
          phoneNumber,
          '❌ Recipient not found on SendSasa.',
        )
        return
      }

      payerAddress = recipientUser.xrpl_address
      payerPhone = recipientUser.phoneNumber
      recipientUsername = recipientUser.username
    } else if (recipient_type === 'SendSasa Username') {
      const recipientUser = await User.findOne({
        username: recipient.toLowerCase(),
      })

      if (!recipientUser) {
        await sendTextMessage(phoneNumber, '❌ Username not found on SendSasa.')
        return
      }

      payerAddress = recipientUser.xrpl_address
      payerPhone = recipientUser.phoneNumber
      recipientUsername = recipientUser.username
    } else {
      await sendTextMessage(
        phoneNumber,
        '❌ Payment requests can only be sent to SendSasa users.',
      )
      return
    }

    const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substring(7)}`

    const paymentRequest = await PaymentRequest.create({
      requestId,
      requesterAddress: user.xrpl_address,
      requesterPhone: user.phoneNumber,
      payerAddress,
      payerPhone,
      amount: Number.parseFloat(amount),
      currency,
      message: note || '',
      status: 'pending',
      createdAt: new Date(),
    })

    console.log(`✅ Payment request created: ${paymentRequest.requestId}`)

    await sendTextMessage(
      phoneNumber,
      `✅ *Payment Request Sent!*\n\n` +
        `*Amount*   ${amount} ${currency}\n` +
        `*To*       ${recipientUsername}\n` +
        `*Note*     ${note || '—'}\n\n` +
        `· · · · · · · · · ·\n` +
        `_We'll notify you when they respond._`,
    )

    await sendPaymentRequestButtons(
      payerPhone,
      user.username,
      Number.parseFloat(amount),
      paymentRequest.requestId,
      currency,
    )
  } catch (error) {
    console.error('❌ Error completing request money:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Failed to send payment request. Please try again.',
    )
  }
}

/**
 * Handle Send Money — Launch send money flow
 */
export async function handleSendMoney(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendTextMessage(
        phoneNumber,
        '❌ User not found. Please register first.',
      )
      return
    }

    if (!user.pinHash) {
      await sendTextMessage(
        phoneNumber,
        '⚠️ Please set up your transaction PIN first.\n\nLaunching PIN setup...',
      )
      await FlowLauncherService.launchPinSetupFlow(user)
      return
    }

    const isDefaultPin = await bcrypt.compare('0000', user.pinHash)
    if (isDefaultPin) {
      await sendTextMessage(
        phoneNumber,
        '⚠️ Please set up your transaction PIN first.\n\nLaunching PIN setup...',
      )
      await FlowLauncherService.launchPinSetupFlow(user)
      return
    }

    await FlowLauncherService.launchSendMoneyFlow(user)
    console.log(`✅ Send money flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling send money:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Request Crypto — Launch request money flow with balances
 */
export async function handleRequestCrypto(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendTextMessage(
        phoneNumber,
        '❌ User not found. Please register first.',
      )
      return
    }

    await FlowLauncherService.launchRequestMoneyFlow(user)
    console.log(`✅ Request crypto flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling request crypto:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Request by Card — Launch request-card flow
 */
export async function handleRequestByCard(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendTextMessage(
        phoneNumber,
        '❌ User not found. Please register first.',
      )
      return
    }

    await FlowLauncherService.launchRequestCardFlow(user)
    console.log(`✅ Request by card flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling request by card:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}
