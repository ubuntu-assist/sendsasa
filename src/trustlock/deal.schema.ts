import mongoose from 'mongoose'
import { DealStatus } from '../types'

const DealSchema = new mongoose.Schema(
  {
    shortCode:         { type: String, unique: true, required: true },
    buyerPhone:        { type: String, required: true },
    sellerPhone:       { type: String, required: true },
    title:             { type: String, required: true },
    description:       { type: String },
    category:          { type: String, required: true },
    amount:            { type: Number, required: true },
    fee:               { type: Number, required: true },
    amountToSeller:    { type: Number, required: true },
    status:            {
      type: String,
      enum: Object.values(DealStatus),
      default: DealStatus.PENDING_PAYMENT,
    },
    pawapayDepositId:  { type: String, sparse: true },
    pawapayPayoutId:   { type: String, sparse: true },
    pawapayRefundId:   { type: String, sparse: true },
    expiresAt:         { type: Date, required: true },
    completedAt:       { type: Date },
  },
  { timestamps: true },
)

DealSchema.index({ pawapayDepositId: 1 }, { sparse: true })
DealSchema.index({ pawapayPayoutId: 1 }, { sparse: true })
DealSchema.index({ pawapayRefundId: 1 }, { sparse: true })
DealSchema.index({ buyerPhone: 1 })
DealSchema.index({ sellerPhone: 1 })

export const Deal = mongoose.model('Deal', DealSchema)
