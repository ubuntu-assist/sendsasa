import cron from 'node-cron'
import axios from 'axios'
import { createApp } from './app'
import { xrplClient } from './config/xrpl'
import { connectDatabase, disconnectDatabase } from './config/database'
import { pollPendingOnRampTransactions } from './routes/coinbase-return.routes'
import config from './utils/config'

const app = createApp()
const PORT = config.PORT
const NODE_ENV = process.env.NODE_ENV || 'development'
const SELF_URL = process.env.SELF_URL || `http://localhost:${PORT}`

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
      console.log(`JWKS Endpoint: ${SELF_URL}/.well-known/jwks.json`)
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
        timeout: 10000,
        headers: { 'User-Agent': 'SelfPing-KeepAlive/1.0' },
      })
      console.log(`Self-ping successful at ${new Date().toISOString()}`)
      console.log(`Ping response:`, response.data)
    } catch (error: any) {
      console.error(`Self-ping failed at ${new Date().toISOString()}`)
      console.error(`Error: ${error.message}`)
    }
  })

  // Poll pending Coinbase card payments every 2 minutes (fallback for missed redirects)
  cron.schedule('*/2 * * * *', async () => {
    try {
      await pollPendingOnRampTransactions()
    } catch (error: any) {
      console.error('Coinbase poller error:', error.message)
    }
  })

  console.log('Self-ping and Coinbase poller cron jobs started\n')
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
