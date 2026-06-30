import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import configuration from '@config/configuration'
import { SharedModule } from './shared/shared.module'
import { ChainsModule } from '@blockchain/chains/chains.module'
import { StellarModule } from '@blockchain/stellar/stellar.module'
import { LiskModule } from '@blockchain/lisk/lisk.module'
import { DatabaseModule } from '@core/database/database.module'
import { HealthController } from '@core/health/health.controller'
import { JwksModule } from '@core/jwks/jwks.module'
import { CronModule } from '@core/cron/cron.module'
import { WhatsAppModule } from '@messaging/whatsapp/whatsapp.module'
import { WebhookModule } from '@messaging/webhook/webhook.module'
import { FlowModule } from '@messaging/flow/flow.module'
import { CoinbaseModule } from '@onramp/coinbase/coinbase.module'
import { OnramperModule } from '@onramp/onramper/onramper.module'
import { PaymentModule } from '@payments/payment/payment.module'
import { PawapayModule } from '@payments/pawapay/pawapay.module'
import { TrustLockModule } from '@features/trustlock/trustlock.module'
import { NjangiModule } from '@features/njangi/njangi.module'
import { SplitChatModule } from '@features/splitchat/splitchat.module'
import { PayDayModule } from '@features/payday/payday.module'
import { SafiPayModule } from '@features/safipay/safipay.module'
import { KoboKallModule } from '@features/kobokall/kobokall.module'
import { CryptoExchangeModule } from '@features/crypto-exchange/crypto-exchange.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    SharedModule,
    ChainsModule,
    StellarModule,
    LiskModule,
    DatabaseModule,
    WhatsAppModule,
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
    CryptoExchangeModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
