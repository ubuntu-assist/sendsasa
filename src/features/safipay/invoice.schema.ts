import mongoose from 'mongoose'
import { InvoiceStatus } from '@app/types'

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
    sep24TransactionId: { type: String, sparse: true },
    tempoSep24Id: { type: String, sparse: true },
    sep31TransactionId: { type: String, sparse: true },
    stellarDepositTxHash: { type: String, sparse: true },
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
InvoiceSchema.index({ tempoSep24Id: 1 }, { sparse: true })
InvoiceSchema.index({ sep31TransactionId: 1 }, { sparse: true })
InvoiceSchema.index({ status: 1, dueDate: 1 })

export const Invoice = mongoose.model('Invoice', InvoiceSchema)
