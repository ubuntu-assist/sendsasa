import rateLimit from 'express-rate-limit'

export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
})

export const webhookLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many webhook requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
})

export const transactionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  message: 'Too many transactions, please wait before trying again.',
  standardHeaders: true,
  legacyHeaders: false,
})

export const publicLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: 'Too many requests, please slow down.',
  standardHeaders: true,
  legacyHeaders: false,
})

// ── Per-user token bucket (WhatsApp message rate limiting) ────────────────────

const BUCKET_CAPACITY = 10
const BUCKET_REFILL_MS = 60_000

interface Bucket {
  tokens: number
  lastRefill: number
}
const userBuckets = new Map<string, Bucket>()

export function consumeUserToken(whatsappId: string): boolean {
  const now = Date.now()
  const bucket = userBuckets.get(whatsappId) ?? {
    tokens: BUCKET_CAPACITY,
    lastRefill: now,
  }

  const elapsed = now - bucket.lastRefill
  bucket.tokens = Math.min(
    BUCKET_CAPACITY,
    bucket.tokens + (elapsed / BUCKET_REFILL_MS) * BUCKET_CAPACITY,
  )
  bucket.lastRefill = now

  if (bucket.tokens < 1) {
    userBuckets.set(whatsappId, bucket)
    return false
  }
  bucket.tokens -= 1
  userBuckets.set(whatsappId, bucket)
  return true
}
