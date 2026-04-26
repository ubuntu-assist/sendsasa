import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp, config } from '../../app.js'

// Patch the singleton config object so the webhook handler sees a known token.
// The handler reads config.VERIFY_TOKEN at call time (not at import time), so
// mutating the property here takes effect before any request is made.
const VERIFY_TOKEN = 'test-verify-token-abc123'
config.VERIFY_TOKEN = VERIFY_TOKEN

const app = createApp()

describe('GET /webhook — WhatsApp hub verification', () => {
  it('returns 200 and echoes the challenge when credentials match', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge_xyz',
    })
    assert.equal(res.status, 200)
    assert.equal(res.text, 'challenge_xyz')
  })

  it('returns 403 when verify token is wrong', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': 'wrong-token',
      'hub.challenge': 'challenge_xyz',
    })
    assert.equal(res.status, 403)
  })

  it('returns 403 when hub.mode is not subscribe', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'unsubscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge_xyz',
    })
    assert.equal(res.status, 403)
  })

  it('returns 403 when hub.mode is missing', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': 'challenge_xyz',
    })
    assert.equal(res.status, 403)
  })

  it('returns 403 when hub.verify_token is missing', async () => {
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.challenge': 'challenge_xyz',
    })
    assert.equal(res.status, 403)
  })

  it('echoes whatever string is passed as the challenge', async () => {
    const challenge = 'some-random-challenge-string-98765'
    const res = await request(app).get('/webhook').query({
      'hub.mode': 'subscribe',
      'hub.verify_token': VERIFY_TOKEN,
      'hub.challenge': challenge,
    })
    assert.equal(res.text, challenge)
  })
})

describe('POST /webhook — message ingestion', () => {
  // The route sends res.sendStatus(200) before any async work, so all paths
  // return 200 to Meta immediately. These tests cover the early-exit paths
  // that return without touching the DB or WhatsApp API.

  it('always returns 200 (fire-and-forget design)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { messages: null, contacts: [] } }] }],
      })
    assert.equal(res.status, 200)
  })

  it('returns 200 for non-WhatsApp object types (early exit)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ object: 'instagram_business_account' })
    assert.equal(res.status, 200)
  })

  it('returns 200 when entry is missing (early exit)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({ object: 'whatsapp_business_account' })
    assert.equal(res.status, 200)
  })

  it('returns 200 when value is missing inside changes (early exit)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{}] }],
      })
    assert.equal(res.status, 200)
  })

  it('returns 200 when messages array is empty (early exit)', async () => {
    const res = await request(app)
      .post('/webhook')
      .send({
        object: 'whatsapp_business_account',
        entry: [{ changes: [{ value: { messages: [], contacts: [] } }] }],
      })
    assert.equal(res.status, 200)
  })

  it('returns 200 for a completely empty body', async () => {
    const res = await request(app).post('/webhook').send({})
    assert.equal(res.status, 200)
  })
})
