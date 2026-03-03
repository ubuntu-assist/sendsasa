import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import webhookRoutes from './routes/webhook.routes'
import { xrplClient } from './config/xrpl'
import { connectDatabase, disconnectDatabase } from './config/database'
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/error-handler'
import { apiLimiter } from './middleware/rate-limiter'
import config from './utils/config'

const app: Express = express()
const PORT = config.PORT
const NODE_ENV = process.env.NODE_ENV || 'development'

app.use(helmet())
app.use(cors())

if (NODE_ENV === 'production') {
  app.use('/api/', apiLimiter)
}

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(requestLogger)

app.use('/webhook', webhookRoutes)

app.use(notFoundHandler)

app.use(errorHandler)

async function startServer() {
  try {
    console.log('Connecting to MongoDB...')
    await connectDatabase()

    console.log('Connecting to XRPL...')
    await xrplClient.connect()

    app.listen(PORT, () => {
      console.log(`\nServer running on port ${PORT}`)
      console.log(`\nXRPL Network: ${xrplClient.getNetwork()}`)
      console.log(`Database: MongoDB connected`)
      console.log(`Environment: ${NODE_ENV}`)
      console.log('\nReady to receive WhatsApp messages!\n')
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

async function shutdown() {
  console.log('\n\nShutting down gracefully...')

  try {
    await xrplClient.disconnect()
    await disconnectDatabase()
    console.log('All connections closed')
    process.exit(0)
  } catch (error) {
    console.error('Error during shutdown:', error)
    process.exit(1)
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
})

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  shutdown()
})

startServer()
