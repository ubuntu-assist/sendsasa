import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from './config/configuration'
import { SharedModule } from './shared/shared.module'
import { ChainsModule } from './chains/chains.module'
import { WhatsAppModule } from './whatsapp/whatsapp.module'
import { DatabaseModule } from './database/database.module'
import { XrplModule } from './xrpl/xrpl.module'
import { HealthController } from './health/health.controller'
import { WebhookModule } from './webhook/webhook.module'
import { FlowModule } from './flow/flow.module'
import { JwksModule } from './jwks/jwks.module'
import { CoinbaseModule } from './coinbase/coinbase.module'
import { PaymentModule } from './payment/payment.module'
import { OnramperModule } from './onramper/onramper.module'
import { CronModule } from './cron/cron.module'
import { TrustLockModule } from './trustlock/trustlock.module'
import { NjangiModule } from './njangi/njangi.module'
import { SplitChatModule } from './splitchat/splitchat.module'
import { PayDayModule } from './payday/payday.module'
import { SafiPayModule } from './safipay/safipay.module'
import { PawapayModule } from './pawapay/pawapay.module'
import { KoboKallModule } from './kobokall/kobokall.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    SharedModule,
    ChainsModule,
    WhatsAppModule,
    DatabaseModule,
    XrplModule,
    WebhookModule,
    FlowModule,
    JwksModule,
    CoinbaseModule,
    PaymentModule,
    OnramperModule,
    CronModule,
    TrustLockModule,
    NjangiModule,
    SplitChatModule,
    PayDayModule,
    SafiPayModule,
    PawapayModule,
    KoboKallModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
