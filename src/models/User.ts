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
  encryptedSeed: {
    type: String,
    required: true,
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
})

UserSchema.index({ phoneNumber: 1, xrplAddress: 1 })
UserSchema.index({ whatsappId: 1, lastActive: -1 })
UserSchema.index({ username: 1 }, { unique: true })
UserSchema.index({ pinLockedUntil: 1 })

UserSchema.pre('save', async function () {
  this.lastActive = new Date()
})

export const User = mongoose.model<IUser>('User', UserSchema)
