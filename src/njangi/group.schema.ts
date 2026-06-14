import mongoose from 'mongoose'
import { GroupStatus } from '../types'

const GroupSchema = new mongoose.Schema(
  {
    shortCode: { type: String, unique: true, required: true },
    type: { type: String, enum: ['NJANGI', 'SPLITCHAT'], required: true },
    adminPhone: { type: String, required: true },
    name: { type: String, required: true },
    contributionAmount: { type: Number, required: true },
    currency: { type: String, default: 'XAF' },
    fee: { type: Number, required: true },
    cycleDurationDays: { type: Number },
    totalCycles: { type: Number },
    currentCycle: { type: Number, default: 0 },
    currentRecipientPhone: { type: String },
    payoutOrder: {
      type: String,
      enum: ['sequential', 'random', 'admin_choice'],
      default: 'sequential',
    },
    targetAmount: { type: Number },
    targetParticipants: { type: Number },
    deadline: { type: Date },
    status: {
      type: String,
      enum: Object.values(GroupStatus),
      default: GroupStatus.SETUP,
    },
    pawapayPayoutId: { type: String, sparse: true },
  },
  { timestamps: true },
)

GroupSchema.index({ pawapayPayoutId: 1 }, { sparse: true })
GroupSchema.index({ adminPhone: 1 })

export const Group = mongoose.model('Group', GroupSchema)
