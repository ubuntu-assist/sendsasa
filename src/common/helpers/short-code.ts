import crypto from 'node:crypto'

export function generateShortCode(): string {
  return crypto.randomBytes(3).toString('hex').toUpperCase()
}
