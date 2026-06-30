import { body, validationResult } from 'express-validator'
import { Request, Response, NextFunction } from 'express'
import { ValidationError } from './error-handler'

export const validateWebhook = [
  body('object').equals('whatsapp_business_account'),
  body('entry').isArray(),
  (req: Request, _res: Response, next: NextFunction) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
      throw new ValidationError('Invalid webhook payload')
    }
    next()
  },
]

export function validatePhoneNumber(phoneNumber: string): boolean {
  // E.164 format: +[country code][number]
  const phoneRegex = /^\+\d{10,15}$/
  return phoneRegex.test(phoneNumber)
}

export function validateXRPLAddress(address: string): boolean {
  const addressRegex = /^r[a-zA-Z0-9]{24,34}$/
  return addressRegex.test(address)
}

export function validateAmount(amount: number): boolean {
  return !Number.isNaN(amount) && amount > 0 && amount <= 1000000
}

export function sanitizeMessage(message: string): string {
  return message.trim().substring(0, 1000) // Max 1000 chars
}

export function validateSeed(seed: string): boolean {
  // XRPL seed format: sXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
  const seedRegex = /^s[a-zA-Z0-9]{28,29}$/
  return seedRegex.test(seed)
}
