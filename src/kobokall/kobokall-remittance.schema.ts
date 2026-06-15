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
    status: {
      type: String,
      enum: ['INITIATED', 'PROCESSING', 'DEPOSIT_CONFIRMED', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'INITIATED',
    },
    depositId: { type: String, sparse: true },
    payoutId: { type: String, sparse: true },
    failureCode: { type: String },
  },
  { timestamps: true },
)

LocalTransferSchema.index({ transferId: 1 })
LocalTransferSchema.index({ depositId: 1 }, { sparse: true })
LocalTransferSchema.index({ payoutId: 1 }, { sparse: true })

export const LocalTransfer = mongoose.model('LocalTransfer', LocalTransferSchema)
