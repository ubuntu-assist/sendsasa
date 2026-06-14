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
})

GroupMemberSchema.index({ groupId: 1, phone: 1 }, { unique: true })
GroupMemberSchema.index({ pawapayDepositId: 1 }, { sparse: true })

export const GroupMember = mongoose.model('GroupMember', GroupMemberSchema)
