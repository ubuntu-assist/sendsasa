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

const SecurityQuestionSchema = new Schema(
  {
    questionId: { type: String, required: true, trim: true },
    answerHash: { type: String, required: true },
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
  pinSetupComplete: {
    type: Boolean,
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

  securityQuestions: {
    type: [SecurityQuestionSchema],
    default: [],
  },

  pendingPinRecovery: {
    step: { type: Number, enum: [1, 2] },
    expiresAt: { type: Date },
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

  // Web3Auth wallet fields
  web3auth_verifier_id: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  evm_address: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  xrpl_address: {
    type: String,
    required: false,
    unique: true,
    index: true,
    trim: true,
  },
  solana_address: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  wallet_created_at: {
    type: Date,
    required: true,
  },
  beneficiaries: {
    type: [BeneficiarySchema],
    default: [],
  },
  momotrustContext: { type: String },
  momotrustContextUpdatedAt: { type: Date },
})


UserSchema.index({ whatsappId: 1, lastActive: -1 })
UserSchema.index({ pinLockedUntil: 1 })

UserSchema.pre('save', async function () {
  this.lastActive = new Date()
})

export const User = mongoose.model<IUser>('User', UserSchema)
