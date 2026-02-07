import crypto from 'node:crypto'
import config from './config'

const ENCRYPTION_KEY = config.ENCRYPTION_KEY!
const ALGORITHM = 'aes-256-cbc' as const

/**
 * Encrypt a wallet seed for secure storage
 * Uses AES-256-CBC with random IV for each encryption
 */
export function encryptSeed(seed: string): string {
  const iv = crypto.randomBytes(16)
  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  let encrypted = cipher.update(seed, 'utf8', 'hex')
  encrypted += cipher.final('hex')

  return iv.toString('hex') + ':' + encrypted
}

/**
 * Decrypt a wallet seed from storage
 * Extracts IV and uses it with the key to decrypt
 */
export function decryptSeed(encryptedSeed: string): string {
  const parts = encryptedSeed.split(':')

  if (parts.length !== 2) {
    throw new Error('Invalid encrypted seed format')
  }

  const iv = Buffer.from(parts[0], 'hex')
  const encrypted = parts[1]

  const key = crypto.createHash('sha256').update(ENCRYPTION_KEY).digest()

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)

  let decrypted = decipher.update(encrypted, 'hex', 'utf8')
  decrypted += decipher.final('utf8')

  return decrypted
}
