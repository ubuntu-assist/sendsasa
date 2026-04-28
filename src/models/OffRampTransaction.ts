import mongoose, { Schema, Document } from 'mongoose'
import type { MobileMoneyProvider } from '../services/mobile-money.service'

export type OffRampStatus =
  | 'pending'           // created, crypto transfer not yet sent
  | 'crypto_sent'       // on-chain tx submitted
  | 'crypto_confirmed'  // on-chain tx confirmed in admin wallet
  | 'payout_initiated'  // Mobile Money API called
  | 'completed'         // MM confirmed delivery
  | 'failed'            // failed at any stage

export interface IOffRampTransaction extends Document {
  // Sender
  senderPhone: string
  senderAddress: string        // user's on-chain address (XRPL, EVM, or Solana)

  // Crypto side
  cryptoAmount: number
  cryptoCurrency: string       // XRP | RLUSD | USDC | USDT
  cryptoChain: string          // xrpl | bsc | solana
  adminAddress: string         // which admin wallet received
  cryptoTxHash?: string        // on-chain hash of the transfer

  // FX / quote (snapshot at time of transaction)
  cryptoAmountUSD: number
  fixerRate: number            // raw Fixer.io USD/XAF at time of tx
  sendSasaRate: number         // after spread
  feeXAF: number

  // Payout side
  recipientPhone: string       // Mobile Money number (E.164)
  mmProvider: MobileMoneyProvider
  xafAmount: number            // XAF sent to recipient
  mmTxId?: string              // provider's transaction ID

  // Lifecycle
  status: OffRampStatus
  failureReason?: string
  createdAt: Date
  completedAt?: Date
}

const OffRampTransactionSchema = new Schema<IOffRampTransaction>({
  senderPhone: { type: String, required: true, index: true, trim: true },
  senderAddress: { type: String, required: true, trim: true },

  cryptoAmount: { type: Number, required: true, min: 0 },
  cryptoCurrency: { type: String, required: true, trim: true },
  cryptoChain: { type: String, required: true, trim: true },
  adminAddress: { type: String, required: true, trim: true },
  cryptoTxHash: { type: String, sparse: true, trim: true },

  cryptoAmountUSD: { type: Number, required: true },
  fixerRate: { type: Number, required: true },
  sendSasaRate: { type: Number, required: true },
  feeXAF: { type: Number, required: true },

  recipientPhone: { type: String, required: true, index: true, trim: true },
  mmProvider: {
    type: String,
    enum: ['mtn', 'orange', 'uba'],
    required: true,
  },
  xafAmount: { type: Number, required: true },
  mmTxId: { type: String, sparse: true, trim: true },

  status: {
    type: String,
    enum: ['pending', 'crypto_sent', 'crypto_confirmed', 'payout_initiated', 'completed', 'failed'],
    default: 'pending',
    index: true,
  },
  failureReason: { type: String },

  createdAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date },
})

OffRampTransactionSchema.index({ senderPhone: 1, createdAt: -1 })
OffRampTransactionSchema.index({ status: 1, createdAt: -1 })


export const OffRampTransaction = mongoose.model<IOffRampTransaction>(
  'OffRampTransaction',
  OffRampTransactionSchema,
)
