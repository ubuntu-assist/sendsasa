import mongoose from 'mongoose'
import { PayrollStatus } from '../types'

const PayrollItemSchema = new mongoose.Schema(
  {
    recipientPhone: { type: String, required: true },
    recipientName: { type: String },
    amount: { type: Number, required: true },
    provider: { type: String },
    status: {
      type: String,
      enum: ['PENDING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    pawapayPayoutId: { type: String },
    failureReason: { type: String },
    paidAt: { type: Date },
  },
  { _id: false },
)

const PayrollSchema = new mongoose.Schema(
  {
    shortCode: { type: String, unique: true, required: true },
    employerPhone: { type: String, required: true },
    name: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    fee: { type: Number, required: true },
    recipientCount: { type: Number, required: true },
    paidCount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: Object.values(PayrollStatus),
      default: PayrollStatus.DRAFT,
    },
    items: [PayrollItemSchema],
  },
  { timestamps: true },
)

PayrollSchema.index({ employerPhone: 1 })
PayrollSchema.index({ 'items.pawapayPayoutId': 1 }, { sparse: true })

export const Payroll = mongoose.model('Payroll', PayrollSchema)
