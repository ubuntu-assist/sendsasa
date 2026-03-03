import { sendTextMessage, sendPaymentRequestButtons } from './whatsapp.service'
import {
  sendWelcomeMessage,
  sendMainMenu,
  sendWalletMenu,
  sendBackToMenuButton,
  sendWalletSettingsMenu,
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
  getBalance,
  getHistory,
  getDecryptedSeed,
} from './xrpl.service'
import { validateAmount } from '../middleware/validators'
import {
  AppError,
  ValidationError,
  NotFoundError,
  InsufficientFundsError,
} from '../middleware/error-handler'
import { pendingTransactionService } from './pending-transaction.service'
import { flowManager } from './flow-manager.service'
import { pinVerificationService } from './pin-verification.service'
import { usernameService } from './username.service'
import { IUser } from '../types'

// PIN Setup Flow State
interface PINSetupFlow {
  step: 'initial' | 'confirm'
  pin?: string
  username?: string
}

const pinSetupFlows = new Map<string, PINSetupFlow>()

// Change PIN Flow State
interface ChangePINFlow {
  step: 'old_pin' | 'new_pin' | 'confirm_new'
  oldPin?: string
  newPin?: string
}

const changePINFlows = new Map<string, ChangePINFlow>()

// Forgot PIN Flow State
interface ForgotPINFlow {
  step: 'code_sent' | 'verify_code' | 'new_pin' | 'confirm_new'
  code?: string
  newPin?: string
}

const forgotPINFlows = new Map<string, ForgotPINFlow>()

// Transaction PIN Verification State
interface TransactionPINData {
  amount: number
  recipientAddress: string
  recipientDisplay: string
  recipientPhone?: string
}

const transactionPINs = new Map<string, TransactionPINData>()

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

    const user = await UserService.getUserByWhatsAppId(whatsappId)

    // Check if in approve request flow (waiting for PIN)
    if (approveRequestFlows.has(whatsappId)) {
      await handleApproveRequestPIN(whatsappId, phoneNumber, user!, messageText)
      return
    }

    // Check if in change PIN flow
    if (changePINFlows.has(whatsappId)) {
      await handleChangePINFlow(whatsappId, phoneNumber, messageText)
      return
    }

    // Check if in forgot PIN flow
    if (forgotPINFlows.has(whatsappId)) {
      await handleForgotPINFlow(whatsappId, phoneNumber, messageText)
      return
    }

    // Check if in PIN setup flow (wallet creation)
    if (pinSetupFlows.has(whatsappId)) {
      await handlePINSetup(whatsappId, phoneNumber, messageText, username)
      return
    }

    // NEW USER: Send welcome (no wallet yet)
    if (!user) {
      await sendWelcomeMessage(phoneNumber, username)
      await MessageLogService.logOutgoingMessage(
        whatsappId,
        'Welcome message sent',
      )
      return
    }

    // EXISTING USER WITHOUT PIN: Force PIN setup
    if (!user.pinHash) {
      await handleMigrationPINSetup(whatsappId, phoneNumber, user)
      return
    }

    // REGISTERED USER: Update last active
    await UserService.updateLastActive(whatsappId)

    // Check if in a flow
    if (flowManager.isInFlow(whatsappId)) {
      await handleFlowMessage(whatsappId, phoneNumber, user, messageText)
      return
    }

    // Otherwise show main menu
    const balance = await getBalance(user.xrplAddress)
    await sendMainMenu(phoneNumber, balance.balance)
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
 * Handle PIN setup during wallet creation
 */
