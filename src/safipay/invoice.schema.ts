import mongoose from 'mongoose'
import { InvoiceStatus } from '../types'

const InvoiceSchema = new mongoose.Schema(
  {
    shortCode: { type: String, unique: true, required: true },
    merchantPhone: { type: String, required: true },
    clientPhone: { type: String, required: true },
    clientName: { type: String },
    description: { type: String, required: true },
    total: { type: Number, required: true },
    currency: { type: String, default: 'XAF' },
    status: {
      type: String,
      enum: Object.values(InvoiceStatus),
      default: InvoiceStatus.DRAFT,
    },
    paymentPageUrl: { type: String },
    pawapayDepositId: { type: String, sparse: true },
    dueDate: { type: Date, required: true },
    paidAt: { type: Date },
    reminderCount: { type: Number, default: 0 },
    lastReminderAt: { type: Date },
  },
  { timestamps: true },
)

InvoiceSchema.index({ merchantPhone: 1 })
InvoiceSchema.index({ clientPhone: 1 })
InvoiceSchema.index({ pawapayDepositId: 1 }, { sparse: true })
InvoiceSchema.index({ status: 1, dueDate: 1 })

export const Invoice = mongoose.model('Invoice', InvoiceSchema)
