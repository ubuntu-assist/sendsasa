import bcrypt from 'bcrypt'
import { User } from '@models/User'
import { FlowLauncherService } from '@messaging/flow/flow-launcher.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import {
  sendWelcomeMessage,
  sendMainMenu,
  sendFundingMessage,
} from '@messaging/whatsapp/whatsapp-menu.service'
import {
  createRLUSDTrustLine,
  createUSDCTrustLine,
  isAccountActivated,
} from '@blockchain/chains/xrpl.service'
import { walletService } from '@blockchain/chains/wallet.service'
import { normalizeToE164 } from '@shared/phone-number.service'
import { usernameService } from '@shared/username.service'
import config from '@common/utils/config'
import type { IUser } from '@app/types'

// ── Local helper (shared in orchestrator, copied here to avoid circular dep) ──

function normalizePin(pin: string | number): string {
  return Number.parseInt(pin.toString(), 10).toString()
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const SECURITY_QUESTION_TEXT: Record<string, string> = {
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

// ── Handlers ──────────────────────────────────────────────────────────────────

/**
 * Handle Get Started — Create new wallet and onboard user
 *
 * On mainnet: generate wallet, save to DB, send funding instructions.
 *             Trust lines and PIN setup deferred until account is funded.
 * On testnet: fund wallet automatically, create trust lines, launch PIN setup.
 */
export async function handleGetStarted(
  whatsappId: string,
  phoneNumber: string,
  profileName?: string,
): Promise<void> {
  try {
    let user = await User.findOne({ whatsappId })

    if (user) {
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
      xrpl_address: address || undefined,
      evm_address: evmAddress,
      solana_address: solanaAddress,
      web3auth_verifier_id: e164Phone,
      wallet_created_at: new Date(),
    }

    if (config.XRPL_NETWORK !== 'mainnet') {
      user = await User.create({
        whatsappId,
        phoneNumber: e164Phone,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        pinSetupComplete: false,
        username,
        ...web3authFields,
      })

      console.log(`✅ New testnet user created: ${whatsappId} (${username})`)
      await FlowLauncherService.launchPinSetupFlow(user)
    } else {
      // Mainnet — wallet not yet on ledger, defer trust lines and PIN setup
      const newUser = await User.create({
        whatsappId,
        phoneNumber: e164Phone,
        pinHash: defaultPinHash,
        pinAttempts: 0,
        pinSetupComplete: false,
        username,
        rlusdTrustLineCreated: false,
        usdcTrustLineCreated: false,
        ...web3authFields,
      })

      if (address) {
        await sendFundingMessage(phoneNumber, address)
      } else {
        await FlowLauncherService.launchPinSetupFlow(newUser)
      }
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
export async function handleImportWallet(
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
export async function handleWalletImportComplete(
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

    // Get XRPL wallet for trust line setup
    const e164Phone = normalizeToE164(phoneNumber)
    const xrplWallet = await walletService.getXRPLWallet(e164Phone)

    // Create RLUSD trust line
    let rlusdCreated = false
    let rlusdHash: string | undefined
    try {
      const result = await createRLUSDTrustLine(xrplWallet)
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
      const result = await createUSDCTrustLine(xrplWallet)
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
      pinSetupComplete: false,
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
export async function handleCheckActivation(
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

    // Create RLUSD and/or USDC trust lines if not already created
    let rlusdCreated = user.rlusdTrustLineCreated
    let rlusdHash = user.rlusdTrustLineHash
    let usdcCreated = user.usdcTrustLineCreated
    let usdcHash = user.usdcTrustLineHash

    if (!rlusdCreated || !usdcCreated) {
      let xrplWallet: Awaited<ReturnType<typeof walletService.getXRPLWallet>> | undefined
      try {
        xrplWallet = await walletService.getXRPLWallet(user.phoneNumber)
      } catch (error) {
        console.error('⚠️ Failed to retrieve XRPL wallet for trust line setup:', error)
      }

      if (xrplWallet && !rlusdCreated) {
        try {
          const result = await createRLUSDTrustLine(xrplWallet)
          if (result.success) {
            rlusdCreated = true
            rlusdHash = result.hash
            console.log(`✅ RLUSD trust line created: ${rlusdHash}`)
          }
        } catch (error) {
          console.error('⚠️ RLUSD trust line failed:', error)
        }
      }

      if (xrplWallet && !usdcCreated) {
        try {
          const result = await createUSDCTrustLine(xrplWallet)
          if (result.success) {
            usdcCreated = true
            usdcHash = result.hash
            console.log(`✅ USDC trust line created: ${usdcHash}`)
          }
        } catch (error) {
          console.error('⚠️ USDC trust line failed:', error)
        }
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

export async function handleForgotPin(phoneNumber: string, user: any): Promise<void> {
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

export async function handlePinRecoveryAnswer(phoneNumber: string, user: any, answer: string): Promise<void> {
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
export async function handlePinSetupComplete(
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
    user.pinSetupComplete = true

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

    const operatingRegion = flowData.operating_region as IUser['operatingRegion']
    if (operatingRegion) {
      user.operatingRegion = operatingRegion
    }

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