async function handlePINSetup(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
  username?: string,
): Promise<void> {
  const flow = pinSetupFlows.get(whatsappId)
  if (!flow) return

  if (flow.step === 'initial') {
    // Validate PIN format
    try {
      pinVerificationService.validatePINFormat(messageText)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid PIN format'
      await sendTextMessage(phoneNumber, msg + '\n\nPlease try again:')
      return
    }

    // Store PIN and ask for confirmation
    flow.pin = messageText
    flow.step = 'confirm'
    flow.username = username
    pinSetupFlows.set(whatsappId, flow)

    await sendTextMessage(phoneNumber, `Confirm your PIN by entering it again:`)
  } else if (flow.step === 'confirm') {
    // Check if PINs match
    if (messageText !== flow.pin) {
      await sendTextMessage(
        phoneNumber,
        `❌ PINs don't match.\n\nLet's start over. Enter your 5-digit PIN:`,
      )
      flow.step = 'initial'
      flow.pin = undefined
      pinSetupFlows.set(whatsappId, flow)
      return
    }

    // Create wallet with PIN
    try {
      const newUser = await UserService.createUser(
        whatsappId,
        phoneNumber,
        flow.pin,
        flow.username,
      )

      pinSetupFlows.delete(whatsappId)

      const msg =
        `✅ PIN Set Successfully!\n\n` +
        `Your secure XRP wallet has been created!\n\n` +
        `Username: ${newUser.username}\n` +
        `Address: ${newUser.xrplAddress}\n` +
        `Balance: 1000 XRP (Testnet)\n\n` +
        `You can now send and receive XRP securely!`

      await sendBackToMenuButton(phoneNumber, msg)
      await MessageLogService.logOutgoingMessage(whatsappId, msg)
    } catch (error) {
      pinSetupFlows.delete(whatsappId)
      throw error
    }
  }
}

/**
 * Handle migration PIN setup for existing users without PIN
 */
async function handleMigrationPINSetup(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  if (!pinSetupFlows.has(whatsappId)) {
    // First time - explain and start flow
    pinSetupFlows.set(whatsappId, { step: 'initial', username: user.username })

    const msg =
      `🔐 Security Update Required\n\n` +
      `SendSasa now requires a 5-digit PIN to protect your wallet.\n\n` +
      `⚠️ Important:\n` +
      `• Don't share your PIN with anyone\n` +
      `• Don't use obvious PINs (00000, 12345)\n` +
      `• Store it safely - you'll need it for every transaction\n\n` +
      `Please enter your 5-digit PIN:`

    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
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
      throw new NotFoundError('Please click Get Started first.')
    }

    // Check if user has PIN (migration case)
    if (!user.pinHash) {
      await handleMigrationPINSetup(whatsappId, phoneNumber, user)
      return
    }

    switch (interaction.action) {
      case 'main_menu':
        await handleMainMenuAction(whatsappId, phoneNumber, user)
        break

      case 'send_money':
        await handleSendMoneyAction(whatsappId, phoneNumber)
        break

      case 'request_money':
        await handleRequestMoneyAction(whatsappId, phoneNumber)
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

      // NEW CASES - ADD HERE
      case 'wallet_settings':
        await handleWalletSettingsAction(whatsappId, phoneNumber)
        break

      case 'change_pin':
        await handleChangePIN(whatsappId, phoneNumber)
        break

      case 'change_username':
        await handleChangeUsernameAction(whatsappId, phoneNumber, user)
        break
      // END NEW CASES

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

      default:
        throw new ValidationError('Unknown action')
    }
  } catch (error) {
    console.error('Error handling button:', error)
    const errorMsg =
      error instanceof AppError
        ? error.message
        : `Error processing button click`

    await sendTextMessage(phoneNumber, errorMsg)
  }
}

/**
 * Handle Get Started button - starts PIN setup
 */
async function handleGetStarted(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  // Start PIN setup flow
  pinSetupFlows.set(whatsappId, { step: 'initial' })

  const msg =
    `Let's create your secure wallet! 🔐\n\n` +
    `First, choose a 5-digit PIN to protect your transactions.\n\n` +
    `⚠️ Important:\n` +
    `• Don't share your PIN with anyone\n` +
    `• Don't use obvious PINs (00000, 12345)\n` +
    `• Store it safely - you'll need it for every transaction\n\n` +
    `Please enter your 5-digit PIN:`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle Main Menu button
 */
async function handleMainMenuAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const balance = await getBalance(user.xrplAddress)
  await sendMainMenu(phoneNumber, balance.balance)
  await MessageLogService.logOutgoingMessage(whatsappId, 'Main menu sent')
}

/**
 * Handle Send Money button
 */
