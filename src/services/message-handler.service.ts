import bcrypt from 'bcrypt'
import {
  sendTextMessage,
  sendConfirmationButtons,
  sendPaymentRequestButtons,
} from './whatsapp.service'
import {
  sendWelcomeMessage,
  sendMainMenu,
  sendWalletMenu,
  sendBackToMenuButton,
  sendRecipientTypeMenu,
  sendCurrencySelectionMenu,
} from './whatsapp-menu.service'
import {
  parseButtonInteraction,
  isXRPLAddress,
  isPhoneNumber,
} from './message-parser.service'
import {
  UserService,
  TransactionService,
  PaymentRequestService,
  MessageLogService,
} from './database.service'
import {
  sendXRP,
  sendRLUSD,
  sendUSDC,
  getAllBalances,
  getHistory,
  getDecryptedSeed,
  hasRLUSDTrustLine,
  hasUSDCTrustLine,
  createRLUSDTrustLine,
  createUSDCTrustLine,
  generateWallet,
  getEncryptedSeed,
} from './xrpl.service'
import { User } from '../models'
import { validateAmount } from '../middleware/validators'
import {
  AppError,
  ValidationError,
  NotFoundError,
  InsufficientFundsError,
} from '../middleware/error-handler'
import { pendingTransactionService } from './pending-transaction.service'
import { flowManager } from './flow-manager.service'
import { usernameService } from './username.service'
import { IUser } from '../types'

/**
 * Handle incoming WhatsApp text messages
 */
export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
  username?: string,
): Promise<void> {
  console.log(`\n📱 Message from ${phoneNumber}: ${messageText}`)

  try {
    await MessageLogService.logIncomingMessage(whatsappId, messageText)

    // ✅ CRITICAL FIX: Check PIN setup flow BEFORE user lookup
    // This ensures PIN entry works even when user doesn't exist yet
    const currentFlow = flowManager.getCurrentFlow(whatsappId)
    if (currentFlow === 'pin_setup') {
      const currentStep = flowManager.getCurrentStep(whatsappId)
      await handlePinSetupFlow(
        whatsappId,
        phoneNumber,
        messageText,
        currentStep!,
        username,
      )
      return
    }

    const user = await UserService.getUserByWhatsAppId(whatsappId)

    // NEW USER: Send welcome (no wallet yet)
    if (!user) {
      await sendWelcomeMessage(phoneNumber)
      await MessageLogService.logOutgoingMessage(
        whatsappId,
        'Welcome message sent',
      )
      return
    }

    // REGISTERED USER: Update last active
    await UserService.updateLastActive(whatsappId)

    // If user is in a multi-step flow, continue it
    if (flowManager.isInFlow(whatsappId)) {
      await handleFlowMessage(whatsappId, phoneNumber, user, messageText)
      return
    }

    // Otherwise show main menu with all 3 balances
    const balances = await getAllBalances(user.xrplAddress)
    await sendMainMenu(phoneNumber, balances.xrp, balances.rlusd, balances.usdc)
    await MessageLogService.logOutgoingMessage(whatsappId, 'Main menu sent')
  } catch (error) {
    console.error('Error handling message:', error)
    const errorMsg =
      error instanceof AppError
        ? error.message
        : `Sorry, there was an error. Please try again.`

    await sendTextMessage(phoneNumber, errorMsg)
    await MessageLogService.logOutgoingMessage(whatsappId, errorMsg)
  }
}

/**
 * Handle button clicks
 */
