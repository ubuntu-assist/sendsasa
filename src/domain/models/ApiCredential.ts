import mongoose, { Schema, Document } from 'mongoose'
import { encryptSeed, decryptSeed } from '@common/utils/encryption'

export type CredentialProvider = 'coinbase'

export interface IApiCredential extends Document {
  provider: CredentialProvider
  label: string             // e.g. "Coinbase Onramp Production"
  apiKeyName: string        // CDP key name — NOT secret, stored plain
  apiSecret: string         // EC private key PEM — always stored encrypted
  webhookSecret?: string    // webhook signing secret — always stored encrypted
  projectId?: string        // optional CDP project ID — stored plain
  isActive: boolean
  createdAt: Date
  updatedAt: Date

  // Helpers — never read raw fields directly
  getApiSecret(): string
  getWebhookSecret(): string | undefined
}

const ApiCredentialSchema = new Schema<IApiCredential>(
  {
    provider: {
      type: String,
      enum: ['coinbase'],
      required: true,
      unique: true,   // one active credential per provider
    },
    label: { type: String, required: true },
    apiKeyName: { type: String, required: true },     // plain — not secret
    apiSecret: { type: String, required: true },      // encrypted
    webhookSecret: { type: String },                  // encrypted
    projectId: { type: String },                      // plain
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
)

// ── Auto-encrypt on save ─────────────────────────────────────────────────────
// We detect already-encrypted values by the "iv:ciphertext" colon format.

ApiCredentialSchema.pre('save', async function () {
  if (this.isModified('apiSecret') && this.apiSecret && !this.apiSecret.includes(':')) {
    this.apiSecret = encryptSeed(this.apiSecret)
  }
  if (this.isModified('webhookSecret') && this.webhookSecret && !this.webhookSecret.includes(':')) {
    this.webhookSecret = encryptSeed(this.webhookSecret)
  }
})

// ── Decrypt helpers ──────────────────────────────────────────────────────────

ApiCredentialSchema.methods.getApiSecret = function (): string {
  return decryptSeed(this.apiSecret)
}

ApiCredentialSchema.methods.getWebhookSecret = function (): string | undefined {
  return this.webhookSecret ? decryptSeed(this.webhookSecret) : undefined
}

// Never leak encrypted blobs in JSON responses
ApiCredentialSchema.set('toJSON', {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  transform: (_doc: any, ret: any) => {
    delete ret.apiSecret
    delete ret.webhookSecret
    return ret
  },
})

export const ApiCredential = mongoose.model<IApiCredential>('ApiCredential', ApiCredentialSchema)
