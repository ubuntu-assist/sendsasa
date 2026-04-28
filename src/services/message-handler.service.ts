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
  sendSaveContactPrompt,
  sendSendMoneyTypeList,
  sendRequestTypeButtons,
} from './whatsapp-menu.service'
import {
  getAllBalances,
  sendXRP,
  sendRLUSD,
  sendUSDC,
  createRLUSDTrustLine,
  createUSDCTrustLine,
  hasRLUSDTrustLine,
  hasUSDCTrustLine,
  isAccountActivated,
} from './xrpl.service'
import { walletService } from './wallet.service'
import { evmService } from './evm.service'
import { getAllBalances as getSolanaBalances, sendSOL, sendUSDC as sendSolanaUSDC, sendUSDT as sendSolanaUSDT, sendEURC as sendSolanaEURC } from './solana.service'
import { normalizeToE164 } from './phone-number.service'
import { mobileMoneyService, PROVIDER_DISPLAY, type MobileMoneyProvider } from './mobile-money.service'
import { OffRampTransaction } from '../models'
import { getAdminXRPLAddress, getAdminEVMAddress } from '../config/admin-wallet'
import { parseButtonInteraction } from './message-parser.service'
import { usernameService } from './username.service'
import { generateAndUploadReceipt } from './receipt-generator.service'
import config from '../utils/config'

// ── Wallet helpers ────────────────────────────────────────────────────────────

function getEffectiveXRPLAddress(user: any): string {
  return user.xrpl_address
}

/**
 * Fetch XRPL and EVM balances in parallel.
 * EVM calls fall back to '0' on error so a single chain outage never breaks the menu.
 */
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

  const safeSolana = async (): Promise<{ sol: string; usdc: string; usdt: string; eurc: string }> => {
    if (!solanaAddress) return { sol: '0', usdc: '0', usdt: '0', eurc: '0' }
    try {
      return await getSolanaBalances(solanaAddress)
    } catch {
      return { sol: '0', usdc: '0', usdt: '0', eurc: '0' }
    }
  }

  const [xrplBalances, bnb, bscUsdt, bscUsdc, solana] = await Promise.all([
    getAllBalances(xrplAddress),
    evmAddress ? safe(() => evmService.getBalance(evmAddress, 'bsc')) : Promise.resolve('0'),
    evmAddress ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDT')) : Promise.resolve('0'),
    evmAddress ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDC')) : Promise.resolve('0'),
    safeSolana(),
  ])

  return { ...xrplBalances, bnb, bscUsdt, bscUsdc, sol: solana.sol, solUsdc: solana.usdc, solUsdt: solana.usdt, solEurc: solana.eurc }
}

// ─────────────────────────────────────────────────────────────────────────────

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
  return Number.parseInt(pin.toString(), 10).toString()
}

// ── Public handlers ──────────────────────────────────────────────────────────

/**
 * Handle incoming text messages
 */
