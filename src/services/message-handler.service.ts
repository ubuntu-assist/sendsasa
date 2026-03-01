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
import { IUser } from '../types'

export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
): Promise<void> {
  console.log(`\nMessage from ${phoneNumber}: ${messageText}`)

  try {
    await MessageLogService.logIncomingMessage(whatsappId, messageText)

    const user = await UserService.getUserByWhatsAppId(whatsappId)

    if (!user) {
      await sendWelcomeMessage(phoneNumber)
      await MessageLogService.logOutgoingMessage(
        whatsappId,
        'Welcome message sent',
      )
      return
    }

    await UserService.updateLastActive(whatsappId)

    if (flowManager.isInFlow(whatsappId)) {
      await handleFlowMessage(whatsappId, phoneNumber, user, messageText)
      return
    }

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

export async function handleButtonClick(
  whatsappId: string,
  phoneNumber: string,
  buttonId: string,
): Promise<void> {
  console.log(`\nButton click from ${phoneNumber}: ${buttonId}`)

  try {
    const interaction = parseButtonInteraction(buttonId)

    if (interaction.action === 'get_started') {
      await handleGetStarted(whatsappId, phoneNumber)
      return
    }

    const user = await UserService.getUserByWhatsAppId(whatsappId)
    if (!user) {
      throw new NotFoundError('Please click Get Started first.')
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

      case 'recipient_type_selected':
        await handleRecipientTypeSelected(
          whatsappId,
          phoneNumber,
          interaction.amount!,
          interaction.recipientType!,
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

async function handleGetStarted(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  const user = await UserService.createUser(whatsappId, phoneNumber)

  const msg =
    `Great! Your secure XRP wallet has been created! ✅\n\n` +
    `Address: ${user.xrplAddress}\n` +
    `Balance: 1000 XRP (Testnet)\n\n` +
    `You're all set to start sending and receiving XRP!`

  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

async function handleMainMenuAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const balance = await getBalance(user.xrplAddress)
  await sendMainMenu(phoneNumber, balance.balance)
  await MessageLogService.logOutgoingMessage(whatsappId, 'Main menu sent')
}

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

async function handleMyWalletAction(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const balance = await getBalance(user.xrplAddress)

  const msg =
    `Your Wallet\n\n` +
    `Balance: ${balance.balance} XRP\n\n` +
    `Address:\n${user.xrplAddress}`

  await sendTextMessage(phoneNumber, msg)
  await sendWalletMenu(phoneNumber)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

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
    flowManager.setStep(whatsappId, 'recipient_type')

    await sendRecipientTypeMenu(phoneNumber, amount)
    await MessageLogService.logOutgoingMessage(
      whatsappId,
      'Recipient type selection sent',
    )
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    if (!isPhoneNumber(recipient) && !isXRPLAddress(recipient)) {
      const msg = `Invalid format. Please enter a valid phone number (+237...) or XRP address (rN7n7...)`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    const flowData = flowManager.getFlowData(whatsappId)
    flowManager.clearFlow(whatsappId)

    await handleSendCommand(
      whatsappId,
      phoneNumber,
      user,
      recipient,
      flowData!.amount!,
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
  if (currentStep === 'amount') {
    const amount = Number.parseFloat(messageText)

    if (!validateAmount(amount)) {
      const msg = `Invalid amount. Please enter a number between 0.01 and 1,000,000`
      await sendTextMessage(phoneNumber, msg)
      return
    }

    flowManager.updateFlowData(whatsappId, { amount })
    flowManager.setStep(whatsappId, 'recipient_input')

    const msg = `Who do you want to request ${amount} XRP from?\n\nPlease enter their phone number (+237...) or XRP address (rN7n7...)`
    await sendTextMessage(phoneNumber, msg)
  } else if (currentStep === 'recipient_input') {
    const recipient = messageText.trim()

    if (!isPhoneNumber(recipient) && !isXRPLAddress(recipient)) {
      const msg = `Invalid format. Please enter a valid phone number or XRP address`
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
 * Handle send command — validates, stores pending tx, sends confirmation buttons
 */
async function handleSendCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  recipient: string,
  amount: number,
): Promise<void> {
  if (!validateAmount(amount)) {
    throw new ValidationError(
      `Invalid amount. Please send between 0.01 and 1,000,000 XRP.`,
    )
  }

  const balance = await getBalance(user.xrplAddress)
  if (Number.parseFloat(balance.balance) < amount) {
    throw new InsufficientFundsError(
      `Insufficient funds. Your balance: ${balance.balance} XRP`,
    )
  }

  let recipientAddress: string
  let recipientDisplay: string
  let recipientPhone: string | undefined

  if (isXRPLAddress(recipient)) {
    recipientAddress = recipient
    recipientDisplay = recipient.substring(0, 10) + '...'
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
    timestamp: new Date(),
  })

  const confirmMsg =
    `💸 Confirm Payment\n\n` +
    `Amount: ${amount} XRP\n` +
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
): Promise<void> {
  if (!validateAmount(amount)) {
    throw new ValidationError(
      `Invalid amount. Please request between 0.01 and 1,000,000 XRP.`,
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

  const balance = await getBalance(user.xrplAddress)
  if (Number.parseFloat(balance.balance) < request.amount) {
    await PaymentRequestService.failPaymentRequest(requestId)
    throw new InsufficientFundsError(
      `Insufficient funds. Your balance: ${balance.balance} XRP`,
    )
  }

  const senderSeed = getDecryptedSeed(user.encryptedSeed)
  const result = await sendXRP(
    senderSeed,
    request.requesterAddress,
    request.amount,
  )

  await PaymentRequestService.approvePaymentRequest(requestId, result.hash)
  await TransactionService.logTransaction(
    result.hash,
    user.xrplAddress,
    request.requesterAddress,
    request.amount,
    'success',
    user.phoneNumber,
    request.requesterPhone,
  )

  const payerMsg =
    `✅ Payment Sent!\n\n` +
    `Amount: ${request.amount} XRP\n` +
    `To: ${request.requesterPhone}\n` +
    `TX Hash: ${result.hash}\n\n` +
    `View on explorer:\n` +
    `https://testnet.xrpl.org/transactions/${result.hash}`

  await sendBackToMenuButton(phoneNumber, payerMsg)
  await MessageLogService.logOutgoingMessage(whatsappId, payerMsg)

  const requesterMsg =
    `✅ Payment Received!\n\n` +
    `Amount: ${request.amount} XRP\n` +
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

  const msg = `❌ Payment Request Rejected\n\nRequest ID: ${requestId}`
  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)

  const requesterMsg =
    `❌ Payment Request Rejected\n\n` +
    `Your request for ${request.amount} XRP was rejected by ${phoneNumber}.`
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

  const msg =
    `❌ Payment Cancelled\n\n` +
    `Amount: ${pendingTx.amount} XRP\n` +
    `To: ${pendingTx.recipientDisplay}`

  await sendBackToMenuButton(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}
