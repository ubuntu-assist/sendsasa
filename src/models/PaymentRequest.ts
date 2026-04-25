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

  currency: {
    type: String,
    enum: ['XRP', 'RLUSD', 'USDC', 'BNB', 'USDT', 'USDC_BSC', 'SOL', 'USDC_SOL', 'USDT_SOL', 'EURC_SOL'],
    default: 'XRP',
    required: true,
    index: true,
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
    default: function () {
      return new Date(Date.now() + 24 * 60 * 60 * 1000)
    },
  },
  completedAt: {
    type: Date,
  },
})

PaymentRequestSchema.index({ requesterAddress: 1, status: 1, createdAt: -1 })
PaymentRequestSchema.index({ payerAddress: 1, status: 1, createdAt: -1 })
PaymentRequestSchema.index({ status: 1, expiresAt: 1 })
PaymentRequestSchema.index({ requestId: 1, status: 1 })
PaymentRequestSchema.index({ currency: 1, status: 1 })

PaymentRequestSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 604800 })

PaymentRequestSchema.pre('save', async function () {
  if (this.status === 'pending' && this.expiresAt < new Date()) {
    this.status = 'expired'
  }
})

export const PaymentRequest = mongoose.model<IPaymentRequest>(
  'PaymentRequest',
  PaymentRequestSchema,
)
