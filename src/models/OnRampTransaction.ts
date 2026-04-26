import mongoose, { Schema, Document } from 'mongoose'
import type { MobileMoneyProvider } from '../services/mobile-money.service'

export type OnRampStatus =
  | 'pending'            // session created, awaiting card payment
  | 'payment_received'   // Coinbase webhook confirmed USDC arrived
  | 'payout_initiated'   // Mobile Money API called
  | 'completed'          // MM confirmed delivery
  | 'expired'            // session expired (5-min Coinbase token timeout), no payment received
  | 'failed'             // payout failed

export interface IOnRampTransaction extends Document {
  // Who initiated (WhatsApp user in the US)
  senderPhone: string

  // Payout target
  recipientPhone: string
  mmProvider: MobileMoneyProvider

  // Amounts
  usdAmount: number           // USDC that arrives in admin wallet (what the recipient's $100 becomes)
  cardFeePct: number          // e.g. 3.99
  cardFeeUSD: number          // usdAmount * cardFeePct / 100
  totalUSDCharged: number     // usdAmount + cardFeeUSD (what the user's card is charged)
  xafAmount: number           // XAF sent to recipient
  fixerRate: number           // raw Fixer.io USD/XAF at quote time
  sendSasaRate: number        // after 0.5% spread
  feeXAF: number              // SendSasa fee in XAF

  // Coinbase transaction ID (from webhook)
  coinbaseTxId?: string

  // Headless onramp fields
  userEmail?: string
  headlessOrderId?: string
  headlessPaymentMethod?: 'GUEST_CHECKOUT_APPLE_PAY' | 'GUEST_CHECKOUT_GOOGLE_PAY'
  headlessPaymentLinkUrl?: string
  headlessIdempotencyKey?: string

  // Admin wallet that receives USDC
  adminAddress: string           // EVM (Base) address
  cryptoTxHash?: string          // on-chain hash of USDC arriving

  // Lifecycle
  status: OnRampStatus
  failureReason?: string
  createdAt: Date
  completedAt?: Date
}

const OnRampTransactionSchema = new Schema<IOnRampTransaction>({
  senderPhone: { type: String, required: true, index: true, trim: true },

  recipientPhone: { type: String, required: true, index: true, trim: true },
  mmProvider: { type: String, enum: ['mtn', 'orange', 'uba'], required: true },

  usdAmount: { type: Number, required: true, min: 0 },
  cardFeePct: { type: Number, required: true, default: 3.99 },
  cardFeeUSD: { type: Number, required: true, min: 0 },
  totalUSDCharged: { type: Number, required: true, min: 0 },
  xafAmount: { type: Number, required: true },
  fixerRate: { type: Number, required: true },
  sendSasaRate: { type: Number, required: true },
  feeXAF: { type: Number, required: true },

  coinbaseTxId: { type: String, sparse: true, trim: true },

  userEmail: { type: String, sparse: true, trim: true },
  headlessOrderId: { type: String, sparse: true, trim: true },
  headlessPaymentMethod: { type: String, enum: ['GUEST_CHECKOUT_APPLE_PAY', 'GUEST_CHECKOUT_GOOGLE_PAY'] },
  headlessPaymentLinkUrl: { type: String, trim: true },
  headlessIdempotencyKey: { type: String, sparse: true, trim: true },

  adminAddress: { type: String, required: true, trim: true },
  cryptoTxHash: { type: String, sparse: true, trim: true },

  status: {
    type: String,
    enum: ['pending', 'payment_received', 'payout_initiated', 'completed', 'expired', 'failed'],
    default: 'pending',
    index: true,
  },
  failureReason: { type: String },

  createdAt: { type: Date, default: Date.now, index: true },
  completedAt: { type: Date },
})

OnRampTransactionSchema.index({ senderPhone: 1, createdAt: -1 })
OnRampTransactionSchema.index({ status: 1, createdAt: -1 })
OnRampTransactionSchema.index({ coinbaseTxId: 1 }, { sparse: true })

export const OnRampTransaction = mongoose.model<IOnRampTransaction>(
  'OnRampTransaction',
  OnRampTransactionSchema,
)
