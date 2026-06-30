import { describe, it } from 'node:test'
import assert from 'node:assert/strict'

// Must be set before requiring the encryption module.
// Static imports are hoisted (CJS require order), so we use an inline
// require() below — it runs after this assignment, guaranteeing the key
// is available when config.ts reads process.env.ENCRYPTION_KEY.
process.env.ENCRYPTION_KEY ??= 'test-encryption-key-for-unit-tests!!'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { encryptSeed, decryptSeed }: typeof import('@common/utils/encryption') =
  require('../../utils/encryption')

describe('encryptSeed / decryptSeed', () => {
  it('round-trips a simple seed', () => {
    const seed = 'sEdTM1uX8qs4aFcxdpLwR3sBrJxkMHT'
    assert.equal(decryptSeed(encryptSeed(seed)), seed)
  })

  it('round-trips a seed with special characters', () => {
    const seed = 'seed with spaces & symbols: !@#$%^&*()'
    assert.equal(decryptSeed(encryptSeed(seed)), seed)
  })

  it('produces different ciphertexts for the same input (random IV)', () => {
    const seed = 'sEdTM1uX8qs4aFcxdpLwR3sBrJxkMHT'
    const first = encryptSeed(seed)
    const second = encryptSeed(seed)
    assert.notEqual(first, second, 'each encryption should use a fresh random IV')
  })

  it('encrypted output contains two colon-separated hex parts', () => {
    const encrypted = encryptSeed('test-seed')
    const parts = encrypted.split(':')
    assert.equal(parts.length, 2)
    // IV is 16 bytes → 32 hex chars
    assert.equal(parts[0].length, 32)
    assert.match(parts[0], /^[0-9a-f]+$/)
    assert.match(parts[1], /^[0-9a-f]+$/)
  })

  it('throws on malformed encrypted input (missing colon separator)', () => {
    assert.throws(() => decryptSeed('notvalidformat'), /Invalid encrypted seed format/)
  })

  it('throws on tampered ciphertext', () => {
    const encrypted = encryptSeed('original-seed')
    const [iv, cipher] = encrypted.split(':')
    const tampered = `${iv}:${'ff'.repeat(cipher.length / 2)}`
    assert.throws(() => decryptSeed(tampered))
  })
})
