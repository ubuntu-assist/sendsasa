import mongoose from 'mongoose'
import config from '@common/utils/config'

const MONGODB_URI = config.MONGODB_URI!
const MAX_POOL_SIZE = Number.parseInt(config.DB_MAX_POOL_SIZE || '10')
const MIN_POOL_SIZE = Number.parseInt(config.DB_MIN_POOL_SIZE || '5')

export async function connectDatabase(): Promise<void> {
  try {
    console.log('Connecting to MongoDB...')
    console.log(`URI: ${MONGODB_URI.replace(/\/\/.*:.*@/, '//<credentials>@')}`)

    await mongoose.connect(MONGODB_URI, {
      maxPoolSize: MAX_POOL_SIZE,
      minPoolSize: MIN_POOL_SIZE,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    })

    console.log('MongoDB connected successfully')
    console.log(`Database: ${mongoose.connection.db?.databaseName}`)

    mongoose.connection.on('error', (error) => {
      console.error('MongoDB connection error:', error)
    })

    mongoose.connection.on('disconnected', () => {
      console.warn('MongoDB disconnected')
    })

    mongoose.connection.on('reconnected', () => {
      console.log('MongoDB reconnected')
    })
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error)
    throw error
  }
}

export async function disconnectDatabase(): Promise<void> {
  try {
    await mongoose.disconnect()
    console.log('MongoDB disconnected')
  } catch (error) {
    console.error('Error disconnecting from MongoDB:', error)
    throw error
  }
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1
}

export async function getDatabaseStats() {
  if (!isDatabaseConnected()) {
    throw new Error('Database not connected')
  }

  const db = mongoose.connection.db
  if (!db) {
    throw new Error('Database instance not available')
  }

  const stats = await db.stats()
  const collections = await db.listCollections().toArray()

  return {
    database: db.databaseName,
    collections: collections.length,
    dataSize: stats.dataSize,
    storageSize: stats.storageSize,
    indexes: stats.indexes,
    objects: stats.objects,
  }
}
