import mongoose, { Schema } from 'mongoose'
import { ITransaction } from '../types'

const TransactionSchema = new Schema<ITransaction>({
  txHash: {
    type: String,
    required: true,
    unique: true,
    index: true,
    trim: true,
  },
  fromAddress: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  toAddress: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  fromPhone: {
    type: String,
    trim: true,
    index: true,
  },
  toPhone: {
    type: String,
    trim: true,
    index: true,
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

  status: {
    type: String,
    enum: ['pending', 'success', 'failed'],
    default: 'pending',
    index: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
})

TransactionSchema.index({ fromAddress: 1, timestamp: -1 })
TransactionSchema.index({ toAddress: 1, timestamp: -1 })
TransactionSchema.index({ status: 1, timestamp: -1 })
TransactionSchema.index({ txHash: 1, status: 1 })
TransactionSchema.index({ currency: 1, timestamp: -1 })

TransactionSchema.index({ fromPhone: 1, toPhone: 1 })

export const Transaction = mongoose.model<ITransaction>(
  'Transaction',
  TransactionSchema,
)
