import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeToE164,
  isE164,
  maskPhone,
} from '@shared/phone-number.service.js'

describe('normalizeToE164', () => {
  it('passes through already-valid E.164 numbers unchanged', () => {
    assert.equal(normalizeToE164('+237612345678'), '+237612345678')
    assert.equal(normalizeToE164('+12025551234'), '+12025551234')
  })

  it('trims whitespace', () => {
    assert.equal(normalizeToE164('  +237612345678  '), '+237612345678')
  })

  it('infers country from default (CM) for local numbers', () => {
    // 9-digit Cameroon mobile without country code
    const result = normalizeToE164('612345678')
    assert.equal(result, '+237612345678')
  })

  it('accepts Cameroon 9x-prefix numbers as valid without repair', () => {
    // libphonenumber already accepts 97... Cameroon numbers — no repair needed
    const result = normalizeToE164('+23797595198')
    assert.ok(result.startsWith('+237'), `expected +237 prefix, got ${result}`)
  })

  it('repairs Mexico legacy numbers (TOO_LONG → remove 1 after +52)', () => {
    // +52 1 XXXXXXXXXX → +52 XXXXXXXXXX
    const result = normalizeToE164('+5214551234567')
    assert.equal(result, '+524551234567')
  })

  it('throws in strict mode for clearly invalid numbers', () => {
    assert.throws(() => normalizeToE164('notaphone', 'CM', { strict: true }))
  })

  it('throws in strict mode for empty string', () => {
    assert.throws(() => normalizeToE164('', 'CM', { strict: true }))
  })

  it('does not throw in lenient mode for WhatsApp-plausible numbers', () => {
    // Lenient mode used for wa_id values from WhatsApp
    assert.doesNotThrow(() => normalizeToE164('+237612345678'))
  })
})

describe('isE164', () => {
  it('returns true for valid E.164 numbers', () => {
    assert.ok(isE164('+237612345678'))
    assert.ok(isE164('+12025551234'))
  })

  it('returns false for numbers without +', () => {
    assert.equal(isE164('237612345678'), false)
  })

  it('returns false for non-numeric characters', () => {
    assert.equal(isE164('+237abc45678'), false)
  })

  it('returns false for too-short numbers', () => {
    assert.equal(isE164('+1234'), false)
  })

  it('returns false for too-long numbers', () => {
    assert.equal(isE164('+1234567890123456'), false)
  })
})

describe('maskPhone', () => {
  it('masks middle digits keeping prefix and last 3', () => {
    assert.equal(maskPhone('+237612345678'), '+23761***678')
  })

  it('returns *** for very short strings', () => {
    assert.equal(maskPhone('+123'), '***')
    assert.equal(maskPhone('12'), '***')
  })

  it('shows exactly 6 chars prefix + *** + 3 chars suffix', () => {
    const result = maskPhone('+12025551234')
    assert.equal(result, '+12025***234')
    assert.equal(result.length, '+12025'.length + 3 + '234'.length)
  })
})
