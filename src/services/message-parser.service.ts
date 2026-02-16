import { ParsedCommand } from '../types'
import {
  validatePhoneNumber,
  validateXRPLAddress,
  validateAmount,
} from '../middleware/validators'

export function parseMessage(message: string): ParsedCommand {
  const normalizedMessage = message.toLowerCase().trim()

  if (
    normalizedMessage === 'balance' ||
    normalizedMessage === 'bal' ||
    normalizedMessage.includes('check balance') ||
    normalizedMessage.includes('my balance')
  ) {
    return { type: 'balance' }
  }

  if (
    normalizedMessage === 'address' ||
    normalizedMessage === 'my address' ||
    normalizedMessage.includes('show address') ||
    normalizedMessage.includes('wallet address')
  ) {
    return { type: 'address' }
  }

  if (
    normalizedMessage === 'history' ||
    normalizedMessage === 'transactions' ||
    normalizedMessage === 'txs' ||
    normalizedMessage.includes('show history') ||
    normalizedMessage.includes('transaction history')
  ) {
    return { type: 'history' }
  }

  if (
    normalizedMessage === 'requests' ||
    normalizedMessage === 'pending' ||
    normalizedMessage.includes('payment requests') ||
    normalizedMessage.includes('my requests')
  ) {
    return { type: 'requests' }
  }

  if (
    normalizedMessage === 'help' ||
    normalizedMessage === 'commands' ||
    normalizedMessage === 'menu' ||
    normalizedMessage === '?'
  ) {
    return { type: 'help' }
  }

  // Format: "send 10 to +237670123456" or "send 10 to rN7n7..."
  const sendPattern =
    /send\s+(\d+\.?\d*)\s+(?:to|xrp to)\s+((?:\+\d{10,15})|(?:r[a-zA-Z0-9]{24,34}))/i
  const sendMatch = new RegExp(sendPattern).exec(message)

  if (sendMatch) {
    const amount = Number.parseFloat(sendMatch[1])
    const recipient = sendMatch[2].trim()

    if (!validateAmount(amount)) {
      return { type: 'unknown' }
    }

    return {
      type: 'send',
      amount: amount,
      recipient: recipient,
    }
  }

  // Format: "request 50 from +237670123456" or "request 50 from rN7n7..."
  const requestPattern =
    /request\s+(\d+\.?\d*)\s+(?:from|xrp from)\s+((?:\+\d{10,15})|(?:r[a-zA-Z0-9]{24,34}))(?:\s+for\s+(.+))?/i
  const requestMatch = new RegExp(requestPattern).exec(message)

  if (requestMatch) {
    const amount = Number.parseFloat(requestMatch[1])
    const recipient = requestMatch[2].trim()
    const requestMessage = requestMatch[3]?.trim()

    if (!validateAmount(amount)) {
      return { type: 'unknown' }
    }

    return {
      type: 'request',
      amount: amount,
      recipient: recipient,
      message: requestMessage || 'Payment request',
    }
  }

  return { type: 'unknown' }
}

export function parseButtonInteraction(buttonId: string): {
  action: string
  requestId?: string
  transactionId?: string
} {
  if (buttonId.startsWith('approve_')) {
    return {
      action: 'approve',
      requestId: buttonId.replace('approve_', ''),
    }
  }

  if (buttonId.startsWith('reject_')) {
    return {
      action: 'reject',
      requestId: buttonId.replace('reject_', ''),
    }
  }

  if (buttonId.startsWith('confirm_send_')) {
    return {
      action: 'confirm_send',
      transactionId: buttonId.replace('confirm_send_', ''),
    }
  }

  if (buttonId.startsWith('cancel_send_')) {
    return {
      action: 'cancel_send',
      transactionId: buttonId.replace('cancel_send_', ''),
    }
  }

  if (buttonId.startsWith('action_')) {
    return {
      action: buttonId.replace('action_', ''),
    }
  }

  return { action: 'unknown' }
}

export function formatPhoneNumber(phoneNumber: string): string {
  let cleaned = phoneNumber.replaceAll(/\D/g, '')

  if (!cleaned.startsWith('237')) {
    cleaned = '237' + cleaned
  }

  return '+' + cleaned
}

export function isValidRecipient(recipient: string): boolean {
  return validatePhoneNumber(recipient) || validateXRPLAddress(recipient)
}

export function isXRPLAddress(address: string): boolean {
  return validateXRPLAddress(address)
}

export function isPhoneNumber(number: string): boolean {
  return validatePhoneNumber(number)
}
