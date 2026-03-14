import {
  validatePhoneNumber,
  validateXRPLAddress,
} from '../middleware/validators'

export function parseButtonInteraction(buttonId: string): {
  action: string
  requestId?: string
  transactionId?: string
  amount?: number
  recipientType?: 'phone' | 'address'
  currency?: 'XRP' | 'RLUSD' | 'USDC'
  subAction?: string
} {
  if (buttonId === 'currency_xrp_send') {
    return { action: 'currency_send', currency: 'XRP' }
  }
  if (buttonId === 'currency_rlusd_send') {
    return { action: 'currency_send', currency: 'RLUSD' }
  }
  if (buttonId === 'currency_usdc_send') {
    return { action: 'currency_send', currency: 'USDC' }
  }

  if (buttonId === 'currency_xrp_request') {
    return { action: 'currency_request', currency: 'XRP' }
  }
  if (buttonId === 'currency_rlusd_request') {
    return { action: 'currency_request', currency: 'RLUSD' }
  }
  if (buttonId === 'currency_usdc_request') {
    return { action: 'currency_request', currency: 'USDC' }
  }

  if (buttonId === 'confirm_username_yes') {
    return { action: 'confirm_username', subAction: 'yes' }
  }
  if (buttonId === 'confirm_username_no') {
    return { action: 'confirm_username', subAction: 'no' }
  }
  if (buttonId === 'confirm_username_cancel') {
    return { action: 'confirm_username', subAction: 'cancel' }
  }

  if (buttonId === 'wallet_settings') {
    return { action: 'wallet_settings' }
  }
  if (buttonId === 'change_pin') {
    return { action: 'change_pin' }
  }
  if (buttonId === 'change_username') {
    return { action: 'change_username' }
  }
  if (buttonId === 'back_to_menu') {
    return { action: 'back_to_menu' }
  }

  if (buttonId.startsWith('approve_')) {
    return { action: 'approve', requestId: buttonId.replace('approve_', '') }
  }

  if (buttonId.startsWith('reject_')) {
    return { action: 'reject', requestId: buttonId.replace('reject_', '') }
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

  if (buttonId === 'get_started') return { action: 'get_started' }
  if (buttonId === 'main_menu') return { action: 'main_menu' }
  if (buttonId === 'send_money') return { action: 'send_money' }
  if (buttonId === 'request_money') return { action: 'request_money' }
  if (buttonId === 'my_wallet') return { action: 'my_wallet' }
  if (buttonId === 'transaction_history')
    return { action: 'transaction_history' }
  if (buttonId === 'pending_requests') return { action: 'pending_requests' }

  if (buttonId.startsWith('amount_')) {
    const amount = Number.parseInt(buttonId.replace('amount_', ''))
    return { action: 'amount_selected', amount }
  }

  if (buttonId.startsWith('recipient_phone_')) {
    const amount = Number.parseInt(buttonId.replace('recipient_phone_', ''))
    return { action: 'recipient_type_selected', recipientType: 'phone', amount }
  }

  if (buttonId.startsWith('recipient_address_')) {
    const amount = Number.parseInt(buttonId.replace('recipient_address_', ''))
    return {
      action: 'recipient_type_selected',
      recipientType: 'address',
      amount,
    }
  }

  if (buttonId.startsWith('action_')) {
    return { action: buttonId.replace('action_', '') }
  }

  return { action: 'unknown' }
}

export function isXRPLAddress(address: string): boolean {
  return validateXRPLAddress(address)
}

export function isPhoneNumber(number: string): boolean {
  return validatePhoneNumber(number)
}

export function getCurrencyEmoji(currency: 'XRP' | 'RLUSD' | 'USDC'): string {
  switch (currency) {
    case 'XRP':
      return '🔷'
    case 'RLUSD':
      return '💵'
    case 'USDC':
      return '🔵'
    default:
      return '💰'
  }
}

export function formatCurrencyAmount(
  amount: string | number,
  currency: 'XRP' | 'RLUSD' | 'USDC',
): string {
  const emoji = getCurrencyEmoji(currency)
  return `${emoji} ${amount} ${currency}`
}
