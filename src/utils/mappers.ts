import { NewDiaryEntry, NewNoteEntry, Visibility, Weather } from '../types'
import { z } from 'zod'

export const newEntrySchema = z.object({
  weather: z.enum(Weather),
  visibility: z.enum(Visibility),
  date: z.iso.date(),
  comment: z.string().optional(),
})

export const toNewDiaryEntry = (object: unknown): NewDiaryEntry => {
  return newEntrySchema.parse(object)
}

export const newNoteSchema = z.object({
  content: z.string().min(5, 'Content must be at least 5 characters long'),
  important: z.boolean().optional(),
})

export const toNewNoteEntry = (object: unknown): NewNoteEntry => {
  return newNoteSchema.parse(object)
}
