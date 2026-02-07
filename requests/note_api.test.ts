import { test, after, beforeEach } from 'node:test'
import mongoose from 'mongoose'
import request from 'supertest'
import app from '../src/app'
import assert from 'node:assert'
import Note from './note'
import { StatusCodes } from 'http-status-codes'
import helper from './test_helper'

beforeEach(async () => {
  await Note.deleteMany({})
  await Note.insertMany(helper.initialNotes)
})

test('notes are returned as json', async () => {
  await request(app)
    .get('/api/notes')
    .expect(StatusCodes.OK)
    .expect('Content-Type', /application\/json/)
})

test('all notes are returned', async () => {
  const response = await request(app).get('/api/notes')

  assert.strictEqual(response.body.length, helper.initialNotes.length)
})

test('a specific note can be viewed', async () => {
  const notesAtStart = await helper.notesInDb()
  const noteToView = notesAtStart[0]

  const resultNote = await request(app)
    .get(`/api/notes/${noteToView.id}`)
    .expect(StatusCodes.OK)
    .expect('Content-Type', /application\/json/)

  assert.deepStrictEqual(resultNote.body, noteToView)
})

test('a valid note can be added', async () => {
  const newNote = {
    content: 'async/await simplifies making async calls',
    important: true,
  }

  await request(app)
    .post('/api/notes')
    .send(newNote)
    .expect(StatusCodes.CREATED)
    .expect('Content-Type', /application\/json/)

  const notesAtEnd = await helper.notesInDb()
  const contents = notesAtEnd.map((r) => r.content)

  assert.strictEqual(notesAtEnd.length, helper.initialNotes.length + 1)
  assert(contents.includes('async/await simplifies making async calls'))
})

test('note without content is not added', async () => {
  const newNote = {
    important: true,
  }

  await request(app)
    .post('/api/notes')
    .send(newNote)
    .expect(StatusCodes.BAD_REQUEST)

  const notesAtEnd = await helper.notesInDb()

  assert.strictEqual(notesAtEnd.length, helper.initialNotes.length)
})

test('a note can be deleted', async () => {
  const notesAtStart = await helper.notesInDb()
  const noteToDelete = notesAtStart[0]

  await request(app)
    .delete(`/api/notes/${noteToDelete.id}`)
    .expect(StatusCodes.NO_CONTENT)

  const notesAtEnd = await helper.notesInDb()
  const ids = notesAtEnd.map((n) => n.id)

  assert(!ids.includes(noteToDelete.id))
  assert.strictEqual(notesAtEnd.length, helper.initialNotes.length - 1)
})

after(async () => {
  await mongoose.connection.close()
})
