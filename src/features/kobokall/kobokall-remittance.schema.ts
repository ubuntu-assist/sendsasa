import mongoose from 'mongoose'

const LocalTransferSchema = new mongoose.Schema(
  {
    transferId: { type: String, required: true, unique: true },
    senderPhone: { type: String, required: true },
    recipientPhone: { type: String, required: true },
    amount: { type: Number, required: true },
    fee: { type: Number, required: true },
    netAmount: { type: Number, required: true },
    senderOperator: { type: String },
    recipientOperator: { type: String },
    railType: { type: String, enum: ['pawapay', 'stellar'], default: 'pawapay' },
    status: {
      type: String,
      enum: [
        'INITIATED', 'PROCESSING', 'DEPOSIT_CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED',
        'STELLAR_PENDING_ONRAMP', 'STELLAR_ROUTING',
      ],
      default: 'INITIATED',
    },
    depositId: { type: String, sparse: true },
    payoutId: { type: String, sparse: true },
    sep24TransactionId: { type: String, sparse: true },
    sep31TransactionId: { type: String, sparse: true },
    failureCode: { type: String },
  },
  { timestamps: true },
)

LocalTransferSchema.index({ transferId: 1 })
LocalTransferSchema.index({ depositId: 1 }, { sparse: true })
LocalTransferSchema.index({ payoutId: 1 }, { sparse: true })

export const LocalTransfer = mongoose.model('LocalTransfer', LocalTransferSchema)
