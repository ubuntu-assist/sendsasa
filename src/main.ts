import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import helmet from 'helmet'
import cors from 'cors'
import { AppModule } from './app.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'
import {
  apiLimiter,
  webhookLimiter,
  transactionLimiter,
  publicLimiter,
} from './middleware/rate-limiter'
import { requestLogger } from './middleware/error-handler'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  })

  app.set('trust proxy', 1)
  app.use(helmet())
  app.use(cors())

  app.use('/webhook', webhookLimiter)
  app.use('/api', apiLimiter)
  app.use('/pay', transactionLimiter)
  app.use('/coinbase', transactionLimiter)
  app.use('/onramper', webhookLimiter)
  app.use('/pawapay', webhookLimiter)
  app.use('/.well-known', publicLimiter)
  app.use('/health', publicLimiter)
  app.use('/cron', publicLimiter)

  // Raw body must be registered before express.json() for HMAC verification
  const http = app.getHttpAdapter().getInstance()
  http.use('/webhook/coinbase', express.raw({ type: 'application/json' }))
  http.use(
    '/onramper/webhook',
    (
      req: express.Request,
      res: express.Response,
      next: express.NextFunction,
    ) => {
      if (req.method === 'POST')
        return express.raw({ type: 'application/json' })(req, res, next)
      next()
    },
  )

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(requestLogger)

  app.useGlobalFilters(new AllExceptionsFilter())
  app.enableShutdownHooks()

  const port = process.env.PORT || 3000
  await app.listen(port)

  const selfUrl = process.env.SELF_URL || `http://localhost:${port}`
  console.log(`\nEnvironment: ${process.env.NODE_ENV || 'development'}`)
  console.log(`JWKS Endpoint: ${selfUrl}/.well-known/jwks.json`)
  console.log('Ready to receive WhatsApp messages!\n')
}

bootstrap().catch((err) => {
  console.error('Failed to start server:', err)
  process.exit(1)
})
