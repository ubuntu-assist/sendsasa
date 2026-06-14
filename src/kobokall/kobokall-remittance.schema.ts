import mongoose from 'mongoose'

const KoboKallRemittanceSchema = new mongoose.Schema(
  {
    remittanceId: { type: String, required: true, unique: true },
    senderPhone: { type: String, required: true },
    recipientPhone: { type: String, required: true },
    recipientCountry: { type: String, required: true },
    sendAmount: { type: Number, required: true },
    receiveAmount: { type: Number, required: true },
    receiveCurrency: { type: String, required: true },
    exchangeRate: { type: Number, required: true },
    correspondent: { type: String, required: true },
    status: {
      type: String,
      enum: ['INITIATED', 'PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED'],
      default: 'INITIATED',
    },
    failureCode: String,
  },
  { timestamps: true },
)

KoboKallRemittanceSchema.index({ remittanceId: 1 })
KoboKallRemittanceSchema.index({ senderPhone: 1, createdAt: -1 })

export const KoboKallRemittance = mongoose.model(
  'KoboKallRemittance',
  KoboKallRemittanceSchema,
)
