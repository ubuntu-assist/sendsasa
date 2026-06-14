import { describe, it, before } from 'node:test'
import assert from 'node:assert/strict'
import request from 'supertest'
import type { Application } from 'express'
import { createApp } from '../../app.test-shim.js'

let app: Application

before(async () => {
  app = await createApp()
})

describe('GET /health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/health')
    assert.equal(res.status, 200)
    assert.equal(res.body.status, 'ok')
  })

  it('includes a valid ISO timestamp', async () => {
    const res = await request(app).get('/health')
    const ts = res.body.timestamp as string
    assert.ok(typeof ts === 'string', 'timestamp should be a string')
    assert.ok(!Number.isNaN(Date.parse(ts)), 'timestamp should be a valid date')
  })

  it('includes uptime as a non-negative number', async () => {
    const res = await request(app).get('/health')
    assert.ok(typeof res.body.uptime === 'number')
    assert.ok(res.body.uptime >= 0)
  })
})
