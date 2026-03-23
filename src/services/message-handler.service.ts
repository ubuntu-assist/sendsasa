// src/services/message-handler.service.ts

import bcrypt from 'bcrypt'
import { User } from '../models/User'
import { Transaction } from '../models/Transaction'
import { PaymentRequest } from '../models/PaymentRequest'
import { FlowLauncherService } from './flow-launcher.service'
import {
  sendTextMessage,
  sendPaymentRequestButtons,
  sendDocumentByMediaId,
} from './whatsapp.service'
import {
  sendWelcomeMessage,
  sendMainMenu,
  sendWalletMenu,
  sendFundingMessage,
} from './whatsapp-menu.service'
import {
  getAllBalances,
  sendXRP,
  sendRLUSD,
  sendUSDC,
  generateWallet,
  createRLUSDTrustLine,
  createUSDCTrustLine,
  hasRLUSDTrustLine,
  hasUSDCTrustLine,
  isAccountActivated,
  encryptSeed,
  decryptSeed,
} from './xrpl.service'
import { parseButtonInteraction } from './message-parser.service'
import { usernameService } from './username.service'
import { generateAndUploadReceipt } from './receipt-generator.service'
import config from '../utils/config'

/**
 * Normalize a PIN value to a canonical string.
 *
 * Passcode inputs behave inconsistently across Flow actions:
 * - data_exchange: arrives as a number → 01042 → 1042 (JS drops leading zero)
 * - complete:      arrives as a string → "01042" (leading zero preserved)
 *
 * parseInt strips leading zeros so both always compare to the same value.
 */
function normalizePin(pin: string | number): string {
  return parseInt(pin.toString(), 10).toString()
}

// ── Public handlers ──────────────────────────────────────────────────────────

/**
 * Handle incoming text messages
 */
