import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import cron from 'node-cron'
import axios from 'axios'
import webhookRoutes from './routes/webhook.routes'
import cronRoutes from './routes/cron.routes'
import { xrplClient } from './config/xrpl'
import { connectDatabase, disconnectDatabase } from './config/database'
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/error-handler'
import { apiLimiter } from './middleware/rate-limiter'
import config from './utils/config'
import flowDataExchangeRoutes from './routes/flow.routes'

const app: Express = express()
const PORT = config.PORT
const NODE_ENV = process.env.NODE_ENV || 'development'
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`

app.use(helmet())
app.use(cors())

if (NODE_ENV === 'production') {
  app.use('/api/', apiLimiter)
}

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use(requestLogger)

app.use('/api', flowDataExchangeRoutes)
app.use('/webhook', webhookRoutes)
app.use('/cron', cronRoutes)

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  })
})

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
      console.log(`Environment: ${NODE_ENV}`)
      console.log(`XRPL Network: ${xrplClient.getNetwork()}`)
      console.log(`Database: MongoDB connected`)
      console.log(`\nReady to receive WhatsApp messages!\n`)

      if (NODE_ENV === 'production') {
        startSelfPing()
      } else {
        console.log('Self-ping cron disabled in development mode\n')
      }
    })
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

function startSelfPing() {
  console.log('Starting self-ping cron job...')
  console.log(`Will ping: ${SELF_URL}/cron/activate every 5 minutes`)

  cron.schedule('*/5 * * * *', async () => {
    try {
      const response = await axios.get(`${SELF_URL}/cron/activate`, {
        timeout: 10000, // 10 second timeout
        headers: {
          'User-Agent': 'SelfPing-KeepAlive/1.0',
        },
      })

      console.log(`Self-ping successful at ${new Date().toISOString()}`)
      console.log(`Ping response:`, response.data)
    } catch (error: any) {
      console.error(`Self-ping failed at ${new Date().toISOString()}`)
      console.error(`Error: ${error.message}`)
    }
  })

  console.log('Self-ping cron job started successfully\n')
}

async function shutdown() {
  console.log('\n\n🛑 Shutting down gracefully...')

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