async function handleSendMoneyAction(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  flowManager.startFlow(whatsappId, 'send_money', 'amount')

  const msg =
    'How much XRP do you want to send?\n\nPlease enter the amount (e.g., 50)'
  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle Request Money button
 */
async function handleRequestMoneyAction(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  flowManager.startFlow(whatsappId, 'request_money', 'amount')

  const msg =
    'How much XRP do you want to request?\n\nPlease enter the amount (e.g., 50)'
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
  const balance = await getBalance(user.xrplAddress)

  const msg =
    `💼 Your Wallet\n\n` +
    `Username: ${user.username}\n` +
    `Balance: ${balance.balance} XRP\n\n` +
    `Phone: ${user.phoneNumber}\n\n` +
    `Address:\n${user.xrplAddress}`

  await sendTextMessage(phoneNumber, msg)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle flow messages (multi-step conversations)
 */
async function handleFlowMessage(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  messageText: string,
): Promise<void> {
  const flow = flowManager.getFlow(whatsappId)

  if (!flow) {
    const balance = await getBalance(user.xrplAddress)
    await sendMainMenu(phoneNumber, balance.balance)
    return
  }

  if (flow.currentFlow === 'send_money') {
    await handleSendMoneyFlow(
      whatsappId,
      phoneNumber,
      user,
      messageText,
      flow.currentStep!,
    )
  } else if (flow.currentFlow === 'request_money') {
    await handleRequestMoneyFlow(
      whatsappId,
      phoneNumber,
      user,
      messageText,
      flow.currentStep!,
    )
  }
}

/**
 * Handle send money flow steps
 */
async function handleSendMoneyFlow(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  messageText: string,
  currentStep: string,
): Promise<void> {
  if (currentStep === 'amount') {
    const amount = Number.parseFloat(messageText)

    if (!validateAmount(amount)) {
      const msg = `Invalid amount. Please enter a number between 0.01 and 1,000,000`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    flowManager.updateFlowData(whatsappId, { amount })
    flowManager.setStep(whatsappId, 'recipient_input')

    // Skip recipient type selection - accept all formats
    const msg =
      `Who do you want to send ${amount} XRP to?\n\n` +
      `You can enter:\n` +
      `• Phone: +237670123456\n` +
      `• Username: @marie.sasa\n` +
      `• Address: rN7n7...`

    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    // Validate recipient format (phone, username, or address)
    if (
      !isPhoneNumber(recipient) &&
      !isXRPLAddress(recipient) &&
      !usernameService.isUsername(recipient)
    ) {
      const msg =
        `Invalid format. Please enter:\n\n` +
        `• Phone: +237670123456\n` +
        `• Username: @marie.sasa\n` +
        `• Address: rN7n7...`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const flowData = flowManager.getFlowData(whatsappId)

    // Resolve recipient
    let recipientAddress: string
    let recipientDisplay: string
    let recipientPhone: string | undefined

    if (usernameService.isUsername(recipient)) {
      // Username lookup
      const recipientUser = await usernameService.getUserByUsername(recipient)

      if (!recipientUser) {
        throw new NotFoundError(`Username ${recipient} not found`)
      }

      recipientAddress = recipientUser.xrplAddress
      recipientDisplay = recipient
      recipientPhone = recipientUser.phoneNumber
    } else if (isPhoneNumber(recipient)) {
      // Phone lookup
      const recipientUser = await UserService.getUserByPhone(recipient)

      if (!recipientUser?.xrplAddress) {
        throw new NotFoundError(
          `Recipient ${recipient} not found.\n\nThey need to register with SendSasa first.`,
        )
      }

      recipientAddress = recipientUser.xrplAddress
      recipientDisplay = `${recipient} (${recipientUser.username})`
      recipientPhone = recipient
    } else if (isXRPLAddress(recipient)) {
      // Direct address
      recipientAddress = recipient
      recipientDisplay = recipient.substring(0, 10) + '...'
      recipientPhone = undefined
    } else {
      throw new ValidationError('Invalid recipient format')
    }

    // Ask for PIN before sending
    flowManager.setStep(whatsappId, 'pin_verification')

    // Store transaction details temporarily
    transactionPINs.set(whatsappId, {
      amount: flowData!.amount!,
      recipientAddress,
      recipientDisplay,
      recipientPhone,
    })

    const msg =
      `💸 Confirm Payment\n\n` +
      `Amount: ${flowData!.amount} XRP\n` +
      `To: ${recipientDisplay}\n\n` +
      `Your Balance: ${(await getBalance(user.xrplAddress)).balance} XRP\n\n` +
      `🔐 Enter your 5-digit PIN to confirm:`

    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
  } else if (currentStep === 'pin_verification') {
    // Verify PIN
    try {
      await pinVerificationService.verifyPIN(whatsappId, messageText)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'PIN verification failed'
      await sendTextMessage(phoneNumber, msg)
      return
    }

    // Get transaction details
    const txDetails = transactionPINs.get(whatsappId)
    if (!txDetails) {
      throw new Error('Transaction details not found')
    }

    // Check balance one more time
    const balance = await getBalance(user.xrplAddress)
    if (Number.parseFloat(balance.balance) < txDetails.amount) {
      throw new InsufficientFundsError(
        `Insufficient funds. Your balance: ${balance.balance} XRP`,
      )
    }

    // Execute transaction
    const senderSeed = getDecryptedSeed(user.encryptedSeed)
    const result = await sendXRP(
      senderSeed,
      txDetails.recipientAddress,
      txDetails.amount,
    )

    // Clear flow and PIN data
    flowManager.clearFlow(whatsappId)
    transactionPINs.delete(whatsappId)

    // Log transaction
    await TransactionService.logTransaction(
      result.hash,
      user.xrplAddress,
      txDetails.recipientAddress,
      txDetails.amount,
      'success',
      phoneNumber,
      txDetails.recipientPhone,
    )

    const msg =
      `✅ Payment Successful!\n\n` +
      `Sent: ${txDetails.amount} XRP\n` +
      `To: ${txDetails.recipientDisplay}\n` +
      `TX Hash: ${result.hash}\n\n` +
      `View on explorer:\n` +
      `https://testnet.xrpl.org/transactions/${result.hash}`

    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)

    // Notify recipient if they have SendSasa
    if (txDetails.recipientPhone) {
      const recipientMsg =
        `✅ Payment Received!\n\n` +
        `Amount: ${txDetails.amount} XRP\n` +
        `From: ${phoneNumber} (${user.username})\n` +
        `TX Hash: ${result.hash}`
      await sendTextMessage(txDetails.recipientPhone, recipientMsg)
    }
  }
}

/**
 * Handle request money flow steps
 */
async function handleRequestMoneyFlow(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  messageText: string,
  currentStep: string,
): Promise<void> {
  if (currentStep === 'amount') {
    const amount = Number.parseFloat(messageText)

    if (!validateAmount(amount)) {
      const msg = `Invalid amount. Please enter a number between 0.01 and 1,000,000`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    flowManager.updateFlowData(whatsappId, { amount })
    flowManager.setStep(whatsappId, 'recipient_input')

    const msg =
      `Who do you want to request ${amount} XRP from?\n\n` +
      `Enter:\n` +
      `• Phone: +237670123456\n` +
      `• Username: @marie.sasa\n` +
      `• Address: rN7n7...`
    await sendTextMessage(phoneNumber, msg)
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    if (
      !isPhoneNumber(recipient) &&
      !isXRPLAddress(recipient) &&
      !usernameService.isUsername(recipient)
    ) {
      const msg = `Invalid format. Please enter a valid phone number, username, or XRP address`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const flowData = flowManager.getFlowData(whatsappId)
    flowManager.clearFlow(whatsappId)

    await handleRequestCommand(
      whatsappId,
      phoneNumber,
      user,
      recipient,
      flowData!.amount!,
    )
  }
}

/**
 * Handle request command
 */
async function handleRequestCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  recipient: string,
  amount: number,
): Promise<void> {
  if (!validateAmount(amount)) {
    throw new ValidationError(
      `Invalid amount. Please request between 0.01 and 1,000,000 XRP.`,
    )
  }

  let payerAddress: string
  let payerPhone: string

  if (usernameService.isUsername(recipient)) {
    const payerUser = await usernameService.getUserByUsername(recipient)
    if (!payerUser) {
      throw new NotFoundError(
        `Username ${recipient} not found.\n\nThey need to register with SendSasa first.`,
      )
    }
    payerAddress = payerUser.xrplAddress
    payerPhone = payerUser.phoneNumber
  } else if (isPhoneNumber(recipient)) {
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
      `Invalid recipient format.\n\nUse a phone number, username (@name.sasa), or XRP address.`,
    )
  }

  const request = await PaymentRequestService.createPaymentRequest(
    user.xrplAddress,
    user.phoneNumber,
    payerAddress,
    payerPhone,
    amount,
  )

  await sendPaymentRequestButtons(
    payerPhone,
    user.phoneNumber,
    amount,
    request.requestId,
  )

  const confirmMsg =
    `✅ Payment Request Sent!\n\n` +
    `To: ${payerPhone}\n` +
    `Amount: ${amount} XRP\n` +
    `Request ID: ${request.requestId}\n\n` +
    `You'll be notified when they respond.`

  await sendBackToMenuButton(phoneNumber, confirmMsg)
  await MessageLogService.logOutgoingMessage(whatsappId, confirmMsg)
}

/**
 * Handle history command
 */
async function handleHistoryCommand(
  whatsappId: string,
  phoneNumber: string,
  address: string,
): Promise<void> {
  const history = await getHistory(address, 5)

  if (history.length === 0) {
    const msg = `📊 Transaction History\n\nNo transactions found.`
    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  let message = `📊 Recent Transactions\n\n`

  history.forEach((tx, index) => {
    const arrow = tx.direction === 'sent' ? '🔴' : '🟢'
    const direction = tx.direction === 'sent' ? 'SENT' : 'RECEIVED'
    message += `${index + 1}. ${arrow} ${direction} ${tx.amount} XRP\n`

    const addressToShow =
      tx.direction === 'sent' ? tx.to.substring(0, 8) : tx.from.substring(0, 8)
    message += `   ${tx.direction === 'sent' ? 'To' : 'From'}: ${addressToShow}...\n`
    message += `   ${tx.date.toLocaleDateString()}\n\n`
  })

  await sendTextMessage(phoneNumber, message)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, message)
}

/**
 * Handle view pending requests
 */
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
    message += `${index + 1}. ${req.amount} XRP\n`
    message += `   From: ${req.requesterPhone}\n`
    message += `   Message: ${req.message || 'No message'}\n`
    message += `   Expires: ${new Date(req.expiresAt).toLocaleDateString()}\n\n`
  })

  await sendTextMessage(phoneNumber, message)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, message)
}

