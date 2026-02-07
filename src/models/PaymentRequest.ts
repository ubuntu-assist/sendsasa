import mongoose, { Schema } from 'mongoose'
import { IPaymentRequest } from '../types'

const PaymentRequestSchema = new Schema<IPaymentRequest>({
  requestId: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  requesterAddress: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  requesterPhone: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  payerAddress: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  payerPhone: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  message: {
    type: String,
    trim: true,
    maxlength: 200,
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'expired', 'failed'],
    default: 'pending',
    index: true,
  },
  txHash: {
    type: String,
    trim: true,
    index: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: true,
    default: function () {
      return new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
  },
  completedAt: {
    type: Date,
  },
})

PaymentRequestSchema.pre('save', async function () {
  if (this.status === 'pending' && this.expiresAt < new Date()) {
    this.status = 'expired'
  }
})

export const PaymentRequest = mongoose.model<IPaymentRequest>(
  'PaymentRequest',
  PaymentRequestSchema,
)
