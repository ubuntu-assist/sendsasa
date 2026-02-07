import { Router, Request, Response } from 'express'
import { StatusCodes } from 'http-status-codes'
import Note from './note'
import middleware from '../src/utils/middleware'
import { INoteDocument, NewNoteEntry } from '../src/types'

const notesRouter = Router()

notesRouter.get('/', async (_request: Request, response: Response) => {
  const notes = await Note.find({})
  response.json(notes)
})

notesRouter.get(
  '/:id',
  async (
    request: Request<{ id: string }, unknown, unknown>,
    response: Response,
  ) => {
    const note = await Note.findById(request.params.id)

    if (note) {
      response.json(note)
    } else {
      response.status(StatusCodes.NOT_FOUND).end()
    }
  },
)

notesRouter.post(
  '/',
  middleware.newNoteParser,
  async (
    request: Request<unknown, unknown, NewNoteEntry>,
    response: Response<INoteDocument>,
  ) => {
    const note = new Note(request.body)
    const savedNote = await note.save()
    response.status(StatusCodes.CREATED).json(savedNote)
  },
)

notesRouter.delete(
  '/:id',
  async (
    request: Request<{ id: string }, unknown, unknown>,
    response: Response,
  ) => {
    const result = await Note.findByIdAndDelete(request.params.id)

    if (!result) {
      response.status(StatusCodes.NOT_FOUND).end()
      return
    }

    response.status(StatusCodes.NO_CONTENT).end()
  },
)

notesRouter.put(
  '/:id',
  middleware.newNoteParser,
  async (
    request: Request<{ id: string }, unknown, NewNoteEntry>,
    response: Response<INoteDocument>,
  ) => {
    const { content, important } = request.body
    const note = await Note.findById(request.params.id)

    if (!note) {
      response.status(StatusCodes.NOT_FOUND).end()
      return
    }

    note.content = content
    note.important = important

    const updatedNote = await note.save()
    response.json(updatedNote)
  },
)

export default notesRouter
