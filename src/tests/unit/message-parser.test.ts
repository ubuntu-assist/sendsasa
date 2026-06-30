import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseButtonInteraction,
  isXRPLAddress,
  isPhoneNumber,
  isUsername,
  validateAmount,
} from '@messaging/whatsapp/message-parser.service.js'

describe('parseButtonInteraction', () => {
  it('returns correct action for known simple IDs', () => {
    const simple = [
      'main_menu', 'send_money', 'send_crypto', 'request_money',
      'request_crypto', 'request_card', 'offramp_money', 'card_payment',
      'card_pay_hosted', 'card_pay_headless', 'my_wallet',
      'transaction_history', 'pending_requests', 'get_started',
      'check_activation', 'import_wallet', 'my_contacts',
    ]
    for (const id of simple) {
      assert.equal(parseButtonInteraction(id).action, id)
    }
  })

  it('returns unknown for unrecognised IDs', () => {
    assert.equal(parseButtonInteraction('totally_unknown').action, 'unknown')
    assert.equal(parseButtonInteraction('').action, 'unknown')
  })

  it('parses save_contact: prefix', () => {
    const result = parseButtonInteraction('save_contact:+237612345678')
    assert.equal(result.action, 'save_contact')
    assert.equal(result.phone, '+237612345678')
  })

  it('parses currency_xrp_send', () => {
    const result = parseButtonInteraction('currency_xrp_send')
    assert.equal(result.action, 'currency_send')
    assert.equal(result.currency, 'XRP')
  })

  it('parses currency_rlusd_request', () => {
    const result = parseButtonInteraction('currency_rlusd_request')
    assert.equal(result.action, 'currency_request')
    assert.equal(result.currency, 'RLUSD')
  })

  it('parses currency_usdc_send', () => {
    const result = parseButtonInteraction('currency_usdc_send')
    assert.equal(result.action, 'currency_send')
    assert.equal(result.currency, 'USDC')
  })

  it('parses recipient_ types', () => {
    for (const type of ['phone', 'address', 'username'] as const) {
      const result = parseButtonInteraction(`recipient_${type}`)
      assert.equal(result.action, 'recipient_type_selected')
      assert.equal(result.recipientType, type)
    }
  })

  it('parses confirm_send_ with transactionId', () => {
    const result = parseButtonInteraction('confirm_send_abc123')
    assert.equal(result.action, 'confirm_send')
    assert.equal(result.transactionId, 'abc123')
  })

  it('parses cancel_send_ with transactionId', () => {
    const result = parseButtonInteraction('cancel_send_xyz789')
    assert.equal(result.action, 'cancel_send')
    assert.equal(result.transactionId, 'xyz789')
  })

  it('parses approve_ with requestId', () => {
    const result = parseButtonInteraction('approve_req42')
    assert.equal(result.action, 'approve')
    assert.equal(result.requestId, 'req42')
  })

  it('parses reject_ with requestId', () => {
    const result = parseButtonInteraction('reject_req99')
    assert.equal(result.action, 'reject')
    assert.equal(result.requestId, 'req99')
  })

  it('parses amount_ as float', () => {
    const result = parseButtonInteraction('amount_12.5')
    assert.equal(result.action, 'amount_selected')
    assert.equal(result.amount, 12.5)
  })

  it('parses amount_0 as 0', () => {
    const result = parseButtonInteraction('amount_0')
    assert.equal(result.action, 'amount_selected')
    assert.equal(result.amount, 0)
  })
})

describe('isXRPLAddress', () => {
  it('accepts valid XRPL addresses', () => {
    assert.ok(isXRPLAddress('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'))
    assert.ok(isXRPLAddress('rHb9CJAWyB4rj91VRWn96DkukG4bwdtyTh'))
    assert.ok(isXRPLAddress('r9cZA1mLK5R5Am25ArfXFmqgNwjZgnfk59'))
  })

  it('rejects invalid XRPL addresses', () => {
    assert.equal(isXRPLAddress(''), false)
    assert.equal(isXRPLAddress('0x1234567890abcdef'), false)
    assert.equal(isXRPLAddress('notanaddress'), false)
    assert.equal(isXRPLAddress('r'), false)
  })
})

describe('isPhoneNumber', () => {
  it('accepts valid phone numbers', () => {
    assert.ok(isPhoneNumber('+237612345678'))
    assert.ok(isPhoneNumber('+12025551234'))
    assert.ok(isPhoneNumber('237612345678'))
  })

  it('rejects invalid phone numbers', () => {
    assert.equal(isPhoneNumber(''), false)
    assert.equal(isPhoneNumber('abc'), false)
    assert.equal(isPhoneNumber('+'), false)
    assert.equal(isPhoneNumber('0612345678'), false) // leading zero
  })
})

describe('isUsername', () => {
  it('accepts @name.sasa format', () => {
    assert.ok(isUsername('@john.sasa'))
    assert.ok(isUsername('@alice.sasa'))
  })

  it('rejects non-sasa usernames', () => {
    assert.equal(isUsername('john.sasa'), false)      // no @
    assert.equal(isUsername('@john.eth'), false)      // wrong TLD
    assert.equal(isUsername('@john'), false)          // no TLD
    assert.equal(isUsername(''), false)
  })
})

describe('validateAmount', () => {
  it('accepts positive amounts within limit', () => {
    assert.ok(validateAmount(1))
    assert.ok(validateAmount(0.01))
    assert.ok(validateAmount(1000000))
    assert.ok(validateAmount(500.5))
  })

  it('rejects zero and negative amounts', () => {
    assert.equal(validateAmount(0), false)
    assert.equal(validateAmount(-1), false)
  })

  it('rejects amounts above 1000000', () => {
    assert.equal(validateAmount(1000001), false)
  })

  it('rejects NaN', () => {
    assert.equal(validateAmount(Number.NaN), false)
  })
})
