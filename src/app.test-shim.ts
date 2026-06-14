import 'reflect-metadata'
import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import express from 'express'
import type { Application } from 'express'
import configuration from './config/configuration'
import { SharedModule } from './shared/shared.module'
import { HealthController } from './health/health.controller'
import { WebhookModule } from './webhook/webhook.module'
import { FlowModule } from './flow/flow.module'
import { JwksModule } from './jwks/jwks.module'
import { CoinbaseModule } from './coinbase/coinbase.module'
import { PaymentModule } from './payment/payment.module'
import { OnramperModule } from './onramper/onramper.module'
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter'

// Excludes DatabaseModule and XrplModule — tests manage their own DB lifecycle
// via mongodb-memory-server (startTestDB/stopTestDB) and don't need XRPL.
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    SharedModule,
    WebhookModule,
    FlowModule,
    JwksModule,
    CoinbaseModule,
    PaymentModule,
    OnramperModule,
  ],
  controllers: [HealthController],
})
class TestAppModule {}

export async function createApp(): Promise<Application> {
  const app = await NestFactory.create<NestExpressApplication>(TestAppModule, {
    bodyParser: false,
    logger: false,
  })

  const http = app.getHttpAdapter().getInstance()
  http.use('/webhook/coinbase', express.raw({ type: 'application/json' }))
  http.use('/onramper/webhook', (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (req.method === 'POST') return express.raw({ type: 'application/json' })(req, res, next)
    next()
  })

  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.useGlobalFilters(new AllExceptionsFilter())
  await app.init()
  return app.getHttpAdapter().getInstance()
}
