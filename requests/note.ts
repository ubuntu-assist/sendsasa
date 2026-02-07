import mongoose, { Schema } from 'mongoose'
import { INoteDocument } from '../types'

const noteSchema = new Schema<INoteDocument>({
  content: {
    type: String,
    required: true,
    minlength: 5,
  },
  important: Boolean,
})

noteSchema.set('toJSON', {
  transform: (
    _document: INoteDocument,
    returnedObject: Partial<INoteDocument> & { id?: string },
  ) => {
    returnedObject.id = returnedObject._id?.toString()
    delete returnedObject._id
    delete returnedObject.__v
  },
})

export default mongoose.model<INoteDocument>('Note', noteSchema)