// Approve Request Flow State
interface ApproveRequestFlow {
  requestId: string
  amount: number
  requesterAddress: string
  requesterPhone: string
}

const approveRequestFlows = new Map<string, ApproveRequestFlow>()

/**
 * Handle approve payment request (requires PIN)
 */
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

  // Store approve request flow
  approveRequestFlows.set(whatsappId, {
    requestId: request.requestId,
    amount: request.amount,
    requesterAddress: request.requesterAddress,
    requesterPhone: request.requesterPhone,
  })

  const msg =
    `💸 Approve Payment Request\n\n` +
    `Amount: ${request.amount} XRP\n` +
    `To: ${request.requesterPhone}\n\n` +
    `🔐 Enter your PIN to approve:`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle approve request PIN verification
 */
async function handleApproveRequestPIN(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  pin: string,
): Promise<void> {
  const approveFlow = approveRequestFlows.get(whatsappId)
  if (!approveFlow) return

  // Verify PIN
  try {
    await pinVerificationService.verifyPIN(whatsappId, pin)
  } catch (error) {
    const msg =
      error instanceof Error ? error.message : 'PIN verification failed'
    await sendTextMessage(phoneNumber, msg)
    return
  }

  // Check balance
  const balance = await getBalance(user.xrplAddress)
  if (Number.parseFloat(balance.balance) < approveFlow.amount) {
    approveRequestFlows.delete(whatsappId)
    throw new InsufficientFundsError(
      `Insufficient funds. Your balance: ${balance.balance} XRP`,
    )
  }

  // Execute payment
  try {
    const senderSeed = getDecryptedSeed(user.encryptedSeed)
    const result = await sendXRP(
      senderSeed,
      approveFlow.requesterAddress,
      approveFlow.amount,
    )

    // Update request status
    await PaymentRequestService.approvePaymentRequest(
      approveFlow.requestId,
      result.hash,
    )

    // Log transaction
    await TransactionService.logTransaction(
      result.hash,
      user.xrplAddress,
      approveFlow.requesterAddress,
      approveFlow.amount,
      'success',
      phoneNumber,
      approveFlow.requesterPhone,
    )

    // Clear flow
    approveRequestFlows.delete(whatsappId)

    const msg =
      `✅ Payment Request Approved!\n\n` +
      `Sent: ${approveFlow.amount} XRP\n` +
      `To: ${approveFlow.requesterPhone}\n` +
      `TX Hash: ${result.hash}\n\n` +
      `View on explorer:\n` +
      `https://testnet.xrpl.org/transactions/${result.hash}`

    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)

    // Notify requester
    const requesterMsg =
      `✅ Payment Request Approved!\n\n` +
      `Amount: ${approveFlow.amount} XRP\n` +
      `From: ${phoneNumber}\n` +
      `TX Hash: ${result.hash}`
    await sendTextMessage(approveFlow.requesterPhone, requesterMsg)
  } catch (error) {
    approveRequestFlows.delete(whatsappId)

    // Mark request as failed
    await PaymentRequestService.failPaymentRequest(approveFlow.requestId)

    throw error
  }
}

