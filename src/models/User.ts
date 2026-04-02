import mongoose, { Schema } from 'mongoose'
import { IUser } from '../types'

const UserSchema = new Schema<IUser>({
  whatsappId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  phoneNumber: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  xrplAddress: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  // Legacy field — kept for migration period; empty string for Web3Auth users
  encryptedSeed: {
    type: String,
    default: '',
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  lastActive: {
    type: Date,
    default: Date.now,
    index: true,
  },

  pinHash: {
    type: String,
    required: true,
  },
  pinAttempts: {
    type: Number,
    default: 0,
  },
  pinLockedUntil: {
    type: Date,
  },
  pinLastChanged: {
    type: Date,
    default: Date.now,
  },

  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  usernameLastChanged: {
    type: Date,
  },

  recoveryCodeHash: {
    type: String,
  },
  recoveryCodeExpiry: {
    type: Date,
  },

  preferredCurrency: {
    type: String,
    enum: ['XRP', 'RLUSD', 'USDC'],
    default: 'XRP',
  },

  rlusdTrustLineCreated: {
    type: Boolean,
    default: false,
  },
  rlusdTrustLineHash: {
    type: String,
  },

  usdcTrustLineCreated: {
    type: Boolean,
    default: false,
  },
  usdcTrustLineHash: {
    type: String,
  },

  // Web3Auth wallet fields (populated during migration / new user creation)
  web3auth_verifier: {
    type: String,
    default: 'sendsasa-whatsapp',
  },
  web3auth_verifier_id: {
    type: String,
    unique: true,
    sparse: true,
  },
  evm_address: {
    type: String,
    index: true,
    sparse: true,
  },
  xrpl_address: {
    type: String,
    index: true,
    sparse: true,
  },
  wallet_created_at: {
    type: Date,
  },
  migration_status: {
    type: String,
    enum: ['pending', 'completed', 'n/a'],
    default: 'n/a',
  },
  old_wallet_exists: {
    type: Boolean,
    default: false,
  },
})

UserSchema.index({ phoneNumber: 1, xrplAddress: 1 })
UserSchema.index({ whatsappId: 1, lastActive: -1 })
UserSchema.index({ username: 1 }, { unique: true })
UserSchema.index({ pinLockedUntil: 1 })

UserSchema.pre('save', async function () {
  this.lastActive = new Date()
})

export const User = mongoose.model<IUser>('User', UserSchema)
