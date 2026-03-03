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
    // AES-256 encrypted seed
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
    index: true,
    trim: true,
    lowercase: true,
    // Format: @name.sasa
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
})

UserSchema.pre('save', async function () {
  this.lastActive = new Date()
})

export const User = mongoose.model<IUser>('User', UserSchema)