export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  profileName?: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber, profileName || 'there')
      return
    }

    // If account was created on mainnet but never funded, remind user to fund it
    if (!user.rlusdTrustLineCreated && !user.usdcTrustLineCreated) {
      const activated = await isAccountActivated(user.xrplAddress)
      if (!activated) {
        await sendFundingMessage(phoneNumber, user.xrplAddress)
        return
      }
    }

    const balances = await getAllBalances(user.xrplAddress)
    await sendMainMenu(
      phoneNumber,
      balances.xrp,
      balances.rlusd,
      balances.usdc,
      user.username,
    )
  } catch (error) {
    console.error('❌ Error handling message:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle button clicks and interactive list selections
 */
export async function handleInteraction(
  whatsappId: string,
  phoneNumber: string,
  interactionId: string,
  profileName?: string,
): Promise<void> {
  try {
    console.log(`🔘 Interaction: ${interactionId} by ${whatsappId}`)

    const interaction = parseButtonInteraction(interactionId)

    // These actions don't require an existing user record
    if (interaction.action === 'get_started') {
      await handleGetStarted(whatsappId, phoneNumber, profileName)
      return
    }

    if (interaction.action === 'import_wallet') {
      await handleImportWallet(whatsappId, phoneNumber)
      return
    }

    if (interaction.action === 'check_activation') {
      await handleCheckActivation(whatsappId, phoneNumber)
      return
    }

    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber, profileName)
      return
    }

    switch (interaction.action) {
      case 'main_menu': {
        const balances = await getAllBalances(user.xrplAddress)
        await sendMainMenu(
          phoneNumber,
          balances.xrp,
          balances.rlusd,
          balances.usdc,
          user.username,
        )
        break
      }

      case 'send_money':
        await handleSendMoney(whatsappId, phoneNumber)
        break

      case 'request_money':
        await handleRequestMoney(whatsappId, phoneNumber)
        break

      case 'my_wallet':
        await handleMyWallet(phoneNumber, user)
        break

      case 'transaction_history':
        await handleTransactionHistory(whatsappId, phoneNumber)
        break

      case 'pending_requests':
        await handlePendingRequests(whatsappId, phoneNumber)
        break

      case 'approve':
        if (interaction.requestId) {
          await handleApproveRequest(phoneNumber, user, interaction.requestId)
        }
        break

      case 'reject':
        if (interaction.requestId) {
          await handleRejectRequest(phoneNumber, interaction.requestId)
        }
        break

      default: {
        const userBalances = await getAllBalances(user.xrplAddress)
        await sendMainMenu(
          phoneNumber,
          userBalances.xrp,
          userBalances.rlusd,
          userBalances.usdc,
          user.username,
        )
      }
    }
  } catch (error) {
    console.error('❌ Error handling interaction:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle WhatsApp Flow Response (nfm_reply)
 *
 * Routing logic:
 * - PIN setup:     has pin + confirm_pin
 * - Wallet import: has seed + xrpl_address
 * - Send money:    has currency + amount + recipient + recipient_type + total
 * - Request money: has currency + amount + recipient + recipient_type, no total
 */
export async function handleFlowResponse(
  whatsappId: string,
  phoneNumber: string,
  nfmReply: any,
): Promise<void> {
  try {
    const responseJson = JSON.parse(nfmReply.response_json)

    console.log('📋 Flow response received:', {
      whatsappId,
      response: responseJson,
    })

    const hasPinSetupData =
      responseJson.pin !== undefined &&
      responseJson.pin !== null &&
      responseJson.confirm_pin !== undefined &&
      responseJson.confirm_pin !== null

    const hasImportData =
      responseJson.seed !== undefined && responseJson.xrpl_address !== undefined

    const isSendMoney =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.currency !== undefined &&
      responseJson.amount !== undefined &&
      responseJson.recipient !== undefined &&
      responseJson.recipient_type !== undefined &&
      responseJson.total !== undefined

    const isRequestMoney =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.currency !== undefined &&
      responseJson.amount !== undefined &&
      responseJson.recipient !== undefined &&
      responseJson.recipient_type !== undefined &&
      responseJson.total === undefined

    if (hasPinSetupData) {
      await handlePinSetupComplete(whatsappId, phoneNumber, responseJson)
    } else if (hasImportData) {
      await handleWalletImportComplete(whatsappId, phoneNumber, responseJson)
    } else if (isSendMoney) {
      await handleSendMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else if (isRequestMoney) {
      await handleRequestMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else {
      console.log('⚠️ Unknown flow response format:', responseJson)
      await sendTextMessage(phoneNumber, '✅ Flow completed!')
    }
  } catch (error) {
    console.error('❌ Error handling flow response:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error processing flow. Please try again.',
    )
  }
}

// ── Private handlers ─────────────────────────────────────────────────────────

/**
 * Handle Get Started — Create new wallet and onboard user
 *
 * On mainnet: generate wallet, save to DB, send funding instructions.
 *             Trust lines and PIN setup deferred until account is funded.
 * On testnet: fund wallet automatically, create trust lines, launch PIN setup.
 */
async function handleGetStarted(
  whatsappId: string,
  phoneNumber: string,
  profileName?: string,
): Promise<void> {
  try {
    let user = await User.findOne({ whatsappId })

    if (user) {
      // Returning user — check if still needs activation
      const activated = await isAccountActivated(user.xrplAddress)
      if (!activated) {
        await sendFundingMessage(phoneNumber, user.xrplAddress)
        return
      }
      const balances = await getAllBalances(user.xrplAddress)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
        user.username,
      )
      return
    }

    await sendTextMessage(
      phoneNumber,
      '⏳ Creating your wallet...\n\nPlease wait a moment.',
    )

    const wallet = await generateWallet()
    const { address, seed } = wallet
    const encryptedData = encryptSeed(seed)
    const defaultPinHash = await bcrypt.hash('0000', 10)

    // Generate username from WhatsApp profile name using UsernameService
    const username = await usernameService.generateUsername(
      profileName || 'user',
    )

    if (config.XRPL_NETWORK !== 'mainnet') {
      // Testnet — wallet auto-funded, create trust lines immediately
      await new Promise((resolve) => setTimeout(resolve, 2000))

      let rlusdCreated = false
      let rlusdHash: string | undefined
      try {
        const result = await createRLUSDTrustLine(seed)
        if (result.success) {
          rlusdCreated = true
          rlusdHash = result.hash
          console.log(`✅ RLUSD trust line created: ${rlusdHash}`)
        }
      } catch (error) {
        console.error('⚠️ RLUSD trust line failed (non-critical):', error)
      }

      let usdcCreated = false
      let usdcHash: string | undefined
      try {
        const result = await createUSDCTrustLine(seed)
        if (result.success) {
          usdcCreated = true
          usdcHash = result.hash
          console.log(`✅ USDC trust line created: ${usdcHash}`)
        }
      } catch (error) {
        console.error('⚠️ USDC trust line failed (non-critical):', error)
      }

      user = await User.create({
        whatsappId,
        phoneNumber,
        xrplAddress: address,
        encryptedSeed: encryptedData,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        username,
        rlusdTrustLineCreated: rlusdCreated,
        usdcTrustLineCreated: usdcCreated,
        rlusdTrustLineHash: rlusdHash,
        usdcTrustLineHash: usdcHash,
      })

      console.log(`✅ New testnet user created: ${whatsappId} (${username})`)
      await FlowLauncherService.launchPinSetupFlow(user)
    } else {
      // Mainnet — wallet not yet on ledger, defer trust lines and PIN setup
      user = await User.create({
        whatsappId,
        phoneNumber,
        xrplAddress: address,
        encryptedSeed: encryptedData,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        username,
        rlusdTrustLineCreated: false,
        usdcTrustLineCreated: false,
      })

      console.log(`✅ New mainnet user created: ${whatsappId} (${username})`)
      await sendFundingMessage(phoneNumber, address)
    }
  } catch (error) {
    console.error('❌ Error handling get started:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error creating your account. Please try again.',
    )
  }
}

/**
 * Handle Import Wallet button tap
 *
 * Guards against existing accounts, then launches the import flow.
 */
async function handleImportWallet(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const existingUser = await User.findOne({ whatsappId })

    if (existingUser) {
      await sendTextMessage(
        phoneNumber,
        '⚠️ You already have a SendSasa account.\n\nIf you want to import a different wallet, please contact support.',
      )
      const balances = await getAllBalances(existingUser.xrplAddress)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
        existingUser.username,
      )
      return
    }

    await FlowLauncherService.launchImportWalletFlow(whatsappId)
  } catch (error) {
    console.error('❌ Error handling import wallet:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle Wallet Import Flow Completion (nfm_reply from IMPORT_WALLET_CONFIRM)
 *
 * The seed was already validated in FlowDataExchangeService.handleImportWalletSeed:
 * - Format validated
 * - Account activated on ledger
 * - Not already registered
 *
 * Here we:
 *   1. Encrypt the seed immediately
 *   2. Create user record
 *   3. Create RLUSD + USDC trust lines
 *   4. Launch PIN setup flow
 */
async function handleWalletImportComplete(
  whatsappId: string,
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  try {
    const { seed, xrpl_address } = flowData

    if (!seed || !xrpl_address) {
      await sendTextMessage(
        phoneNumber,
        '❌ Import data missing. Please try again.',
      )
      return
    }

    // Guard against race conditions
    const existingByWhatsapp = await User.findOne({ whatsappId })
    if (existingByWhatsapp) {
      await sendTextMessage(
        phoneNumber,
        '⚠️ You already have an account on SendSasa.',
      )
      return
    }

    const existingByAddress = await User.findOne({ xrplAddress: xrpl_address })
    if (existingByAddress) {
      await sendTextMessage(
        phoneNumber,
        '❌ This wallet is already registered on SendSasa.',
      )
      return
    }

    await sendTextMessage(
      phoneNumber,
      '⏳ Importing your wallet...\n\nSetting up stablecoin support...',
    )

    // Encrypt seed immediately — never stored in plain text
    const encryptedData = encryptSeed(seed)
    const defaultPinHash = await bcrypt.hash('0000', 10)

    // Generate username from phone number (profile name not available in flow completion)
    const username = await usernameService.generateUsername(
      phoneNumber.replace('+', '') || 'user',
    )

    // Create RLUSD trust line
    let rlusdCreated = false
    let rlusdHash: string | undefined
    try {
      const result = await createRLUSDTrustLine(seed)
      if (result.success) {
        rlusdCreated = true
        rlusdHash = result.hash
        console.log(`✅ RLUSD trust line created: ${rlusdHash}`)
      }
    } catch (error) {
      console.error('⚠️ RLUSD trust line failed (non-critical):', error)
    }

    // Create USDC trust line
    let usdcCreated = false
    let usdcHash: string | undefined
    try {
      const result = await createUSDCTrustLine(seed)
      if (result.success) {
        usdcCreated = true
        usdcHash = result.hash
        console.log(`✅ USDC trust line created: ${usdcHash}`)
      }
    } catch (error) {
      console.error('⚠️ USDC trust line failed (non-critical):', error)
    }

    const user = await User.create({
      whatsappId,
      phoneNumber,
      xrplAddress: xrpl_address,
      encryptedSeed: encryptedData,
      pinHash: defaultPinHash,
      pinAttempts: 0,
      username,
      rlusdTrustLineCreated: rlusdCreated,
      usdcTrustLineCreated: usdcCreated,
      rlusdTrustLineHash: rlusdHash,
      usdcTrustLineHash: usdcHash,
    })

    console.log(
      `✅ Wallet imported: ${whatsappId} (${username}) → ${xrpl_address}`,
    )

    // Launch PIN setup
    await FlowLauncherService.launchPinSetupFlow(user)
  } catch (error) {
    console.error('❌ Error completing wallet import:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error importing wallet. Please try again.',
    )
  }
}

/**
 * Handle Check Activation
 *
 * Called when user taps "Check Activation" after funding their wallet.
 * If funded: creates trust lines then launches PIN setup.
 * If not yet funded: re-sends funding instructions.
 */
async function handleCheckActivation(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber)
      return
    }

    await sendTextMessage(phoneNumber, '⏳ Checking your wallet activation...')

    const activated = await isAccountActivated(user.xrplAddress)

    if (!activated) {
      await sendTextMessage(
        phoneNumber,
        `⚠️ *Wallet not yet activated.*\n\nYour address:\n\`${user.xrplAddress}\`\n\nPlease send at least *10 XRP* to this address and tap *Check Activation* again.`,
      )
      await sendFundingMessage(phoneNumber, user.xrplAddress)
      return
    }

    await sendTextMessage(
      phoneNumber,
      '✅ *Wallet activated!*\n\nSetting up stablecoin support...',
    )

    // Create RLUSD trust line if not already created
    let rlusdCreated = user.rlusdTrustLineCreated
    let rlusdHash = user.rlusdTrustLineHash
    if (!rlusdCreated) {
      try {
        const seed = decryptSeed(user.encryptedSeed)
        const result = await createRLUSDTrustLine(seed)
        if (result.success) {
          rlusdCreated = true
          rlusdHash = result.hash
          console.log(`✅ RLUSD trust line created: ${rlusdHash}`)
        }
      } catch (error) {
        console.error('⚠️ RLUSD trust line failed:', error)
      }
    }

    // Create USDC trust line if not already created
    let usdcCreated = user.usdcTrustLineCreated
    let usdcHash = user.usdcTrustLineHash
    if (!usdcCreated) {
      try {
        const seed = decryptSeed(user.encryptedSeed)
        const result = await createUSDCTrustLine(seed)
        if (result.success) {
          usdcCreated = true
          usdcHash = result.hash
          console.log(`✅ USDC trust line created: ${usdcHash}`)
        }
      } catch (error) {
        console.error('⚠️ USDC trust line failed:', error)
      }
    }

    user.rlusdTrustLineCreated = rlusdCreated
    user.usdcTrustLineCreated = usdcCreated
    if (rlusdHash) user.rlusdTrustLineHash = rlusdHash
    if (usdcHash) user.usdcTrustLineHash = usdcHash
    await user.save()

    // Check if PIN still needs to be set up
    const isDefaultPin = await bcrypt.compare('0000', user.pinHash)

    if (isDefaultPin) {
      await FlowLauncherService.launchPinSetupFlow(user)
    } else {
      const balances = await getAllBalances(user.xrplAddress)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
        user.username,
      )
    }
  } catch (error) {
    console.error('❌ Error handling check activation:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error checking activation. Please try again.',
    )
  }
}

/**
 * Handle PIN Setup Flow Completion
 */
async function handlePinSetupComplete(
  whatsappId: string,
  phoneNumber: string,
  flowData: any,
): Promise<void> {
  try {
    const { pin, confirm_pin } = flowData

    const pinStr = normalizePin(pin)
    const confirmPinStr = normalizePin(confirm_pin)

    console.log('🔐 PIN setup normalization:', {
      rawPin: pin,
      rawConfirm: confirm_pin,
      normalizedPin: pinStr,
      normalizedConfirm: confirmPinStr,
    })

    if (pinStr !== confirmPinStr) {
      await sendTextMessage(
        phoneNumber,
        '❌ PINs do not match. Please try again.',
      )
      return
    }

    const user = await User.findOne({ whatsappId })
    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found.')
      return
    }

    const pinHash = await bcrypt.hash(pinStr, 10)
    user.pinHash = pinHash
    user.pinLastChanged = new Date()
    user.pinAttempts = 0
    user.pinLockedUntil = undefined
    await user.save()

    console.log(`✅ PIN set up for user ${whatsappId} (normalized: ${pinStr})`)

    const balances = await getAllBalances(user.xrplAddress)

    await sendTextMessage(
      phoneNumber,
      `✅ *Account Secured!*\n\n` +
        `Your transaction PIN has been set successfully.\n\n` +
        `💰 *Your Wallet*\n` +
        `🔷 XRP: ${balances.xrp}\n` +
        `💵 RLUSD: ${balances.rlusd}\n` +
        `🔵 USDC: ${balances.usdc}\n\n` +
        `Username: ${user.username}\n\n` +
        `You can now send and receive money securely! 🔐`,
    )

    await sendMainMenu(
      phoneNumber,
      balances.xrp,
      balances.rlusd,
      balances.usdc,
      user.username,
    )
  } catch (error) {
    console.error('❌ Error completing PIN setup:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error setting up PIN. Please try again.',
    )
  }
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
async function handleSendMoneyComplete(
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

    // Resolve recipient address
    let recipientAddress: string
    let recipientPhone: string | undefined

    if (recipient_type === 'Phone Number') {
      const cleanPhone = recipient.replace(/\+/g, '').replace(/\s/g, '')
      const recipientUser = await User.findOne({ whatsappId: cleanPhone })

      if (!recipientUser) {
        await sendTextMessage(
          phoneNumber,
          '❌ Recipient not found on SendSasa.',
        )
        return
      }

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

      recipientAddress = recipientUser.xrplAddress
      recipientPhone = recipientUser.phoneNumber
    } else if (recipient_type === 'SendSasa Username') {
      const recipientUser = await User.findOne({
        username: recipient.toLowerCase(),
      })

      if (!recipientUser) {
        await sendTextMessage(phoneNumber, '❌ Username not found on SendSasa.')
        return
      }

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

      recipientAddress = recipientUser.xrplAddress
      recipientPhone = recipientUser.phoneNumber
    } else {
      // Wallet Address
      recipientAddress = recipient

      if (currency === 'RLUSD') {
        const hasTrustLine = await hasRLUSDTrustLine(recipientAddress)
        if (!hasTrustLine) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have RLUSD trust line.`,
          )
          return
        }
      } else if (currency === 'USDC') {
        const hasTrustLine = await hasUSDCTrustLine(recipientAddress)
        if (!hasTrustLine) {
          await sendTextMessage(
            phoneNumber,
            `❌ Recipient doesn't have USDC trust line.`,
          )
          return
        }
      }
    }

    await sendTextMessage(phoneNumber, '⏳ Processing transaction...')

    const senderSeed = decryptSeed(user.encryptedSeed)
    let result: { hash: string; result: string }

    if (currency === 'XRP') {
      result = await sendXRP(senderSeed, recipientAddress, parseFloat(amount))
    } else if (currency === 'RLUSD') {
      result = await sendRLUSD(senderSeed, recipientAddress, parseFloat(amount))
    } else {
      result = await sendUSDC(senderSeed, recipientAddress, parseFloat(amount))
    }

    const txHash = result.hash

    await Transaction.create({
      txHash,
      fromAddress: user.xrplAddress,
      toAddress: recipientAddress,
      fromPhone: user.phoneNumber,
      toPhone: recipientPhone,
      amount: parseFloat(amount),
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
        amount: parseFloat(amount),
        currency,
        transactionType: 'Send Money',
      })

      await sendTextMessage(
        phoneNumber,
        `✅ Payment Successful!\n\n💸 Sent ${amount} ${currency} to ${recipient_display || recipient}\n\n📄 Your receipt is ready!`,
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
        `✅ Payment Successful!\n\n💸 Sent ${amount} ${currency} to ${recipient_display || recipient}\n\n🔖 TX: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`,
      )
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
          amount: parseFloat(amount),
          currency,
          transactionType: 'Send Money',
        })

        await sendTextMessage(
          recipientPhone,
          `✅ Payment Received!\n\n${amount} ${currency} from ${user.username}\n\n📄 Your receipt is ready!`,
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
          `✅ Payment Received!\n\n${amount} ${currency} from ${user.username}\n\n🔖 TX: ${txHash.slice(0, 8)}...${txHash.slice(-6)}`,
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
async function handleRequestMoneyComplete(
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
      const cleanPhone = recipient.replace(/\+/g, '').replace(/\s/g, '')
      const recipientUser = await User.findOne({ whatsappId: cleanPhone })

      if (!recipientUser) {
        await sendTextMessage(
          phoneNumber,
          '❌ Recipient not found on SendSasa.',
        )
        return
      }

      payerAddress = recipientUser.xrplAddress
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

      payerAddress = recipientUser.xrplAddress
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
      requesterAddress: user.xrplAddress,
      requesterPhone: user.phoneNumber,
      payerAddress,
      payerPhone,
      amount: parseFloat(amount),
      currency,
      message: note || '',
      status: 'pending',
      createdAt: new Date(),
    })

    console.log(`✅ Payment request created: ${paymentRequest.requestId}`)

    await sendTextMessage(
      phoneNumber,
      `✅ *Payment Request Sent!*\n\n` +
        `💰 Amount: ${amount} ${currency}\n` +
        `📍 To: ${recipientUsername}\n` +
        `📝 Note: ${note || 'N/A'}\n\n` +
        `You'll be notified when they respond.`,
    )

    await sendPaymentRequestButtons(
      payerPhone,
      user.username,
      parseFloat(amount),
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
async function handleSendMoney(
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
 * Handle Request Money — Launch request money flow
 */
async function handleRequestMoney(
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
    console.log(`✅ Request money flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling request money:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

/**
 * Handle My Wallet
 */
async function handleMyWallet(phoneNumber: string, user: any): Promise<void> {
  try {
    const balances = await getAllBalances(user.xrplAddress)
    await sendWalletMenu(
      phoneNumber,
      balances.xrp,
      balances.rlusd,
      balances.usdc,
      user.username,
    )
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
async function handleTransactionHistory(
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
      $or: [{ fromAddress: user.xrplAddress }, { toAddress: user.xrplAddress }],
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

    let message = '📜 *Transaction History* (Last 5)\n\n'

    transactions.forEach((tx, index) => {
      const isSent = tx.fromAddress === user.xrplAddress

      message += `*${isSent ? 'Sent' : 'Received'}*\n`
      message += `${tx.amount} ${tx.currency}\n`
      message += `${isSent ? 'To' : 'From'}: ${isSent ? tx.toAddress.slice(0, 8) : tx.fromAddress.slice(0, 8)}...\n`
      message += `${new Date(tx.timestamp).toLocaleDateString()}\n`

      if (index < transactions.length - 1) message += '\n'
    })

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
async function handlePendingRequests(
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
      payerAddress: user.xrplAddress,
      status: 'pending',
    }).sort({ createdAt: -1 })

    if (requests.length === 0) {
      await sendTextMessage(phoneNumber, '📋 No pending payment requests.')
      return
    }

    let message = '📋 *Pending Payment Requests*\n\n'

    for (const req of requests) {
      const requester = await User.findOne({
        xrplAddress: req.requesterAddress,
      })

      message += `${req.amount} ${req.currency}\n`
      message += `From: ${requester?.username || 'Unknown'}\n`
      message += `${req.message ? `Note: ${req.message}\n` : ''}`
      message += `ID: ${req.requestId.slice(-8)}\n\n`
    }

    message += 'Check WhatsApp for approval buttons.'

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
async function handleApproveRequest(
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

    if (paymentRequest.payerAddress !== user.xrplAddress) {
      await sendTextMessage(phoneNumber, '❌ This request is not for you.')
      return
    }

    const balances = await getAllBalances(user.xrplAddress)
    let sufficient = false

    if (paymentRequest.currency === 'XRP') {
      sufficient = parseFloat(balances.xrp) >= paymentRequest.amount + 1
    } else if (paymentRequest.currency === 'RLUSD') {
      sufficient = parseFloat(balances.rlusd) >= paymentRequest.amount
    } else if (paymentRequest.currency === 'USDC') {
      sufficient = parseFloat(balances.usdc) >= paymentRequest.amount
    }

    if (!sufficient) {
      await sendTextMessage(
        phoneNumber,
        `❌ Insufficient ${paymentRequest.currency} balance.\n\nYou need ${paymentRequest.amount} ${paymentRequest.currency}.`,
      )
      return
    }

    const requester = await User.findOne({
      xrplAddress: paymentRequest.requesterAddress,
    })
    if (!requester) {
      await sendTextMessage(phoneNumber, '❌ Requester not found.')
      return
    }

    const senderSeed = decryptSeed(user.encryptedSeed)
    let result: any

    if (paymentRequest.currency === 'XRP') {
      result = await sendXRP(
        senderSeed,
        requester.xrplAddress,
        paymentRequest.amount,
      )
    } else if (paymentRequest.currency === 'RLUSD') {
      result = await sendRLUSD(
        senderSeed,
        requester.xrplAddress,
        paymentRequest.amount,
      )
    } else {
      result = await sendUSDC(
        senderSeed,
        requester.xrplAddress,
        paymentRequest.amount,
      )
    }

    paymentRequest.status = 'approved'
    paymentRequest.txHash = result.hash
    paymentRequest.completedAt = new Date()
    await paymentRequest.save()

    await Transaction.create({
      txHash: result.hash,
      fromAddress: user.xrplAddress,
      toAddress: requester.xrplAddress,
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
        `Amount: ${paymentRequest.amount} ${paymentRequest.currency}\n` +
        `To: ${requester.username}\n` +
        `TX Hash: ${result.hash.slice(0, 8)}...${result.hash.slice(-6)}`,
    )

    await sendTextMessage(
      requester.phoneNumber,
      `✅ *Payment Received!*\n\n` +
        `Amount: ${paymentRequest.amount} ${paymentRequest.currency}\n` +
        `From: ${user.username}\n` +
        `TX Hash: ${result.hash.slice(0, 8)}...${result.hash.slice(-6)}`,
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
async function handleRejectRequest(
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
      xrplAddress: paymentRequest.requesterAddress,
    })

    if (requester) {
      await sendTextMessage(
        requester.phoneNumber,
        `❌ *Payment Request Declined*\n\n` +
          `Your request for ${paymentRequest.amount} ${paymentRequest.currency} was declined.`,
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
