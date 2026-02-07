import mongoose, { Schema } from 'mongoose'
import { IMessageLog } from '../types'

const MessageLogSchema = new Schema<IMessageLog>({
  whatsappId: {
    type: String,
    required: true,
    index: true,
    trim: true,
  },
  direction: {
    type: String,
    enum: ['incoming', 'outgoing'],
    required: true,
    index: true,
  },
  messageType: {
    type: String,
    enum: ['text', 'interactive', 'button'],
    default: 'text',
  },
  message: {
    type: String,
    required: true,
  },
  timestamp: {
    type: Date,
    default: Date.now,
    index: true,
  },
})

export const MessageLog = mongoose.model<IMessageLog>(
  'MessageLog',
  MessageLogSchema,
)