export async function handleButtonClick(
  whatsappId: string,
  phoneNumber: string,
  buttonId: string,
): Promise<void> {
  console.log(`\n🔘 Button click from ${phoneNumber}: ${buttonId}`)

  try {
    const interaction = parseButtonInteraction(buttonId)

    // Get Started is the only action that doesn't require a registered user
    if (interaction.action === 'get_started') {
      await handleGetStarted(whatsappId, phoneNumber)
      return
    }

    const user = await UserService.getUserByWhatsAppId(whatsappId)

    if (!user) {
      await sendWelcomeMessage(phoneNumber)
      return
    }

    await UserService.updateLastActive(whatsappId)

    switch (interaction.action) {
      case 'main_menu':
        await handleMainMenuAction(whatsappId, phoneNumber, user)
        break

      case 'send_money':
        await sendCurrencySelectionMenu(phoneNumber, 'send')
        await MessageLogService.logOutgoingMessage(
          whatsappId,
          'Currency selection sent',
        )
        break

      case 'currency_send':
        await handleCurrencySend(whatsappId, phoneNumber, interaction.currency!)
        break

      case 'request_money':
        await sendCurrencySelectionMenu(phoneNumber, 'request')
        await MessageLogService.logOutgoingMessage(
          whatsappId,
          'Currency selection sent',
        )
        break

      case 'currency_request':
        await handleCurrencyRequest(
          whatsappId,
          phoneNumber,
          interaction.currency!,
        )
        break

      case 'my_wallet':
        await handleMyWalletAction(whatsappId, phoneNumber, user)
        break

      case 'transaction_history':
        await handleHistoryCommand(whatsappId, phoneNumber, user.xrplAddress)
        break

      case 'pending_requests':
        await handleViewRequestsCommand(
          whatsappId,
          phoneNumber,
          user.xrplAddress,
        )
        break

      case 'amount_selected':
        await handleAmountSelected(whatsappId, phoneNumber, interaction.amount!)
        break

      case 'recipient_type_selected':
        await handleRecipientTypeSelected(
          whatsappId,
          phoneNumber,
          interaction.amount!,
          interaction.recipientType!,
        )
        break

      case 'confirm_send':
        await handleConfirmSend(
          whatsappId,
          phoneNumber,
          user,
          interaction.transactionId!,
        )
        break

      case 'cancel_send':
        await handleCancelSend(
          whatsappId,
          phoneNumber,
          interaction.transactionId!,
        )
        break

      case 'approve':
        await handleApproveRequest(
          whatsappId,
          phoneNumber,
          user,
          interaction.requestId!,
        )
        break

      case 'reject':
        await handleRejectRequest(
          whatsappId,
          phoneNumber,
          interaction.requestId!,
        )
        break

      case 'unknown':
      default:
        const balances = await getAllBalances(user.xrplAddress)
        await sendMainMenu(
          phoneNumber,
          balances.xrp,
          balances.rlusd,
          balances.usdc,
        )
    }
  } catch (error) {
    console.error('Error handling button click:', error)
    const errorMsg =
      error instanceof AppError
        ? error.message
        : `Sorry, there was an error. Please try again.`

    await sendTextMessage(phoneNumber, errorMsg)
    await MessageLogService.logOutgoingMessage(whatsappId, errorMsg)
  }
}

/**
 * Handle Get Started button - Ask for PIN FIRST, then create wallet
 * CORRECT FLOW: PIN → Confirm PIN → Create Wallet
 */
async function handleGetStarted(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  // Check if user already exists
  const existingUser = await UserService.getUserByWhatsAppId(whatsappId)
  if (existingUser) {
    const balances = await getAllBalances(existingUser.xrplAddress)
    await sendMainMenu(phoneNumber, balances.xrp, balances.rlusd, balances.usdc)
    await MessageLogService.logOutgoingMessage(
      whatsappId,
      'Existing user - main menu sent',
    )
    return
  }

  // Start PIN setup flow (BEFORE wallet creation)
  flowManager.startFlow(whatsappId, 'pin_setup', 'enter_pin')

  const msg =
    `Welcome to SendSasa! 👋\n\n` +
    `Let's create your secure wallet.\n\n` +
    `🔐 First, create a 5-digit PIN:\n` +
    `(You'll need this for all transactions)\n\n` +
    `Please enter 5 digits (e.g., 12345):`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, 'PIN setup started')
}

/**
 * Handle Main Menu button
 */
async function handleMainMenuAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const balances = await getAllBalances(user.xrplAddress)
  await sendMainMenu(phoneNumber, balances.xrp, balances.rlusd, balances.usdc)
  await MessageLogService.logOutgoingMessage(whatsappId, 'Main menu sent')
}

/**
 * Handle Currency Send button
 */
