import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { ValidationError } from '../../middleware/error-handler.js'
import { usernameService } from '../../services/username.service.js'

// validateUsername is pure — it only throws, never queries the DB.
// isUsername is a simple predicate — no DB either.

describe('validateUsername', () => {
  it('accepts a well-formed username', () => {
    assert.doesNotThrow(() => usernameService.validateUsername('@john.sasa'))
    assert.doesNotThrow(() => usernameService.validateUsername('@alice_99.sasa'))
    assert.doesNotThrow(() => usernameService.validateUsername('@a.b.sasa'))
  })

  it('accepts username without @ prefix', () => {
    assert.doesNotThrow(() => usernameService.validateUsername('john.sasa'))
  })

  it('rejects username without .sasa suffix', () => {
    assert.throws(
      () => usernameService.validateUsername('@john.eth'),
      ValidationError,
    )
  })

  it('rejects base part shorter than 3 characters', () => {
    assert.throws(
      () => usernameService.validateUsername('@ab.sasa'),
      ValidationError,
    )
  })

  it('rejects base part longer than 20 characters', () => {
    const long = 'a'.repeat(21)
    assert.throws(
      () => usernameService.validateUsername(`@${long}.sasa`),
      ValidationError,
    )
  })

  it('accepts base part of exactly 3 characters', () => {
    assert.doesNotThrow(() => usernameService.validateUsername('@abc.sasa'))
  })

  it('accepts base part of exactly 20 characters', () => {
    const exact = 'a'.repeat(20)
    assert.doesNotThrow(() => usernameService.validateUsername(`@${exact}.sasa`))
  })

  it('rejects uppercase letters', () => {
    assert.throws(
      () => usernameService.validateUsername('@John.sasa'),
      ValidationError,
    )
  })

  it('rejects special characters other than _ and .', () => {
    assert.throws(
      () => usernameService.validateUsername('@jo-hn.sasa'),
      ValidationError,
    )
    assert.throws(
      () => usernameService.validateUsername('@jo@hn.sasa'),
      ValidationError,
    )
  })

  it('rejects base starting with a dot', () => {
    assert.throws(
      () => usernameService.validateUsername('@.john.sasa'),
      ValidationError,
    )
  })

  it('rejects base starting with an underscore', () => {
    assert.throws(
      () => usernameService.validateUsername('@_john.sasa'),
      ValidationError,
    )
  })

  it('rejects base ending with a dot', () => {
    assert.throws(
      () => usernameService.validateUsername('@john..sasa'),
      ValidationError,
    )
  })

  it('rejects base ending with an underscore', () => {
    assert.throws(
      () => usernameService.validateUsername('@john_.sasa'),
      ValidationError,
    )
  })

  it('rejects consecutive dots', () => {
    assert.throws(
      () => usernameService.validateUsername('@jo..hn.sasa'),
      ValidationError,
    )
  })

  it('rejects consecutive underscores', () => {
    assert.throws(
      () => usernameService.validateUsername('@jo__hn.sasa'),
      ValidationError,
    )
  })

  it('rejects reserved usernames', () => {
    const reserved = ['admin', 'support', 'system', 'wallet', 'api', 'dev']
    for (const name of reserved) {
      assert.throws(
        () => usernameService.validateUsername(`@${name}.sasa`),
        ValidationError,
        `expected ${name} to be rejected`,
      )
    }
  })
})

describe('isUsername', () => {
  it('returns true for @-prefixed strings', () => {
    assert.ok(usernameService.isUsername('@john.sasa'))
    assert.ok(usernameService.isUsername('@anyone'))
  })

  it('returns true for strings ending with .sasa', () => {
    assert.ok(usernameService.isUsername('john.sasa'))
  })

  it('returns false for plain phone numbers', () => {
    assert.equal(usernameService.isUsername('+237612345678'), false)
  })

  it('returns false for XRPL addresses', () => {
    assert.equal(
      usernameService.isUsername('rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH'),
      false,
    )
  })
})
