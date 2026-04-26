import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

let mongod: MongoMemoryServer

export async function startTestDB(): Promise<void> {
  mongod = await MongoMemoryServer.create()
  await mongoose.connect(mongod.getUri())
}

export async function stopTestDB(): Promise<void> {
  await mongoose.disconnect()
  await mongod.stop()
}

export async function clearCollections(): Promise<void> {
  for (const collection of Object.values(mongoose.connection.collections)) {
    await collection.deleteMany({})
  }
}