async function handleCurrencySend(
  whatsappId: string,
  phoneNumber: string,
  currency: 'XRP' | 'RLUSD' | 'USDC',
): Promise<void> {
  flowManager.startFlow(whatsappId, 'send_money', 'amount')
  flowManager.updateFlowData(whatsappId, { currency })

  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const msg = `${currencyEmoji} Send ${currency}\n\nHow much ${currency} do you want to send?\n\nPlease enter the amount (e.g., 50)`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle Currency Request button
 */
async function handleCurrencyRequest(
  whatsappId: string,
  phoneNumber: string,
  currency: 'XRP' | 'RLUSD' | 'USDC',
): Promise<void> {
  flowManager.startFlow(whatsappId, 'request_money', 'amount')
  flowManager.updateFlowData(whatsappId, { currency })

  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const msg = `${currencyEmoji} Request ${currency}\n\nHow much ${currency} do you want to request?\n\nPlease enter the amount (e.g., 50)`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle My Wallet button
 */
async function handleMyWalletAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const balances = await getAllBalances(user.xrplAddress)

  const msg =
    `💼 Your Wallet\n\n` +
    `🔷 XRP: ${balances.xrp} XRP\n` +
    `💵 RLUSD: ${balances.rlusd} RLUSD\n` +
    `🔵 USDC: ${balances.usdc} USDC\n\n` +
    `Address:\n${user.xrplAddress}`

  await sendTextMessage(phoneNumber, msg)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle amount button selection
 */
async function handleAmountSelected(
  whatsappId: string,
  phoneNumber: string,
  amount: number,
): Promise<void> {
  const flow = flowManager.getFlow(whatsappId)

  if (!flow) {
    const user = await UserService.getUserByWhatsAppId(whatsappId)
    if (user) {
      const balances = await getAllBalances(user.xrplAddress)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
      )
    }
    return
  }

  flowManager.updateFlowData(whatsappId, { amount })
  flowManager.setStep(whatsappId, 'recipient_type')

  await sendRecipientTypeMenu(phoneNumber, amount)
  await MessageLogService.logOutgoingMessage(
    whatsappId,
    'Recipient type selection sent',
  )
}

/**
 * Handle recipient type selection
 */
async function handleRecipientTypeSelected(
  whatsappId: string,
  phoneNumber: string,
  amount: number,
  recipientType: 'phone' | 'address',
): Promise<void> {
  flowManager.updateFlowData(whatsappId, { amount, recipientType })
  flowManager.setStep(whatsappId, 'recipient_input')

  const msg =
    recipientType === 'phone'
      ? `Please enter the recipient's phone number:\n\nExample: +237670123456`
      : `Please enter the recipient's XRP address:\n\nExample: rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle free-text messages during a multi-step flow
 */
async function handleFlowMessage(
  whatsappId: string,
  phoneNumber: string,
  user: IUser | null,
  messageText: string,
): Promise<void> {
  const flow = flowManager.getFlow(whatsappId)

  if (!flow) {
    if (user) {
      const balances = await getAllBalances(user.xrplAddress)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
      )
    }
    return
  }

  if (flow.currentFlow === 'pin_setup') {
    await handlePinSetupFlow(
      whatsappId,
      phoneNumber,
      messageText,
      flow.currentStep!,
    )
  } else if (flow.currentFlow === 'send_money') {
    await handleSendMoneyFlow(
      whatsappId,
      phoneNumber,
      user!,
      messageText,
      flow.currentStep!,
    )
  } else if (flow.currentFlow === 'request_money') {
    await handleRequestMoneyFlow(
      whatsappId,
      phoneNumber,
      user!,
      messageText,
      flow.currentStep!,
    )
  }
}

/**
 * Handle PIN setup flow - CORRECT ORDER: PIN → Confirm → Create Wallet
 */
async function handlePinSetupFlow(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
  currentStep: string,
  username?: string,
): Promise<void> {
  const flowData = flowManager.getFlowData(whatsappId)

  if (currentStep === 'enter_pin') {
    // STEP 1: User enters their PIN
    const pin = messageText.trim()

    // Validate PIN format (5 digits)
    if (!/^\d{5}$/.test(pin)) {
      const msg = `❌ Invalid PIN format.\n\nPlease enter exactly 5 digits (e.g., 12345)`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    // Save PIN temporarily (and username if provided)
    flowManager.updateFlowData(whatsappId, { pin, username })
    flowManager.setStep(whatsappId, 'confirm_pin')

    const msg = `Great! Now confirm your PIN:\n\nPlease enter the same 5 digits again.`
    await sendTextMessage(phoneNumber, msg)
  } else if (currentStep === 'confirm_pin') {
    // STEP 2: User confirms their PIN
    const pin = messageText.trim()
    const originalPin = flowData?.pin
    const savedUsername = flowData?.username || username

    // Check if PINs match
    if (pin !== originalPin) {
      const msg = `❌ PINs don't match!\n\nLet's try again. Enter your 5-digit PIN:`
      await sendTextMessage(phoneNumber, msg)
      flowManager.setStep(whatsappId, 'enter_pin')
      flowManager.updateFlowData(whatsappId, { pin: undefined })
      return
    }

    // STEP 3: PINs match! NOW create the wallet
    await sendTextMessage(
      phoneNumber,
      '✅ PIN confirmed!\n\nCreating your secure wallet...\n\nPlease wait a moment.',
    )

    try {
      // Generate wallet (auto-funded on testnet)
      const wallet = await generateWallet()
      const { address, seed } = wallet

      // Wait for ledger to process funding
      if (process.env.XRPL_NETWORK !== 'mainnet') {
        await new Promise((resolve) => setTimeout(resolve, 2000))
      }

      // Create RLUSD trust line
      let rlusdCreated = false
      let rlusdHash: string | undefined
      try {
        const result = await createRLUSDTrustLine(seed)
        if (result.success) {
          rlusdCreated = true
          rlusdHash = result.hash
          console.log(`✅ RLUSD trust line created (FREE): ${rlusdHash}`)
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
          console.log(`✅ USDC trust line created (FREE): ${usdcHash}`)
        }
      } catch (error) {
        console.error('⚠️ USDC trust line failed (non-critical):', error)
      }

      // Hash the PIN
      const pinHash = await bcrypt.hash(originalPin!, 10)

      // Generate username using username service
      // Priority: WhatsApp name → fallback to phone-based
      const whatsappName = savedUsername || phoneNumber.slice(-8)
      const finalUsername = await usernameService.generateUsername(whatsappName)

      // Create user in database
      const user = new User({
        whatsappId,
        phoneNumber,
        xrplAddress: address,
        encryptedSeed: getEncryptedSeed(seed),
        username: finalUsername, // ✅ Generated from WhatsApp name via usernameService
        pinHash,
        preferredCurrency: 'XRP',
        rlusdTrustLineCreated: rlusdCreated,
        usdcTrustLineCreated: usdcCreated,
        rlusdTrustLineHash: rlusdHash,
        usdcTrustLineHash: usdcHash,
      })

      await user.save()

      // Clear flow
      flowManager.clearFlow(whatsappId)

      console.log(
        `✅ User created: ${whatsappId} | ${address} | ${finalUsername}`,
      )

      // Get balances and show success message
      const balances = await getAllBalances(user.xrplAddress)

      const welcomeMsg =
        `✅ Wallet Created Successfully!\n\n` +
        `🔷 XRP: ${balances.xrp} XRP\n` +
        `💵 RLUSD: ${balances.rlusd} RLUSD\n` +
        `🔵 USDC: ${balances.usdc} USDC\n\n` +
        `Username: ${user.username}\n` +
        `Address: ${address.substring(0, 15)}...\n\n` +
        `Your wallet is secured with your PIN. 🔐`

      await sendTextMessage(phoneNumber, welcomeMsg)
      await sendMainMenu(
        phoneNumber,
        balances.xrp,
        balances.rlusd,
        balances.usdc,
      )
      await MessageLogService.logOutgoingMessage(whatsappId, welcomeMsg)
    } catch (error) {
      // Clear flow on error
      flowManager.clearFlow(whatsappId)

      console.error('Error creating wallet:', error)
      throw new Error('Failed to create wallet. Please try again.')
    }
  }
}

// [Continue with all other handlers - copy from previous file]
// handleSendMoneyFlow, handleRequestMoneyFlow, etc.
// These remain exactly the same...

async function handleSendMoneyFlow(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  messageText: string,
  currentStep: string,
): Promise<void> {
  const flowData = flowManager.getFlowData(whatsappId)
  const currency = flowData?.currency || 'XRP'

  if (currentStep === 'amount') {
    const amount = parseFloat(messageText)

    if (!validateAmount(amount)) {
      const msg = `Invalid amount. Please enter a number between 0.01 and 1,000,000`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const balances = await getAllBalances(user.xrplAddress)
    let sufficient = false
    let balance = '0'

    if (currency === 'XRP') {
      balance = balances.xrp
      sufficient = parseFloat(balance) >= amount + 1
    } else if (currency === 'RLUSD') {
      balance = balances.rlusd
      sufficient = parseFloat(balance) >= amount

      if (!user.rlusdTrustLineCreated) {
        try {
          const seed = getDecryptedSeed(user.encryptedSeed)
          const result = await createRLUSDTrustLine(seed)
          if (result.success) {
            await UserService.updateTrustLineStatus(
              whatsappId,
              'RLUSD',
              result.hash,
            )
            await sendTextMessage(
              phoneNumber,
              '✅ RLUSD trust line created (FREE!)\n\nContinuing...',
            )
          }
        } catch (error) {
          console.error('Error creating RLUSD trust line:', error)
          flowManager.clearFlow(whatsappId)
          await sendTextMessage(
            phoneNumber,
            '❌ Failed to create RLUSD trust line. Please try again.',
          )
          return
        }
      }
    } else if (currency === 'USDC') {
      balance = balances.usdc
      sufficient = parseFloat(balance) >= amount

      if (!user.usdcTrustLineCreated) {
        try {
          const seed = getDecryptedSeed(user.encryptedSeed)
          const result = await createUSDCTrustLine(seed)
          if (result.success) {
            await UserService.updateTrustLineStatus(
              whatsappId,
              'USDC',
              result.hash,
            )
            await sendTextMessage(
              phoneNumber,
              '✅ USDC trust line created (FREE!)\n\nContinuing...',
            )
          }
        } catch (error) {
          console.error('Error creating USDC trust line:', error)
          flowManager.clearFlow(whatsappId)
          await sendTextMessage(
            phoneNumber,
            '❌ Failed to create USDC trust line. Please try again.',
          )
          return
        }
      }
    }

    if (!sufficient) {
      const currencyEmoji =
        currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
      const msg =
        `❌ Insufficient ${currency} balance!\n\n` +
        `You have: ${currencyEmoji} ${balance} ${currency}\n` +
        `Trying to send: ${currencyEmoji} ${amount} ${currency}`

      await sendTextMessage(phoneNumber, msg)
      flowManager.clearFlow(whatsappId)
      return
    }

    flowManager.updateFlowData(whatsappId, { amount })
    flowManager.setStep(whatsappId, 'recipient_input')

    const msg = `Who do you want to send ${amount} ${currency} to?\n\nPlease enter their phone number (+237...) or XRP address (rN7n7...)`
    await sendTextMessage(phoneNumber, msg)
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    if (!isPhoneNumber(recipient) && !isXRPLAddress(recipient)) {
      const msg = `Invalid format. Please enter a valid phone number (+237...) or XRP address (rN7n7...)`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const amount = flowData!.amount!
    flowManager.clearFlow(whatsappId)

    await handleSendCommand(
      whatsappId,
      phoneNumber,
      user,
      recipient,
      amount,
      currency,
    )
  }
}

async function handleRequestMoneyFlow(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  messageText: string,
  currentStep: string,
): Promise<void> {
  const flowData = flowManager.getFlowData(whatsappId)
  const currency = flowData?.currency || 'XRP'

  if (currentStep === 'amount') {
    const amount = parseFloat(messageText)

    if (!validateAmount(amount)) {
      const msg = `Invalid amount. Please enter a number between 0.01 and 1,000,000`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    flowManager.updateFlowData(whatsappId, { amount })
    flowManager.setStep(whatsappId, 'recipient_input')

    const currencyEmoji =
      currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
    const msg = `${currencyEmoji} Who do you want to request ${amount} ${currency} from?\n\nPlease enter their phone number (+237...) or XRP address (rN7n7...)`
    await sendTextMessage(phoneNumber, msg)
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    if (!isPhoneNumber(recipient) && !isXRPLAddress(recipient)) {
      const msg = `Invalid format. Please enter a valid phone number or XRP address`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const amount = flowData!.amount!
    flowManager.clearFlow(whatsappId)

    await handleRequestCommand(
      whatsappId,
      phoneNumber,
      user,
      recipient,
      amount,
      currency,
    )
  }
}

async function handleHistoryCommand(
  whatsappId: string,
  phoneNumber: string,
  address: string,
): Promise<void> {
  try {
    const history = await getHistory(address)

    if (!history || history.length === 0) {
      const msg = `📊 Transaction History\n\nNo transactions found.`
      await sendBackToMenuButton(phoneNumber, msg)
      await MessageLogService.logOutgoingMessage(whatsappId, msg)
      return
    }

    let message = `📊 Recent Transactions\n\n`

    history.slice(0, 5).forEach((tx: any, index: number) => {
      try {
        const txData = tx.tx
        if (!txData) return

        // Determine transaction type and amount
        let amount = 'Unknown'
        let currency = 'XRP'

        if (typeof txData.Amount === 'string') {
          // XRP transaction (in drops)
          const drops = parseInt(txData.Amount)
          amount = (drops / 1000000).toString()
          currency = 'XRP'
        } else if (typeof txData.Amount === 'object' && txData.Amount.value) {
          // Token/Stablecoin transaction
          amount = txData.Amount.value
          currency = txData.Amount.currency || 'Unknown'

          // Convert hex currency codes to readable names
          if (currency === '524C555344000000000000000000000000000000') {
            currency = 'RLUSD'
          } else if (currency === '5553444300000000000000000000000000000000') {
            currency = 'USDC'
          }
        }

        // Format date
        const date = txData.date
          ? new Date((txData.date + 946684800) * 1000).toLocaleDateString()
          : 'Unknown date'

        // Determine direction
        const isSent = txData.Account === address
        const direction = isSent ? '🔴 SENT' : '🟢 RECEIVED'

        // Add to message
        message += `${index + 1}. ${direction}\n`
        message += `   Amount: ${amount} ${currency}\n`
        message += `   Date: ${date}\n`
        if (txData.hash) {
          message += `   Hash: ${txData.hash.substring(0, 16)}...\n`
        }
        message += `\n`
      } catch (err) {
        console.error('Error parsing transaction:', err)
        // Skip malformed transactions
      }
    })

    await sendTextMessage(phoneNumber, message)
    await sendWalletMenu(phoneNumber)
    await MessageLogService.logOutgoingMessage(whatsappId, message)
  } catch (error) {
    console.error('Error in handleHistoryCommand:', error)
    const msg = `❌ Error loading transaction history.\n\nPlease try again.`
    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
  }
}

async function handleSendCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  recipient: string,
  amount: number,
  currency: 'XRP' | 'RLUSD' | 'USDC',
): Promise<void> {
  if (!validateAmount(amount)) {
    throw new ValidationError(
      `Invalid amount. Please send between 0.01 and 1,000,000 ${currency}.`,
    )
  }

  const balances = await getAllBalances(user.xrplAddress)
  let currentBalance = 0

  if (currency === 'XRP') {
    currentBalance = parseFloat(balances.xrp)
    if (currentBalance < amount + 1) {
      throw new InsufficientFundsError(
        `Insufficient funds. Your ${currency} balance: ${balances.xrp} ${currency}`,
      )
    }
  } else if (currency === 'RLUSD') {
    currentBalance = parseFloat(balances.rlusd)
    if (currentBalance < amount) {
      throw new InsufficientFundsError(
        `Insufficient funds. Your ${currency} balance: ${balances.rlusd} ${currency}`,
      )
    }
  } else if (currency === 'USDC') {
    currentBalance = parseFloat(balances.usdc)
    if (currentBalance < amount) {
      throw new InsufficientFundsError(
        `Insufficient funds. Your ${currency} balance: ${balances.usdc} ${currency}`,
      )
    }
  }

  let recipientAddress: string
  let recipientDisplay: string
  let recipientPhone: string | undefined

  if (isXRPLAddress(recipient)) {
    recipientAddress = recipient
    recipientDisplay = recipient.substring(0, 10) + '...'

    if (currency === 'RLUSD') {
      const hasTrustLine = await hasRLUSDTrustLine(recipientAddress)
      if (!hasTrustLine) {
        throw new ValidationError(
          `Recipient doesn't have RLUSD trust line!\n\nThey cannot receive RLUSD.`,
        )
      }
    } else if (currency === 'USDC') {
      const hasTrustLine = await hasUSDCTrustLine(recipientAddress)
      if (!hasTrustLine) {
        throw new ValidationError(
          `Recipient doesn't have USDC trust line!\n\nThey cannot receive USDC.`,
        )
      }
    }
  } else if (isPhoneNumber(recipient)) {
    const recipientUser = await UserService.getUserByPhone(recipient)
    if (!recipientUser?.xrplAddress) {
      throw new NotFoundError(
        `Recipient ${recipient} not found.\n\nThey need to register with SendSasa first.`,
      )
    }
    recipientAddress = recipientUser.xrplAddress
    recipientDisplay = recipient
    recipientPhone = recipient

    if (currency === 'RLUSD' && !recipientUser.rlusdTrustLineCreated) {
      throw new ValidationError(
        `Recipient doesn't have RLUSD enabled!\n\nThey need to send/request RLUSD first.`,
      )
    } else if (currency === 'USDC' && !recipientUser.usdcTrustLineCreated) {
      throw new ValidationError(
        `Recipient doesn't have USDC enabled!\n\nThey need to send/request USDC first.`,
      )
    }
  } else {
    throw new ValidationError(
      `Invalid recipient format.\n\nUse a phone number (+237...) or XRP address (rN7n7...).`,
    )
  }

  const transactionId = `${Date.now()}_${Math.random().toString(36).substring(7)}`

  pendingTransactionService.store(transactionId, {
    whatsappId,
    phoneNumber,
    senderAddress: user.xrplAddress,
    recipientAddress,
    recipientDisplay,
    recipientPhone,
    amount,
    currency,
    timestamp: new Date(),
  })

  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const confirmMsg =
    `💸 Confirm Payment\n\n` +
    `Amount: ${currencyEmoji} ${amount} ${currency}\n` +
    `To: ${recipientDisplay}\n\n` +
    `Please confirm this transaction:`

  await sendConfirmationButtons(
    phoneNumber,
    confirmMsg,
    `confirm_send_${transactionId}`,
    `cancel_send_${transactionId}`,
  )
  await MessageLogService.logOutgoingMessage(whatsappId, confirmMsg)
}

