import express, { Express } from 'express'
import cors from 'cors'
import helmet from 'helmet'
import webhookRoutes from './routes/webhook.routes'
import cronRoutes from './routes/cron.routes'
import flowDataExchangeRoutes from './routes/flow.routes'
import jwksRoutes from './routes/jwks.routes'
import coinbaseWebhookRoutes from './routes/coinbase-webhook.routes'
import coinbaseReturnRoutes from './routes/coinbase-return.routes'
import paymentRoutes from './routes/payment.routes'
import onramperRoutes from './routes/onramper.routes'
import {
  errorHandler,
  notFoundHandler,
  requestLogger,
} from './middleware/error-handler'
import { apiLimiter } from './middleware/rate-limiter'
import config from './utils/config'

export function createApp(): Express {
  const app = express()
  const NODE_ENV = process.env.NODE_ENV || 'development'

  // Render / most PaaS sit behind a reverse proxy
  app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors())

  if (NODE_ENV === 'production') {
    app.use('/api/', apiLimiter)
  }

  // Must be registered before express.json() — needs the raw Buffer body for HMAC verification
  app.use(
    '/webhook/coinbase',
    express.raw({ type: 'application/json' }),
    coinbaseWebhookRoutes,
  )
  // Raw body only for the webhook POST — GET /success and /failure pass through normally
  app.use('/onramper', (req, res, next) => {
    if (req.method === 'POST' && req.path === '/webhook') {
      return express.raw({ type: 'application/json' })(req, res, next)
    }
    next()
  }, onramperRoutes)

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  app.use(requestLogger)

  app.use('/.well-known', jwksRoutes)
  app.use('/api', flowDataExchangeRoutes)
  app.use('/webhook', webhookRoutes)
  app.use('/cron', cronRoutes)
  app.use('/coinbase', coinbaseReturnRoutes)
  app.use('/pay', paymentRoutes)

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  })

  app.use(notFoundHandler)
  app.use(errorHandler)

  return app
}

export { config }
