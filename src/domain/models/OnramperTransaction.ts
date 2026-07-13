import mongoose, { Schema, Document } from 'mongoose'

export type OnramperStatus =
  | 'url_generated'  // user received the link
  | 'new'            // provider created the order
  | 'pending'        // payment processing
  | 'paid'           // payment received, awaiting crypto settlement
  | 'completed'      // USDC landed in user wallet
  | 'failed'
  | 'canceled'

export interface IOnramperTransaction extends Document {
  whatsappId: string
  phoneNumber: string
  walletAddress: string     // user EVM address that receives USDC
  partnerContext: string    // used to look up user in webhook

  onramperTxId?: string     // Onramper's transactionId (set on first webhook)
  onramp?: string           // underlying provider (moonpay, transak, etc.)

  inAmount?: number         // fiat amount user paid
  inCurrency?: string       // e.g. USD, EUR, XAF
  outAmount?: number        // USDC received
  transactionHash?: string  // on-chain hash

  status: OnramperStatus
  failureReason?: string

  createdAt: Date
  completedAt?: Date
}

const schema = new Schema<IOnramperTransaction>({
  whatsappId:     { type: String, required: true, index: true, trim: true },
  phoneNumber:    { type: String, required: true, index: true, trim: true },
  walletAddress:  { type: String, required: true, index: true, trim: true },
  partnerContext: { type: String, required: true, unique: true, trim: true },

  onramperTxId:      { type: String, sparse: true, trim: true },
  onramp:            { type: String, trim: true },

  inAmount:          { type: Number },
  inCurrency:        { type: String, trim: true },
  outAmount:         { type: Number },
  transactionHash:   { type: String, sparse: true, trim: true },

  status: {
    type: String,
    enum: ['url_generated', 'new', 'pending', 'paid', 'completed', 'failed', 'canceled'],
    default: 'url_generated',
    index: true,
  },
  failureReason: { type: String },

  createdAt:   { type: Date, default: Date.now, index: true },
  completedAt: { type: Date },
})

schema.index({ whatsappId: 1, createdAt: -1 })

export const OnramperTransaction = mongoose.model<IOnramperTransaction>(
  'OnramperTransaction',
  schema,
)