async function handleRequestCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  recipient: string,
  amount: number,
  currency: 'XRP' | 'RLUSD' | 'USDC',
): Promise<void> {
  if (!validateAmount(amount)) {
    throw new ValidationError(
      `Invalid amount. Please request between 0.01 and 1,000,000 ${currency}.`,
    )
  }

  let payerAddress: string
  let payerPhone: string

  if (isPhoneNumber(recipient)) {
    const payerUser = await UserService.getUserByPhone(recipient)
    if (!payerUser?.xrplAddress) {
      throw new NotFoundError(
        `Recipient ${recipient} not found.\n\nThey need to register with SendSasa first.`,
      )
    }
    payerAddress = payerUser.xrplAddress
    payerPhone = recipient
  } else if (isXRPLAddress(recipient)) {
    const payerUser = await UserService.getUserByAddress(recipient)
    if (!payerUser) {
      throw new NotFoundError(
        `User with address ${recipient} not found.\n\nThey need to register with SendSasa first.`,
      )
    }
    payerAddress = recipient
    payerPhone = payerUser.phoneNumber
  } else {
    throw new ValidationError(
      `Invalid recipient format.\n\nUse a phone number (+237...) or XRP address (rN7n7...).`,
    )
  }

  const request = await PaymentRequestService.createPaymentRequest(
    user.xrplAddress,
    user.phoneNumber,
    payerAddress,
    payerPhone,
    amount,
    currency,
  )

  await sendPaymentRequestButtons(
    payerPhone,
    user.phoneNumber,
    amount,
    request.requestId,
  )

  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const confirmMsg =
    `✅ Payment Request Sent!\n\n` +
    `To: ${payerPhone}\n` +
    `Amount: ${currencyEmoji} ${amount} ${currency}\n` +
    `Request ID: ${request.requestId}\n\n` +
    `You'll be notified when they respond.`

  await sendBackToMenuButton(phoneNumber, confirmMsg)
  await MessageLogService.logOutgoingMessage(whatsappId, confirmMsg)
}

