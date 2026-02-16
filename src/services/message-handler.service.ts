import {
  sendTextMessage,
  sendConfirmationButtons,
  sendPaymentRequestButtons,
} from './whatsapp.service'
import {
  parseMessage,
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
import { IUser } from '../types'

export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  messageText: string,
): Promise<void> {
  console.log(`\nMessage from ${phoneNumber}: ${messageText}`)

  try {
    await MessageLogService.logIncomingMessage(whatsappId, messageText)

    let user = await UserService.getUserByWhatsAppId(whatsappId)
    if (!user) {
      user = await UserService.createUser(whatsappId, phoneNumber)

      const welcomeMsg =
        `Welcome to SendSasa! 🎉\n\n` +
        `Your XRP wallet has been created:\n` +
        `Address: ${user.xrplAddress}\n\n` +
        `You can receive payments using your phone number or XRP address.\n\n` +
        `Type 'help' to see available commands.`

      await sendTextMessage(phoneNumber, welcomeMsg)
      await MessageLogService.logOutgoingMessage(whatsappId, welcomeMsg)
      return
    }

    await UserService.updateLastActive(whatsappId)

    const command = parseMessage(messageText)

    switch (command.type) {
      case 'balance':
        await handleBalanceCommand(whatsappId, phoneNumber, user.xrplAddress)
        break

      case 'address':
        await handleAddressCommand(whatsappId, phoneNumber, user)
        break

      case 'history':
        await handleHistoryCommand(whatsappId, phoneNumber, user.xrplAddress)
        break

      case 'send':
        await handleSendCommand(
          whatsappId,
          phoneNumber,
          user,
          command.recipient!,
          command.amount!,
        )
        break

      case 'request':
        await handleRequestCommand(
          whatsappId,
          phoneNumber,
          user,
          command.recipient!,
          command.amount!,
          command.message,
        )
        break

      case 'requests':
        await handleViewRequestsCommand(
          whatsappId,
          phoneNumber,
          user.xrplAddress,
        )
        break

      case 'help':
        await handleHelpCommand(whatsappId, phoneNumber)
        break

      case 'unknown':
      default: {
        const unknownMsg = `I didn't understand that command.\n\nType 'help' to see available commands.`
        await sendTextMessage(phoneNumber, unknownMsg)
        await MessageLogService.logOutgoingMessage(whatsappId, unknownMsg)
        break
      }
    }
  } catch (error) {
    console.error('Error handling message:', error)
    const errorMsg =
      error instanceof AppError
        ? error.message
        : `Sorry, there was an error processing your request. Please try again.`

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
    const user = await UserService.getUserByWhatsAppId(whatsappId)
    if (!user) {
      throw new NotFoundError('User not found. Please send a message first.')
    }

    const interaction = parseButtonInteraction(buttonId)

    switch (interaction.action) {
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

      case 'balance':
        await handleBalanceCommand(whatsappId, phoneNumber, user.xrplAddress)
        break

      case 'history':
        await handleHistoryCommand(whatsappId, phoneNumber, user.xrplAddress)
        break

      case 'help':
        await handleHelpCommand(whatsappId, phoneNumber)
        break

      default:
        throw new ValidationError('Unknown button action')
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

async function handleBalanceCommand(
  whatsappId: string,
  phoneNumber: string,
  address: string,
): Promise<void> {
  const balanceInfo = await getBalance(address)

  const msg =
    `Your Balance\n\n` +
    `${balanceInfo.balance} XRP\n\n` +
    `Address: ${address.substring(0, 10)}...`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

async function handleAddressCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
): Promise<void> {
  const msg =
    `Your Details\n\n` +
    `Phone: ${user.phoneNumber}\n` +
    `XRP Address:\n${user.xrplAddress}\n\n` +
    `You can receive payments using either your phone number or XRP address.`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}

async function handleHistoryCommand(
  whatsappId: string,
  phoneNumber: string,
  address: string,
): Promise<void> {
  const history = await getHistory(address, 5)

  if (history.length === 0) {
    const msg = `Transaction History\n\nNo transactions found.`
    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  let message = `Recent Transactions\n\n`

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
  await MessageLogService.logOutgoingMessage(whatsappId, message)
}

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
    recipientPhone = undefined
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
  const confirmId = `confirm_send_${transactionId}`
  const cancelId = `cancel_send_${transactionId}`

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
    `Confirm Payment\n\n` +
    `Amount: ${amount} XRP\n` +
    `To: ${recipientDisplay}\n\n` +
    `Please confirm this transaction:`

  await sendConfirmationButtons(phoneNumber, confirmMsg, confirmId, cancelId)
  await MessageLogService.logOutgoingMessage(whatsappId, confirmMsg)
}

async function handleRequestCommand(
  whatsappId: string,
  phoneNumber: string,
  user: IUser,
  recipient: string,
  amount: number,
  message?: string,
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
    message,
  )

  await sendPaymentRequestButtons(
    payerPhone,
    user.phoneNumber,
    amount,
    request.requestId,
  )

  const confirmMsg =
    `Payment Request Sent!\n\n` +
    `To: ${payerPhone}\n` +
    `Amount: ${amount} XRP\n` +
    `Request ID: ${request.requestId}\n\n` +
    `You'll be notified when they respond.`

  await sendTextMessage(phoneNumber, confirmMsg)
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
    const msg = `Payment Requests\n\nNo pending requests.`
    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  let message = `Pending Payment Requests\n\n`

  pendingRequests.forEach((req, index) => {
    message += `${index + 1}. ${req.amount} XRP\n`
    message += `   From: ${req.requesterPhone}\n`
    message += `   Message: ${req.message || 'No message'}\n`
    message += `   Expires: ${new Date(req.expiresAt).toLocaleDateString()}\n\n`
  })

  await sendTextMessage(phoneNumber, message)
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
    `Payment Sent!\n\n` +
    `Amount: ${request.amount} XRP\n` +
    `To: ${request.requesterPhone}\n` +
    `TX Hash: ${result.hash}\n\n` +
    `View on explorer:\n` +
    `https://testnet.xrpl.org/transactions/${result.hash}`

  await sendTextMessage(phoneNumber, payerMsg)
  await MessageLogService.logOutgoingMessage(whatsappId, payerMsg)

  const requesterMsg =
    `Payment Received!\n\n` +
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

  const msg = `Payment Request Rejected\n\nRequest ID: ${requestId}`
  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)

  const requesterMsg =
    `Payment Request Rejected\n\n` +
    `Your request for ${request.amount} XRP was rejected by ${phoneNumber}.`
  await sendTextMessage(request.requesterPhone, requesterMsg)
}

async function handleHelpCommand(
  whatsappId: string,
  phoneNumber: string,
): Promise<void> {
  const msg =
    `SendSasa Commands\n\n` +
    `Balance:\n` +
    `   "balance"\n\n` +
    `Address:\n` +
    `   "address"\n\n` +
    `Send XRP:\n` +
    `   "send 10 to +237670123456"\n` +
    `   "send 10 to rN7n7..."\n\n` +
    `Request payment:\n` +
    `   "request 50 from +237670123456"\n` +
    `   "request 50 from +237... for lunch"\n\n` +
    `View requests:\n` +
    `   "requests"\n\n` +
    `History:\n` +
    `   "history"\n\n` +
    `Help:\n` +
    `   "help"`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
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
      `Payment Successful!\n\n` +
      `Sent: ${pendingTx.amount} XRP\n` +
      `To: ${pendingTx.recipientDisplay}\n` +
      `TX Hash: ${result.hash}\n\n` +
      `View on explorer:\n` +
      `https://testnet.xrpl.org/transactions/${result.hash}`

    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)

    if (pendingTx.recipientPhone) {
      const recipientMsg =
        `Payment Received!\n\n` +
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
    const msg = 'Transaction already expired or cancelled.'
    await sendTextMessage(phoneNumber, msg)
    await MessageLogService.logOutgoingMessage(whatsappId, msg)
    return
  }

  if (pendingTx.whatsappId !== whatsappId) {
    throw new ValidationError('This transaction is not for you.')
  }

  pendingTransactionService.delete(transactionId)

  const msg =
    `Payment Cancelled\n\n` +
    `Amount: ${pendingTx.amount} XRP\n` +
    `To: ${pendingTx.recipientDisplay}`

  await sendTextMessage(phoneNumber, msg)
  await MessageLogService.logOutgoingMessage(whatsappId, msg)
}
