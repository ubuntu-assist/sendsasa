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
} {
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
  if (buttonId === 'wallet_settings') return { action: 'wallet_settings' }
  if (buttonId === 'change_pin') return { action: 'change_pin' }
  if (buttonId === 'change_username') return { action: 'change_username' }

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
