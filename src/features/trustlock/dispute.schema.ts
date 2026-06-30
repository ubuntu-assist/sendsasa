import mongoose from 'mongoose'

const DisputeSchema = new mongoose.Schema(
  {
    dealId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Deal', required: true },
    filedByPhone: { type: String, required: true },
    reason:       { type: String, required: true },
    description:  { type: String },
    evidenceUrls: [String],
    aiVerdict:    { type: String, enum: ['RELEASE', 'REFUND', 'MANUAL_REVIEW'] },
    aiReasoning:  { type: String },
    aiConfidence: { type: Number },
    resolvedAt:   { type: Date },
  },
  { timestamps: true },
)

DisputeSchema.index({ dealId: 1 })

export const Dispute = mongoose.model('Dispute', DisputeSchema)
