import mongoose from 'mongoose'

const GroupMemberSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Group',
    required: true,
  },
  phone: { type: String, required: true },
  displayName: { type: String },
  rotationPosition: { type: Number },
  hasPaidCurrentCycle: { type: Boolean, default: false },
  paidAt: { type: Date },
  pawapayDepositId: { type: String, sparse: true },
  totalContributed: { type: Number, default: 0 },
  totalReceived: { type: Number, default: 0 },
  cyclesPaid: { type: Number, default: 0 },
  joinedAt: { type: Date, default: Date.now },

  // Cross-border fields
  railType: { type: String, enum: ['pawapay', 'stellar'], default: 'pawapay' },
  sep24TransactionId: { type: String },
  sep24UsdcAmount: { type: Number },
})

GroupMemberSchema.index({ groupId: 1, phone: 1 }, { unique: true })
GroupMemberSchema.index({ pawapayDepositId: 1 }, { sparse: true })
GroupMemberSchema.index({ sep24TransactionId: 1 }, { sparse: true })

export const GroupMember = mongoose.model('GroupMember', GroupMemberSchema)