/**
 * Handle reject payment request
 */
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

  const msg = `❌ Payment Request Rejected\n\nRequest ID: ${requestId}`
  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)

  const requesterMsg =
    `❌ Payment Request Rejected\n\n` +
    `Your request for ${request.amount} XRP was rejected by ${phoneNumber}.`
  await sendTextMessage(request.requesterPhone, requesterMsg)
}

/**
 * Handle confirm send button
 */
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

  const balance = await getBalance(user.xrplAddress)
  if (Number.parseFloat(balance.balance) < pendingTx.amount) {
    pendingTransactionService.delete(transactionId)
    throw new InsufficientFundsError(
      `Insufficient funds. Your balance: ${balance.balance} XRP`,
    )
  }

  try {
    const senderSeed = getDecryptedSeed(user.encryptedSeed)
    const result = await sendXRP(
      senderSeed,
      pendingTx.recipientAddress,
      pendingTx.amount,
    )

    await TransactionService.logTransaction(
      result.hash,
      pendingTx.senderAddress,
      pendingTx.recipientAddress,
      pendingTx.amount,
      'success',
      pendingTx.phoneNumber,
      pendingTx.recipientPhone,
    )

    const msg =
      `✅ Payment Successful!\n\n` +
      `Sent: ${pendingTx.amount} XRP\n` +
      `To: ${pendingTx.recipientDisplay}\n` +
      `TX Hash: ${result.hash}\n\n` +
      `View on explorer:\n` +
      `https://testnet.xrpl.org/transactions/${result.hash}`

    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)

    if (pendingTx.recipientPhone) {
      const recipientMsg =
        `✅ Payment Received!\n\n` +
        `Amount: ${pendingTx.amount} XRP\n` +
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

/**
 * Handle cancel send button
 */
async function handleCancelSend(
  whatsappId: string,
  phoneNumber: string,
  transactionId: string,
): Promise<void> {
  const pendingTx = pendingTransactionService.get(transactionId)

  if (!pendingTx) {
    const msg = '⚠️  Transaction already expired or cancelled.'
    await sendBackToMenuButton(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  if (pendingTx.whatsappId !== whatsappId) {
    throw new ValidationError('This transaction is not for you.')
  }

  pendingTransactionService.delete(transactionId)

  const msg =
    `❌ Payment Cancelled\n\n` +
    `Amount: ${pendingTx.amount} XRP\n` +
    `To: ${pendingTx.recipientDisplay}`

  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle change PIN command
 */
async function handleChangePIN(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  changePINFlows.set(whatsappId, { step: 'old_pin' })

  const msg = `🔐 Change PIN\n\nEnter your current PIN:`
  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle change PIN flow
 */
async function handleChangePINFlow(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
): Promise<void> {
  const flow = changePINFlows.get(whatsappId)
  if (!flow) return

  if (flow.step === 'old_pin') {
    // Verify old PIN
    try {
      await pinVerificationService.verifyPIN(whatsappId, messageText)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'PIN verification failed'
      await sendTextMessage(phoneNumber, msg + '\n\nPlease try again:')
      return
    }

    flow.oldPin = messageText
    flow.step = 'new_pin'
    changePINFlows.set(whatsappId, flow)

    await sendTextMessage(
      phoneNumber,
      `✅ Verified\n\nEnter your new 5-digit PIN:`,
    )
  } else if (flow.step === 'new_pin') {
    try {
      pinVerificationService.validatePINFormat(messageText)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid PIN format'
      await sendTextMessage(phoneNumber, msg + '\n\nPlease try again:')
      return
    }

    flow.newPin = messageText
    flow.step = 'confirm_new'
    changePINFlows.set(whatsappId, flow)

    await sendTextMessage(phoneNumber, `Confirm your new PIN:`)
  } else if (flow.step === 'confirm_new') {
    if (messageText !== flow.newPin) {
      await sendTextMessage(
        phoneNumber,
        `❌ PINs don't match.\n\nEnter your new PIN again:`,
      )
      flow.step = 'new_pin'
      flow.newPin = undefined
      changePINFlows.set(whatsappId, flow)
      return
    }

    try {
      await pinVerificationService.changePIN(
        whatsappId,
        flow.oldPin!,
        flow.newPin,
      )

      changePINFlows.delete(whatsappId)

      const msg = `✅ PIN Changed Successfully!\n\nYour new PIN is now active.`
      await sendBackToMenuButton(phoneNumber, msg)
      await MessageLogService.logOutgoingMessage(whatsappId, msg)
    } catch (error) {
      changePINFlows.delete(whatsappId)
      throw error
    }
  }
}

/**
 * Handle forgot PIN command
 */
async function handleForgotPIN(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  // Generate recovery code
  const code = await pinVerificationService.generateRecoveryCode(whatsappId)

  forgotPINFlows.set(whatsappId, { step: 'code_sent', code })

  const msg =
    `🔐 PIN Recovery\n\n` +
    `Your verification code: *${code}*\n\n` +
    `Code expires in 10 minutes.\n\n` +
    `Please enter this code to continue:`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

/**
 * Handle forgot PIN flow
 */
async function handleForgotPINFlow(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
): Promise<void> {
  const flow = forgotPINFlows.get(whatsappId)
  if (!flow) return

  if (flow.step === 'code_sent' || flow.step === 'verify_code') {
    // Verify code
    try {
      await pinVerificationService.verifyRecoveryCode(whatsappId, messageText)
    } catch (error) {
      const msg =
        error instanceof Error ? error.message : 'Code verification failed'
      await sendTextMessage(phoneNumber, msg)
      return
    }

    flow.step = 'new_pin'
    forgotPINFlows.set(whatsappId, flow)

    await sendTextMessage(
      phoneNumber,
      `✅ Code Verified\n\nEnter your new 5-digit PIN:`,
    )
  } else if (flow.step === 'new_pin') {
    try {
      pinVerificationService.validatePINFormat(messageText)
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Invalid PIN format'
      await sendTextMessage(phoneNumber, msg + '\n\nPlease try again:')
      return
    }

    flow.newPin = messageText
    flow.step = 'confirm_new'
    forgotPINFlows.set(whatsappId, flow)

    await sendTextMessage(phoneNumber, `Confirm your new PIN:`)
  } else if (flow.step === 'confirm_new') {
    if (messageText !== flow.newPin) {
      await sendTextMessage(
        phoneNumber,
        `❌ PINs don't match.\n\nEnter your new PIN again:`,
      )
      flow.step = 'new_pin'
      flow.newPin = undefined
      forgotPINFlows.set(whatsappId, flow)
      return
    }

    try {
      // Use the stored code, not the user's input
      await pinVerificationService.resetPINWithCode(
        whatsappId,
        flow.code!,
        flow.newPin,
      )

      forgotPINFlows.delete(whatsappId)

      const msg =
        `✅ PIN Reset Successfully!\n\n` +
        `Your new PIN is now active.\n\n` +
        `⚠️ If you didn't request this, contact support immediately.`

      await sendBackToMenuButton(phoneNumber, msg)
      await MessageLogService.logOutgoingMessage(whatsappId, msg)
    } catch (error) {
      forgotPINFlows.delete(whatsappId)
      throw error
    }
  }
}

/**
 * Handle change username command
 */
async function handleChangeUsernameAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const msg =
    `✏️ Change Username\n\n` +
    `Current username: ${user.username}\n\n` +
    `Enter your new username (without @):\n\n` +
    `Example: marie_dschang.sasa\n\n` +
    `Rules:\n` +
    `• Must end with .sasa\n` +
    `• 3-20 characters before .sasa\n` +
    `• Can change once every 30 days`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)

  // Set a temporary flag to expect username input
  // (In production, you'd want a proper flow state for this)
}

/**
 * Handle Wallet Settings button
 */
async function handleWalletSettingsAction(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  await sendWalletSettingsMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(
    whatsappId,
    'Wallet settings menu sent',
  )
}
