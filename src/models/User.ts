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
})

UserSchema.pre('save', async function () {
  this.lastActive = new Date()
})

export const User = mongoose.model<IUser>('User', UserSchema)
