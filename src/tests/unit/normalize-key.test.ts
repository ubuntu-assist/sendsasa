import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { normalizePEMKey } from '@common/utils/normalize-key.js'

const HEADER = '-----BEGIN RSA PRIVATE KEY-----'
const FOOTER = '-----END RSA PRIVATE KEY-----'
const BODY = 'MIIEowIBAAKCAQEA1234'

describe('normalizePEMKey', () => {
  it('returns a well-formed PEM key unchanged', () => {
    const pem = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(pem), pem)
  })

  it('trims leading and trailing whitespace', () => {
    const pem = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(`  ${pem}  `), pem)
  })

  it('replaces pipe characters with newlines (Render / Railway format)', () => {
    const piped = `${HEADER}|${BODY}|${FOOTER}`
    const expected = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(piped), expected)
  })

  it('replaces literal \\n escape sequences with real newlines (env var copy-paste format)', () => {
    const escaped = `${HEADER}\\n${BODY}\\n${FOOTER}`
    const expected = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(escaped), expected)
  })

  it('strips surrounding double quotes (some cloud platforms wrap values)', () => {
    const quoted = `"${HEADER}\n${BODY}\n${FOOTER}"`
    const expected = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(quoted), expected)
  })

  it('strips surrounding single quotes', () => {
    const quoted = `'${HEADER}\n${BODY}\n${FOOTER}'`
    const expected = `${HEADER}\n${BODY}\n${FOOTER}`
    assert.equal(normalizePEMKey(quoted), expected)
  })

  it('handles pipe + quote combination', () => {
    const combined = `"${HEADER}|${BODY}|${FOOTER}"`
    const result = normalizePEMKey(combined)
    assert.ok(result.includes('\n'), 'should contain real newlines')
    assert.ok(!result.startsWith('"'), 'should not start with quote')
    assert.ok(!result.endsWith('"'), 'should not end with quote')
  })

  it('does not double-process \\n when pipes are also present', () => {
    // pipe takes priority — the \\n case only applies when pipes are absent
    const piped = `${HEADER}|${BODY}|${FOOTER}`
    const result = normalizePEMKey(piped)
    // Result should have real newlines, not literal \n
    assert.ok(!result.includes(String.raw`\n`))
    assert.ok(result.includes('\n'))
  })
})
