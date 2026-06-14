import { Injectable } from '@nestjs/common'

export interface ButtonInteraction {
  action: string
  amount?: number
  recipientType?: 'phone' | 'address' | 'username'
  currency?: 'XRP' | 'RLUSD' | 'USDC'
  transactionId?: string
  requestId?: string
  phone?: string
}

export function parseButtonInteraction(buttonId: string): ButtonInteraction {
  if (buttonId === 'main_menu') return { action: 'main_menu' }
  if (buttonId === 'send_money') return { action: 'send_money' }
  if (buttonId === 'send_crypto') return { action: 'send_crypto' }
  if (buttonId === 'request_money') return { action: 'request_money' }
  if (buttonId === 'request_crypto') return { action: 'request_crypto' }
  if (buttonId === 'request_card') return { action: 'request_card' }
  if (buttonId === 'offramp_money') return { action: 'offramp_money' }
  if (buttonId === 'card_payment') return { action: 'card_payment' }
  if (buttonId === 'card_pay_hosted') return { action: 'card_pay_hosted' }
  if (buttonId === 'card_pay_headless') return { action: 'card_pay_headless' }
  if (buttonId === 'my_wallet') return { action: 'my_wallet' }
  if (buttonId === 'transaction_history')
    return { action: 'transaction_history' }
  if (buttonId === 'pending_requests') return { action: 'pending_requests' }
  if (buttonId === 'get_started') return { action: 'get_started' }
  if (buttonId === 'check_activation') return { action: 'check_activation' }
  if (buttonId === 'import_wallet') return { action: 'import_wallet' }
  if (buttonId === 'my_contacts') return { action: 'my_contacts' }
  if (buttonId === 'buy_crypto') return { action: 'buy_crypto' }

  // Section navigation (two-level main menu)
  if (buttonId === 'section_money')     return { action: 'section_money' }
  if (buttonId === 'section_account')   return { action: 'section_account' }
  if (buttonId === 'section_momotrust') return { action: 'section_momotrust' }

  // MoMo Trust features
  if (buttonId === 'trustlock')      return { action: 'trustlock' }
  if (buttonId === 'njangi')         return { action: 'njangi' }
  if (buttonId === 'splitchat')      return { action: 'splitchat' }
  if (buttonId === 'kobokall')       return { action: 'kobokall' }
  if (buttonId === 'payday')         return { action: 'payday' }
  if (buttonId === 'safipay')        return { action: 'safipay' }
  if (buttonId === 'trustlock_cancel') return { action: 'trustlock_cancel' }

  // MoMo Trust action buttons with embedded ID (format: action:resourceId)
  if (buttonId.startsWith('trustlock_pay:'))
    return { action: 'trustlock_pay', phone: buttonId.slice('trustlock_pay:'.length) }
  if (buttonId.startsWith('trustlock_confirm:'))
    return { action: 'trustlock_confirm', phone: buttonId.slice('trustlock_confirm:'.length) }
  if (buttonId.startsWith('trustlock_dispute:'))
    return { action: 'trustlock_dispute', phone: buttonId.slice('trustlock_dispute:'.length) }
  if (buttonId.startsWith('kobokall_confirm:'))
    return { action: 'kobokall_confirm', phone: buttonId.slice('kobokall_confirm:'.length) }
  if (buttonId.startsWith('kobokall_cancel:'))
    return { action: 'kobokall_cancel', phone: buttonId.slice('kobokall_cancel:'.length) }
  if (buttonId.startsWith('payday_approve:'))
    return { action: 'payday_approve', phone: buttonId.slice('payday_approve:'.length) }
  if (buttonId.startsWith('njangi_pay:'))
    return { action: 'njangi_pay', phone: buttonId.slice('njangi_pay:'.length) }
  if (buttonId.startsWith('njangi_status:'))
    return { action: 'njangi_status', phone: buttonId.slice('njangi_status:'.length) }

  if (buttonId.startsWith('save_contact:')) {
    return { action: 'save_contact', phone: buttonId.slice('save_contact:'.length) }
  }

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

@Injectable()
export class MessageParserService {
  parseButtonInteraction(buttonId: string) { return parseButtonInteraction(buttonId) }
  isXRPLAddress(address: string) { return isXRPLAddress(address) }
  isPhoneNumber(phone: string) { return isPhoneNumber(phone) }
  isUsername(text: string) { return isUsername(text) }
  validateAmount(amount: number) { return validateAmount(amount) }
}
