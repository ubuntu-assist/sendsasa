import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import { createApp } from '../../app.js'

const app = createApp()

describe('GET /pay/card', () => {
  it('returns 400 when ref query parameter is missing', async () => {
    const res = await request(app).get('/pay/card')
    assert.equal(res.status, 400)
    assert.ok(res.text.includes('Missing payment reference'))
  })

  // WebView detection exits before the DB lookup — purely stateless paths.
  const WEBVIEW_CASES: Array<[string, string]> = [
    [
      'WhatsApp iOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) WhatsApp/22.3.74 Mobile/15E148 Safari/604.1',
    ],
    [
      'Instagram iOS (FBIOS)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FBIOS/216.0.0.27 Mobile/15E148 Safari/604.1',
    ],
    [
      'Facebook (FBAN)',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0) AppleWebKit/605.1.15 FBAN/FBIOS;FBDV/iPhone12,1;FBMD/iPhone',
    ],
    [
      'Instagram Android',
      'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 Instagram/216.0.0.27 Mobile Safari/537.36',
    ],
    [
      'Line messenger',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 Line/12.0.0 Mobile Safari/604.1',
    ],
    [
      'Android WebView (wv flag)',
      'Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/90.0.4430.91 Mobile Safari/537.36; wv',
    ],
  ]

  for (const [label, ua] of WEBVIEW_CASES) {
    it(`serves "open in browser" HTML for ${label}`, async () => {
      const res = await request(app)
        .get('/pay/card?ref=test-ref-123')
        .set('User-Agent', ua)
      assert.equal(res.status, 200)
      assert.ok(
        res.headers['content-type']?.includes('text/html'),
        'expected HTML response',
      )
      assert.ok(
        res.text.includes('Open in Browser'),
        `expected "Open in Browser" text in response for ${label}`,
      )
    })
  }

  it('"open in browser" page includes a link back to the original URL', async () => {
    const res = await request(app)
      .get('/pay/card?ref=abc-999')
      .set('User-Agent', 'WhatsApp/22.0 Mobile')
    assert.ok(res.text.includes('abc-999'), 'page should reference the ref param')
  })
})

describe('POST /pay/card/events', () => {
  // Route sends res.status(204).end() before any async processing — always 204.

  it('always returns 204', async () => {
    const res = await request(app)
      .post('/pay/card/events')
      .send({ ref: 'test-ref', eventName: 'onramp_api.load_success' })
    assert.equal(res.status, 204)
  })

  it('returns 204 when ref is missing (early exit)', async () => {
    const res = await request(app)
      .post('/pay/card/events')
      .send({ eventName: 'onramp_api.load_success' })
    assert.equal(res.status, 204)
  })

  it('returns 204 when eventName is missing (early exit)', async () => {
    const res = await request(app)
      .post('/pay/card/events')
      .send({ ref: 'test-ref' })
    assert.equal(res.status, 204)
  })

  it('returns 204 for an empty body', async () => {
    const res = await request(app).post('/pay/card/events').send({})
    assert.equal(res.status, 204)
  })

  // These event types log only — no DB access, safe to test.
  const SAFE_EVENTS = [
    'onramp_api.load_pending',
    'onramp_api.load_success',
    'onramp_api.cancel',
    'onramp_api.commit_success',
    'onramp_api.polling_start',
  ]

  for (const eventName of SAFE_EVENTS) {
    it(`returns 204 for ${eventName} (log-only event, no DB)`, async () => {
      const res = await request(app)
        .post('/pay/card/events')
        .send({ ref: 'test-ref', eventName })
      assert.equal(res.status, 204)
    })
  }
})
