import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../../app.js'

// The Coinbase webhook route is mounted with express.raw() and responds
// res.status(200).json({ received: true }) before doing any async work.
// Paths without a valid x-hook0-signature exit before touching the DB.

const app = createApp()

describe('POST /webhook/coinbase', () => {
  it('always returns 200 with { received: true }', async () => {
    const res = await request(app)
      .post('/webhook/coinbase')
      .set('Content-Type', 'application/json')
      .send('{}')
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })
  })

  it('returns 200 and exits early when x-hook0-signature header is absent', async () => {
    const res = await request(app)
      .post('/webhook/coinbase')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ eventType: 'onramp.transaction.success' }))
    assert.equal(res.status, 200)
    assert.deepEqual(res.body, { received: true })
  })

  it('returns 200 for an arbitrary body with no signature', async () => {
    const res = await request(app)
      .post('/webhook/coinbase')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify({ arbitrary: 'payload', nested: { value: 42 } }))
    assert.equal(res.status, 200)
  })

  it('response body is always the same acknowledgement object', async () => {
    const payloads = ['{}', '{"eventType":"unknown"}', '{"data":null}']
    for (const payload of payloads) {
      const res = await request(app)
        .post('/webhook/coinbase')
        .set('Content-Type', 'application/json')
        .send(payload)
      assert.deepEqual(res.body, { received: true }, `unexpected body for payload: ${payload}`)
    }
  })
})