async function handleViewRequestsCommand(
  whatsappId: string,
  phoneNumber: string,
  address: string,
): Promise<void> {
  const pendingRequests =
    await PaymentRequestService.getPendingRequestsForPayer(address)

  if (pendingRequests.length === 0) {
    const msg = `📋 Payment Requests\n\nNo pending requests.`
    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  let message = `📋 Pending Payment Requests\n\n`

  pendingRequests.forEach((req, index) => {
    const currencyEmoji =
      req.currency === 'XRP' ? '🔷' : req.currency === 'RLUSD' ? '💵' : '🔵'
    message += `${index + 1}. ${currencyEmoji} ${req.amount} ${req.currency}\n`
    message += `   From: ${req.requesterPhone}\n`
    message += `   Message: ${req.message || 'No message'}\n`
    message += `   Expires: ${new Date(req.expiresAt).toLocaleDateString()}\n\n`
  })

  await sendTextMessage(phoneNumber, message)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, message)
}

async function handleApproveRequest(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  requestId: string,
): Promise<void> {
  const request = await PaymentRequestService.getPaymentRequestById(requestId)
  if (!request) {
    throw new NotFoundError('Payment request not found or expired.')
  }

  if (request.status !== 'pending') {
    throw new ValidationError(`Request already ${request.status}.`)
  }

  if (request.payerAddress !== user.xrplAddress) {
    throw new ValidationError('This request is not for you.')
  }

  const currency = request.currency
  const balances = await getAllBalances(user.xrplAddress)
  let sufficient = false

  if (currency === 'XRP') {
    sufficient = parseFloat(balances.xrp) >= request.amount + 1
  } else if (currency === 'RLUSD') {
    sufficient = parseFloat(balances.rlusd) >= request.amount
  } else if (currency === 'USDC') {
    sufficient = parseFloat(balances.usdc) >= request.amount
  }

  if (!sufficient) {
    await PaymentRequestService.failPaymentRequest(requestId)
    throw new InsufficientFundsError(`Insufficient ${currency} funds.`)
  }

  const senderSeed = getDecryptedSeed(user.encryptedSeed)
  let result: any

  if (currency === 'XRP') {
    result = await sendXRP(senderSeed, request.requesterAddress, request.amount)
  } else if (currency === 'RLUSD') {
    result = await sendRLUSD(
      senderSeed,
      request.requesterAddress,
      request.amount,
    )
  } else if (currency === 'USDC') {
    result = await sendUSDC(
      senderSeed,
      request.requesterAddress,
      request.amount,
    )
  }

  await PaymentRequestService.approvePaymentRequest(requestId, result.hash)
  await TransactionService.logTransaction(
    result.hash,
    user.xrplAddress,
    request.requesterAddress,
    request.amount,
    currency,
    'success',
    user.phoneNumber,
    request.requesterPhone,
  )

  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const payerMsg =
    `✅ Payment Sent!\n\n` +
    `Amount: ${currencyEmoji} ${request.amount} ${currency}\n` +
    `To: ${request.requesterPhone}\n` +
    `TX Hash: ${result.hash}\n\n` +
    `View on explorer:\n` +
    `https://testnet.xrpl.org/transactions/${result.hash}`

  await sendBackToMenuButton(phoneNumber, payerMsg)
  await MessageLogService.logOutgoingMessage(whatsappId, payerMsg)

  const requesterMsg =
    `✅ Payment Received!\n\n` +
    `Amount: ${currencyEmoji} ${request.amount} ${currency}\n` +
    `From: ${user.phoneNumber}\n` +
    `TX Hash: ${result.hash}`

  await sendTextMessage(request.requesterPhone, requesterMsg)
}

