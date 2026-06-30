import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import request from 'supertest'
import type { Application } from 'express'
import { createApp } from '../../app.test-shim.js'
import config from '@common/utils/config.js'

// Generate a real RSA-2048 key pair — self-contained, no .env key required.
// The route calls crypto.createPublicKey(pem) at request time, so setting
// config.JWT_PUBLIC_KEY before the first request is sufficient.
const { publicKey: TEST_PUBLIC_KEY } = crypto.generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
})
const TEST_KID = 'test-key-2048'

config.JWT_PUBLIC_KEY = TEST_PUBLIC_KEY
config.JWT_KID = TEST_KID

let app: Application

before(async () => {
  app = await createApp()
})

describe('GET /.well-known/jwks.json', () => {
  it('returns 200 with JSON content-type', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    assert.equal(res.status, 200)
    assert.ok(
      res.headers['content-type']?.includes('application/json'),
      'expected application/json content-type',
    )
  })

  it('response body has a keys array with exactly one entry', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    assert.ok(Array.isArray(res.body.keys), 'keys should be an array')
    assert.equal(res.body.keys.length, 1)
  })

  it('JWK entry has all required RFC 7517 fields', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    const key = res.body.keys[0]
    assert.equal(key.kty, 'RSA')
    assert.equal(key.use, 'sig')
    assert.equal(key.alg, 'RS256')
    assert.equal(key.kid, TEST_KID)
    assert.ok(typeof key.n === 'string' && key.n.length > 0, 'modulus (n) missing')
    assert.ok(typeof key.e === 'string' && key.e.length > 0, 'exponent (e) missing')
  })

  it('public exponent is AQAB (standard RSA e=65537 in base64url)', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    assert.equal(res.body.keys[0].e, 'AQAB')
  })

  it('sets Cache-Control header for public caching', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    const cc = res.headers['cache-control'] as string
    assert.ok(cc?.includes('public'), 'should be publicly cacheable')
    assert.ok(cc?.includes('max-age=3600'), 'should specify max-age of 3600')
  })

  it('modulus round-trips back to the original public key', async () => {
    const res = await request(app).get('/.well-known/jwks.json')
    const jwk = res.body.keys[0]
    // Reconstruct from JWK and compare to the PEM we set on config
    const reconstructed = crypto.createPublicKey({ key: jwk, format: 'jwk' })
    const reconstructedPem = reconstructed.export({ type: 'spki', format: 'pem' }) as string
    assert.equal(reconstructedPem.trim(), TEST_PUBLIC_KEY.trim())
  })
})
