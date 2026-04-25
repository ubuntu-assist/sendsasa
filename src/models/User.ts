import mongoose, { Schema } from 'mongoose'
import { IUser } from '../types'

const BeneficiarySchema = new Schema(
  {
    id: { type: String, required: true },
    nickname: { type: String, required: true, trim: true, maxlength: 30 },
    phoneNumber: { type: String, required: true, trim: true },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false },
)

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
  solana_address: {
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
  fund_migration_at: {
    type: Date,
  },
  beneficiaries: {
    type: [BeneficiarySchema],
    default: [],
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