async function handleRejectRequest(
  whatsappId: string,
  phoneNumber: string,
  requestId: string,
): Promise<void> {
  const request = await PaymentRequestService.getPaymentRequestById(requestId)
  if (!request) {
    throw new NotFoundError('Payment request not found or expired.')
  }

  await PaymentRequestService.rejectPaymentRequest(requestId)

  const msg =
    `❌ Payment Request Rejected\n\n` +
    `Amount: ${request.amount} ${request.currency}\n` +
    `From: ${request.requesterPhone}`

  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)

  const requesterMsg =
    `❌ Payment Request Rejected\n\n` +
    `Amount: ${request.amount} ${request.currency}\n` +
    `By: ${phoneNumber}`

  await sendTextMessage(request.requesterPhone, requesterMsg)
}

async function handleConfirmSend(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  transactionId: string,
): Promise<void> {
  const pendingTx = pendingTransactionService.get(transactionId)

  if (!pendingTx) {
    throw new NotFoundError(
      'Transaction not found or expired.\n\nPlease try sending again.',
    )
  }

  if (pendingTx.whatsappId !== whatsappId) {
    throw new ValidationError('This transaction is not for you.')
  }

  const currency = pendingTx.currency || 'XRP'
  const balances = await getAllBalances(user.xrplAddress)
  let sufficient = false

  if (currency === 'XRP') {
    sufficient = parseFloat(balances.xrp) >= pendingTx.amount + 1
  } else if (currency === 'RLUSD') {
    sufficient = parseFloat(balances.rlusd) >= pendingTx.amount
  } else if (currency === 'USDC') {
    sufficient = parseFloat(balances.usdc) >= pendingTx.amount
  }

  if (!sufficient) {
    pendingTransactionService.delete(transactionId)
    throw new InsufficientFundsError(`Insufficient ${currency} funds.`)
  }

  try {
    const senderSeed = getDecryptedSeed(user.encryptedSeed)
    let result: any

    if (currency === 'XRP') {
      result = await sendXRP(
        senderSeed,
        pendingTx.recipientAddress,
        pendingTx.amount,
      )
    } else if (currency === 'RLUSD') {
      result = await sendRLUSD(
        senderSeed,
        pendingTx.recipientAddress,
        pendingTx.amount,
      )
    } else if (currency === 'USDC') {
      result = await sendUSDC(
        senderSeed,
        pendingTx.recipientAddress,
        pendingTx.amount,
      )
    }

    await TransactionService.logTransaction(
      result.hash,
      pendingTx.senderAddress,
      pendingTx.recipientAddress,
      pendingTx.amount,
      currency,
      'success',
      pendingTx.phoneNumber,
      pendingTx.recipientPhone,
    )

    const currencyEmoji =
      currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
    const msg =
      `✅ Payment Successful!\n\n` +
      `Sent: ${currencyEmoji} ${pendingTx.amount} ${currency}\n` +
      `To: ${pendingTx.recipientDisplay}\n` +
      `TX Hash: ${result.hash}\n\n` +
      `View on explorer:\n` +
      `https://testnet.xrpl.org/transactions/${result.hash}`

    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)

    if (pendingTx.recipientPhone) {
      const recipientMsg =
        `✅ Payment Received!\n\n` +
        `Amount: ${currencyEmoji} ${pendingTx.amount} ${currency}\n` +
        `From: ${pendingTx.phoneNumber}\n` +
        `TX Hash: ${result.hash}`
      await sendTextMessage(pendingTx.recipientPhone, recipientMsg)
    }

    pendingTransactionService.delete(transactionId)
  } catch (error) {
    pendingTransactionService.delete(transactionId)
    throw error
  }
}

async function handleCancelSend(
  whatsappId: string,
  phoneNumber: string,
  transactionId: string,
): Promise<void> {
  const pendingTx = pendingTransactionService.get(transactionId)

  if (!pendingTx) {
    const msg = '⚠️ Transaction already expired or cancelled.'
    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  if (pendingTx.whatsappId !== whatsappId) {
    throw new ValidationError('This transaction is not for you.')
  }

  pendingTransactionService.delete(transactionId)

  const currency = pendingTx.currency || 'XRP'
  const currencyEmoji =
    currency === 'XRP' ? '🔷' : currency === 'RLUSD' ? '💵' : '🔵'
  const msg =
    `❌ Payment Cancelled\n\n` +
    `Amount: ${currencyEmoji} ${pendingTx.amount} ${currency}\n` +
    `To: ${pendingTx.recipientDisplay}`

  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}