export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  profileName?: string,
  messageText?: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber, profileName || 'there')
      return
    }

    // PIN recovery — intercept before anything else
    if (user.pendingPinRecovery && user.pendingPinRecovery.expiresAt > new Date()) {
      await handlePinRecoveryAnswer(phoneNumber, user, messageText ?? '')
      return
    }

    const normalizedText = messageText?.trim().toLowerCase() ?? ''
    if (normalizedText === 'forgot pin' || normalizedText === 'reset pin') {
      await handleForgotPin(phoneNumber, user)
      return
    }

    // If account was created on mainnet but never funded, remind user to fund it
    if (!user.rlusdTrustLineCreated && !user.usdcTrustLineCreated) {
      const activated = await isAccountActivated(user.xrpl_address)
      if (!activated) {
        await sendFundingMessage(phoneNumber, user.xrpl_address)
        return
      }
    }

    await sendMainMenu(phoneNumber, user.username)
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
      case 'main_menu':
        await sendMainMenu(phoneNumber, user.username)
        break

      case 'send_money':
        await sendSendMoneyTypeList(phoneNumber)
        break

      case 'send_crypto':
        await handleSendMoney(whatsappId, phoneNumber)
        break

      case 'offramp_money':
        await handleOffRamp(whatsappId, phoneNumber, user)
        break

      case 'card_pay_hosted':
        await handleLaunchCardPaymentFlow(phoneNumber, user, 'hosted')
        break

      case 'card_pay_headless':
        await handleLaunchCardPaymentFlow(phoneNumber, user, 'headless')
        break

      case 'request_money':
        await sendRequestTypeButtons(phoneNumber)
        break

      case 'request_crypto':
        await handleRequestCrypto(whatsappId, phoneNumber)
        break

      case 'request_card':
        await handleRequestByCard(whatsappId, phoneNumber)
        break

      case 'my_wallet':
        await handleMyWallet(phoneNumber, user)
        break

      case 'my_contacts':
        await handleMyContacts(phoneNumber, user)
        break

      case 'save_contact':
        if (interaction.phone) {
          await handleSaveContact(phoneNumber, user, interaction.phone)
        }
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

      default:
        await sendMainMenu(phoneNumber, user.username)
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

    const isOffRamp =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.mm_provider !== undefined &&
      responseJson.recipient_phone !== undefined &&
      responseJson.xaf_amount !== undefined

    const isCardPaymentDone =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.total_usd_charged !== undefined &&
      responseJson.mm_provider_name !== undefined &&
      responseJson.recipient_phone !== undefined

    const isContactsUpdate =
      !hasPinSetupData &&
      !hasImportData &&
      Object.keys(responseJson).length === 0

    if (hasPinSetupData) {
      await handlePinSetupComplete(whatsappId, phoneNumber, responseJson)
    } else if (hasImportData) {
      await handleWalletImportComplete(whatsappId, phoneNumber, responseJson)
    } else if (isOffRamp) {
      await handleOffRampComplete(whatsappId, phoneNumber, responseJson)
    } else if (isSendMoney) {
      await handleSendMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else if (isRequestMoney) {
      await handleRequestMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else if (isCardPaymentDone) {
      if (responseJson.is_card_request === 'true') {
        await sendTextMessage(
          phoneNumber,
          `✅ *Payment request sent!*\n\n` +
            `A payment link has been sent to *${responseJson.payer_phone}* on WhatsApp.\n\n` +
            `Once they pay, *${responseJson.xaf_amount} XAF* will arrive in your ` +
            `${responseJson.mm_provider_name} account (${responseJson.recipient_phone}).`,
        )
      } else {
        await sendTextMessage(
          phoneNumber,
          `✅ *Payment link ready!*\n\n` +
            `Once your card payment is confirmed, *${responseJson.xaf_amount} XAF* will be sent to ` +
            `${responseJson.recipient_phone} via ${responseJson.mm_provider_name}.\n\n` +
            `You'll receive a confirmation message here when the payout is complete.`,
        )
      }
    } else if (isContactsUpdate) {
      await sendTextMessage(phoneNumber, '✅ Your contacts have been updated.')
    } else {
      console.log('⚠️ Unknown flow response format:', responseJson)
      await sendTextMessage(phoneNumber, '✅ Done!')
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
      const activated = await isAccountActivated(user.xrpl_address)
      if (!activated) {
        await sendFundingMessage(phoneNumber, user.xrpl_address)
        return
      }
      await sendMainMenu(phoneNumber, user.username)
      return
    }

    await sendTextMessage(
      phoneNumber,
      '⏳ *Creating your wallet...*\n\n_Please wait a moment._',
    )

    const e164Phone = normalizeToE164(phoneNumber)
    const { xrplAddress: address, evmAddress, solanaAddress } =
      await walletService.getOrCreateWallets(e164Phone)
    const defaultPinHash = await bcrypt.hash('0000', 10)

    // Generate username from WhatsApp profile name using UsernameService
    const username = await usernameService.generateUsername(
      profileName || 'user',
    )

    // Web3Auth fields shared across both testnet/mainnet branches
    const web3authFields = {
      xrpl_address: address,
      evm_address: evmAddress,
      solana_address: solanaAddress,
      web3auth_verifier_id: e164Phone,
      wallet_created_at: new Date(),
    }

    if (config.XRPL_NETWORK !== 'mainnet') {
      // Testnet — derive key once for trust line setup
      const secp256k1Key = await walletService.getPrivateKey(e164Phone)

      let rlusdCreated = false
      let rlusdHash: string | undefined
      try {
        const result = await createRLUSDTrustLine(secp256k1Key)
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
        const result = await createUSDCTrustLine(secp256k1Key)
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
        phoneNumber: e164Phone,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        username,
        rlusdTrustLineCreated: rlusdCreated,
        usdcTrustLineCreated: usdcCreated,
        rlusdTrustLineHash: rlusdHash,
        usdcTrustLineHash: usdcHash,
        ...web3authFields,
      })

      console.log(`✅ New testnet user created: ${whatsappId} (${username})`)
      await FlowLauncherService.launchPinSetupFlow(user)
    } else {
      // Mainnet — wallet not yet on ledger, defer trust lines and PIN setup
      await User.create({
        whatsappId,
        phoneNumber: e164Phone,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        username,
        rlusdTrustLineCreated: false,
        usdcTrustLineCreated: false,
        ...web3authFields,
      })

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
      await sendMainMenu(phoneNumber, existingUser.username)
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

    const existingByAddress = await User.findOne({ xrpl_address })
    if (existingByAddress) {
      await sendTextMessage(
        phoneNumber,
        '❌ This wallet is already registered on SendSasa.',
      )
      return
    }

    await sendTextMessage(
      phoneNumber,
      '⏳ *Importing your wallet...*\n\n_Setting up stablecoin support..._',
    )

    const defaultPinHash = await bcrypt.hash('0000', 10)

    // Generate username from phone number (profile name not available in flow completion)
    const username = await usernameService.generateUsername(
      phoneNumber.replace('+', '') || 'user',
    )

    // Derive Web3Auth key for trust line setup — seed is legacy and not stored
    const e164Phone = normalizeToE164(phoneNumber)
    const secp256k1Key = await walletService.getPrivateKey(e164Phone)

    // Create RLUSD trust line
    let rlusdCreated = false
    let rlusdHash: string | undefined
    try {
      const result = await createRLUSDTrustLine(secp256k1Key)
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
      const result = await createUSDCTrustLine(secp256k1Key)
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
      phoneNumber: e164Phone,
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

    await sendTextMessage(phoneNumber, '⏳ _Checking your wallet activation..._')

    const activated = await isAccountActivated(user.xrpl_address)

    if (!activated) {
      await sendTextMessage(
        phoneNumber,
        `⚠️ *Wallet not yet activated.*\n\nYour address:\n\`${user.xrpl_address}\`\n\nPlease send at least *1 XRP* to this address and tap *Check Activation* again.`,
      )
      await sendFundingMessage(phoneNumber, user.xrpl_address)
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
        const secp256k1Key = await walletService.getPrivateKey(user.phoneNumber)
        const result = await createRLUSDTrustLine(secp256k1Key)
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
        const secp256k1Key = await walletService.getPrivateKey(user.phoneNumber)
        const result = await createUSDCTrustLine(secp256k1Key)
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
      await sendMainMenu(phoneNumber, user.username)
    }
  } catch (error) {
    console.error('❌ Error handling check activation:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error checking activation. Please try again.',
    )
  }
}

// ── PIN Recovery ─────────────────────────────────────────────────────────────

const SECURITY_QUESTION_TEXT: Record<string, string> = {
  mother_maiden: "What is your mother's maiden name?",
  first_pet: "What was your first pet's name?",
  birth_city: 'What city were you born in?',
  favorite_teacher: "What was your favorite teacher's name?",
  first_school: 'What was the name of your first school?',
  childhood_friend: 'Who was your childhood best friend?',
  first_job: 'What was your first job title?',
  favorite_book: 'What is your favorite book?',
  favorite_food: 'What is your favorite food?',
  dream_job: 'What was your childhood dream job?',
  first_car: 'What was your first car model?',
}

async function handleForgotPin(phoneNumber: string, user: any): Promise<void> {
  if (!user.securityQuestions || user.securityQuestions.length < 2) {
    await sendTextMessage(
      phoneNumber,
      '⚠️ *No recovery questions found.*\n\n' +
        'You did not set up security questions during account creation.\n\n' +
        '_Please contact support to reset your PIN._',
    )
    return
  }

  user.pendingPinRecovery = {
    step: 1,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
  }
  await user.save()

  const q1 = SECURITY_QUESTION_TEXT[user.securityQuestions[0].questionId] ?? user.securityQuestions[0].questionId
  await sendTextMessage(
    phoneNumber,
    `🔐 *PIN Recovery*\n\n` +
      `Answer your security questions to reset your PIN.\n\n` +
      `*Question 1:* ${q1}\n\n` +
      `_Type your answer below. You have 10 minutes._`,
  )
}

async function handlePinRecoveryAnswer(phoneNumber: string, user: any, answer: string): Promise<void> {
  const recovery = user.pendingPinRecovery

  // Expired — clear and bail
  if (!recovery || recovery.expiresAt <= new Date()) {
    user.pendingPinRecovery = undefined
    await user.save()
    await sendTextMessage(
      phoneNumber,
      '⌛ Recovery session expired. Type *forgot pin* to start again.',
    )
    return
  }

  const questionIndex = recovery.step - 1
  const stored = user.securityQuestions[questionIndex]

  if (!stored) {
    user.pendingPinRecovery = undefined
    await user.save()
    await sendTextMessage(phoneNumber, '❌ Recovery error. Please try again.')
    return
  }

  const isCorrect = await bcrypt.compare(answer.trim().toLowerCase(), stored.answerHash)

  if (!isCorrect) {
    user.pendingPinRecovery = undefined
    await user.save()
    await sendTextMessage(
      phoneNumber,
      '❌ *Incorrect answer.*\n\nRecovery cancelled for security.\n\nType *forgot pin* to try again.',
    )
    return
  }

  if (recovery.step === 1 && user.securityQuestions.length >= 2) {
    user.pendingPinRecovery = {
      step: 2,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    }
    await user.save()

    const q2 = SECURITY_QUESTION_TEXT[user.securityQuestions[1].questionId] ?? user.securityQuestions[1].questionId
    await sendTextMessage(
      phoneNumber,
      `✅ Correct!\n\n*Question 2:* ${q2}`,
    )
    return
  }

  // Both answers correct — clear state and re-launch PIN setup
  user.pendingPinRecovery = undefined
  await user.save()

  await sendTextMessage(
    phoneNumber,
    '✅ *Identity verified!*\n\nYou can now set a new PIN.',
  )
  await FlowLauncherService.launchPinSetupFlow(user)
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
    const { pin, confirm_pin, question_1, answer_1, question_2, answer_2, question_3, answer_3 } = flowData

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

    // Hash and store security question answers (answers normalised to lowercase+trimmed)
    const securityQuestions: { questionId: string; answerHash: string }[] = []
    for (const [qId, ans] of [
      [question_1, answer_1],
      [question_2, answer_2],
      [question_3, answer_3],
    ] as [string, string][]) {
      if (qId && ans?.trim()) {
        securityQuestions.push({
          questionId: qId,
          answerHash: await bcrypt.hash(ans.trim().toLowerCase(), 10),
        })
      }
    }
    user.securityQuestions = securityQuestions

    await user.save()

    console.log(`✅ PIN set up for user ${whatsappId} (normalized: ${pinStr})`)

    await sendTextMessage(
      phoneNumber,
      `✅ *Account Secured!*\n\n` +
        `Your transaction PIN has been set.\n` +
        `You can now send and receive money.\n\n` +
        `· · · · · · · · · ·\n` +
        `_Keep your PIN private and never share it._`,
    )

    await sendMainMenu(phoneNumber, user.username)
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
type ChainId = 'xrpl' | 'bsc' | 'solana'

const CURRENCY_CHAIN: Record<string, ChainId> = {
  XRP:      'xrpl',
  RLUSD:    'xrpl',
  USDC:     'xrpl',
  BNB:      'bsc',
  USDT:     'bsc',
  USDC_BSC: 'bsc',
  SOL:      'solana',
  USDC_SOL: 'solana',
  USDT_SOL: 'solana',
  EURC_SOL: 'solana',
}

function getAddressForChain(user: any, chain: ChainId): string | undefined {
  if (chain === 'xrpl') return user.xrpl_address || user.xrpl_address
  if (chain === 'bsc') return user.evm_address
  if (chain === 'solana') return user.solana_address
  return undefined
}

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

    const chain = CURRENCY_CHAIN[currency] ?? 'xrpl'

    // Resolve recipient address
    let recipientAddress: string
    let recipientPhone: string | undefined

    if (recipient_type === 'Phone Number') {
      const cleanPhone = recipient.replaceAll('+', '').replaceAll(/\s/g, '')
      const recipientUser = await User.findOne({ whatsappId: cleanPhone })

      if (!recipientUser) {
        await sendTextMessage(phoneNumber, '❌ Recipient not found on SendSasa.')
        return
      }

      if (chain === 'xrpl') {
        if (currency === 'RLUSD' && !recipientUser.rlusdTrustLineCreated) {
          await sendTextMessage(phoneNumber, `❌ Recipient doesn't have RLUSD enabled.`)
          return
        }
        if (currency === 'USDC' && !recipientUser.usdcTrustLineCreated) {
          await sendTextMessage(phoneNumber, `❌ Recipient doesn't have USDC enabled.`)
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
      const recipientUser = await User.findOne({ username: recipient.toLowerCase() })

      if (!recipientUser) {
        await sendTextMessage(phoneNumber, '❌ Username not found on SendSasa.')
        return
      }

      if (chain === 'xrpl') {
        if (currency === 'RLUSD' && !recipientUser.rlusdTrustLineCreated) {
          await sendTextMessage(phoneNumber, `❌ Recipient doesn't have RLUSD enabled.`)
          return
        }
        if (currency === 'USDC' && !recipientUser.usdcTrustLineCreated) {
          await sendTextMessage(phoneNumber, `❌ Recipient doesn't have USDC enabled.`)
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
      // Wallet Address — use directly; trust-line checks only apply to XRPL tokens
      recipientAddress = recipient

      if (chain === 'xrpl') {
        if (currency === 'RLUSD') {
          const hasTrustLine = await hasRLUSDTrustLine(recipientAddress)
          if (!hasTrustLine) {
            await sendTextMessage(phoneNumber, `❌ Recipient doesn't have RLUSD trust line.`)
            return
          }
        } else if (currency === 'USDC') {
          const hasTrustLine = await hasUSDCTrustLine(recipientAddress)
          if (!hasTrustLine) {
            await sendTextMessage(phoneNumber, `❌ Recipient doesn't have USDC trust line.`)
            return
          }
        }
      }
    }

    await sendTextMessage(phoneNumber, '_Processing transaction..._')

    const numAmount = Number.parseFloat(amount)
    const senderAddress = getAddressForChain(user, chain) ?? getEffectiveXRPLAddress(user)
    let txHash: string

    if (chain === 'xrpl') {
      const senderKey = await walletService.getPrivateKey(user.phoneNumber)
      let result: { hash: string }
      if (currency === 'XRP') result = await sendXRP(senderKey, recipientAddress, numAmount)
      else if (currency === 'RLUSD') result = await sendRLUSD(senderKey, recipientAddress, numAmount)
      else result = await sendUSDC(senderKey, recipientAddress, numAmount)
      txHash = result.hash
    } else if (chain === 'bsc') {
      const senderKey = await walletService.getPrivateKey(user.phoneNumber)
      let receipt: { hash: string }
      if (currency === 'BNB') {
        receipt = await evmService.transferNative(senderKey, 'bsc', recipientAddress, amount)
      } else if (currency === 'USDT') {
        receipt = await evmService.transferToken(senderKey, 'bsc', 'USDT', recipientAddress, amount)
      } else {
        // USDC_BSC
        receipt = await evmService.transferToken(senderKey, 'bsc', 'USDC', recipientAddress, amount)
      }
      txHash = receipt.hash
    } else {
      // Solana
      const solanaSeed = await walletService.getSolanaPrivateKey(user.phoneNumber)
      let result: { hash: string }
      if (currency === 'USDC_SOL') result = await sendSolanaUSDC(solanaSeed, recipientAddress, numAmount)
      else if (currency === 'USDT_SOL') result = await sendSolanaUSDT(solanaSeed, recipientAddress, numAmount)
      else if (currency === 'EURC_SOL') result = await sendSolanaEURC(solanaSeed, recipientAddress, numAmount)
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
        (b: any) => b.phoneNumber === recipient || b.phoneNumber === recipientPhone,
      )
      if (!alreadySaved) {
        const recipientUser = await User.findOne({ phoneNumber: recipientPhone })
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
 * Handle Request Crypto — Launch request money flow with balances
 */
async function handleRequestCrypto(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found. Please register first.')
      return
    }

    await FlowLauncherService.launchRequestMoneyFlow(user)
    console.log(`✅ Request crypto flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling request crypto:', error)
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}

/**
 * Handle Request by Card — Launch request-card flow
 */
async function handleRequestByCard(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendTextMessage(phoneNumber, '❌ User not found. Please register first.')
      return
    }

    await FlowLauncherService.launchRequestCardFlow(user)
    console.log(`✅ Request by card flow launched for ${phoneNumber}`)
  } catch (error) {
    console.error('❌ Error handling request by card:', error)
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}

/**
 * Handle My Wallet
 */
async function handleMyWallet(phoneNumber: string, user: any): Promise<void> {
  try {
    const balances = await fetchAllBalances(user)
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
      $or: [{ fromAddress: user.xrpl_address }, { toAddress: user.xrpl_address }],
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

      if (index < transactions.length - 1) message += '\n\n· · · · · · · · · ·\n\n'
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
    message += '\n\n· · · · · · · · · ·\n_Tap the approval buttons above to respond._'

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

    const senderKey = await walletService.getPrivateKey(user.phoneNumber)
    let result: any

    if (paymentRequest.currency === 'XRP') {
      result = await sendXRP(
        senderKey,
        requester.xrpl_address,
        paymentRequest.amount,
      )
    } else if (paymentRequest.currency === 'RLUSD') {
      result = await sendRLUSD(
        senderKey,
        requester.xrpl_address,
        paymentRequest.amount,
      )
    } else {
      result = await sendUSDC(
        senderKey,
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

// ── Off-Ramp ──────────────────────────────────────────────────────────────────

/**
 * Handle "Cash Out" menu tap — launch the off-ramp flow.
 */
async function handleOffRamp(
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
async function handleLaunchCardPaymentFlow(
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
async function handleOffRampComplete(
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

    const senderKey = await walletService.getPrivateKey(user.phoneNumber)

    if (isUSDT) {
      const receipt = await evmService.transferToken(
        senderKey, 'bsc', 'USDT', adminAddress, numAmount.toString(),
      )
      cryptoTxHash = receipt.hash
    } else {
      let result: { hash: string }
      if (crypto_currency === 'XRP') {
        result = await sendXRP(senderKey, adminAddress, numAmount)
      } else if (crypto_currency === 'RLUSD') {
        result = await sendRLUSD(senderKey, adminAddress, numAmount)
      } else {
        result = await sendUSDC(senderKey, adminAddress, numAmount)
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

// ── Contacts ──────────────────────────────────────────────────────────────────

async function handleMyContacts(phoneNumber: string, user: any): Promise<void> {
  try {
    await FlowLauncherService.launchManageContactsFlow(user)
  } catch (error) {
    console.error('❌ Error launching manage contacts flow:', error)
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}

async function handleSaveContact(
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
    await sendTextMessage(phoneNumber, '❌ An error occurred. Please try again.')
  }
}
