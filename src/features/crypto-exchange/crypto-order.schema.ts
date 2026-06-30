import { Schema, model, Document } from 'mongoose'

export type CryptoOrderStatus = 'PENDING' | 'EXECUTING' | 'COMPLETED' | 'FAILED'
export type CryptoChain = 'xrpl' | 'bsc' | 'solana' | 'stellar'
export type CryptoDirection = 'SWAP' | 'SELL'

export interface ICryptoOrder extends Document {
  shortCode: string
  userPhone: string
  direction: CryptoDirection
  fromAsset: string
  toAsset: string
  fromChain: CryptoChain
  toChain: CryptoChain
  fromAmount: string
  toAmount: string
  status: CryptoOrderStatus
  txHash?: string
  bridgeTxHash?: string
  momoProvider?: string
  errorMessage?: string
  createdAt: Date
  updatedAt: Date
}

const CryptoOrderSchema = new Schema<ICryptoOrder>(
  {
    shortCode: { type: String, required: true, unique: true, index: true },
    userPhone: { type: String, required: true, index: true },
    direction: { type: String, enum: ['SWAP', 'SELL'], required: true },
    fromAsset: { type: String, required: true },
    toAsset: { type: String, required: true },
    fromChain: { type: String, required: true },
    toChain: { type: String, required: true },
    fromAmount: { type: String, required: true },
    toAmount: { type: String, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'EXECUTING', 'COMPLETED', 'FAILED'],
      default: 'PENDING',
    },
    txHash: { type: String },
    bridgeTxHash: { type: String },
    momoProvider: { type: String },
    errorMessage: { type: String },
  },
  { timestamps: true },
)

export const CryptoOrder = model<ICryptoOrder>('CryptoOrder', CryptoOrderSchema)
