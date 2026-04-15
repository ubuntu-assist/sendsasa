export interface ButtonInteraction {
  action: string
  amount?: number
  recipientType?: 'phone' | 'address' | 'username'
  currency?: 'XRP' | 'RLUSD' | 'USDC'
  transactionId?: string
  requestId?: string
}

export function parseButtonInteraction(buttonId: string): ButtonInteraction {
  if (buttonId === 'main_menu') return { action: 'main_menu' }
  if (buttonId === 'send_money') return { action: 'send_money' }
  if (buttonId === 'request_money') return { action: 'request_money' }
  if (buttonId === 'offramp_money') return { action: 'offramp_money' }
  if (buttonId === 'card_payment') return { action: 'card_payment' }
  if (buttonId === 'my_wallet') return { action: 'my_wallet' }
  if (buttonId === 'transaction_history')
    return { action: 'transaction_history' }
  if (buttonId === 'pending_requests') return { action: 'pending_requests' }
  if (buttonId === 'get_started') return { action: 'get_started' }
  if (buttonId === 'check_activation') return { action: 'check_activation' }
  if (buttonId === 'import_wallet') return { action: 'import_wallet' }

  if (buttonId.startsWith('currency_')) {
    const parts = buttonId.split('_')
    const currency = parts[1].toUpperCase() as 'XRP' | 'RLUSD' | 'USDC'
    const flowAction = parts[2]
    return {
      action: flowAction === 'send' ? 'currency_send' : 'currency_request',
      currency,
    }
  }

  if (buttonId.startsWith('recipient_')) {
    const type = buttonId.replace('recipient_', '') as
      | 'phone'
      | 'address'
      | 'username'
    return { action: 'recipient_type_selected', recipientType: type }
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

  if (buttonId.startsWith('approve_')) {
    return { action: 'approve', requestId: buttonId.replace('approve_', '') }
  }

  if (buttonId.startsWith('reject_')) {
    return { action: 'reject', requestId: buttonId.replace('reject_', '') }
  }

  if (buttonId.startsWith('amount_')) {
    return {
      action: 'amount_selected',
      amount: Number.parseFloat(buttonId.replace('amount_', '')),
    }
  }

  return { action: 'unknown' }
}

export function isXRPLAddress(address: string): boolean {
  return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)
}

export function isPhoneNumber(phone: string): boolean {
  return /^\+?[1-9]\d{1,14}$/.test(phone)
}

export function isUsername(text: string): boolean {
  return text.startsWith('@') && text.endsWith('.sasa')
}

export function validateAmount(amount: number): boolean {
  return !Number.isNaN(amount) && amount > 0 && amount <= 1000000
}
