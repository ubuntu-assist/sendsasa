import Note from './note'
import { INote } from '../src/types'

const initialNotes: INote[] = [
  {
    content: 'HTML is easy',
    important: false,
  },
  {
    content: 'Browser can execute only JavaScript',
    important: true,
  },
]

const nonExistingId = async (): Promise<string> => {
  const note = new Note({ content: 'willremovethissoon' })
  await note.save()
  await note.deleteOne()

  return note._id.toString()
}

export const notesInDb = async () => {
  const notes = await Note.find({})
  return notes.map((note) => JSON.parse(JSON.stringify(note)))
}

export default { initialNotes, nonExistingId, notesInDb }
