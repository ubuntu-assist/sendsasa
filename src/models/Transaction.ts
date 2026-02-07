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

export const Transaction = mongoose.model<ITransaction>(
  'Transaction',
  TransactionSchema,
)
