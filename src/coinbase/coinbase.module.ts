import { Module } from '@nestjs/common'
import { CoinbaseWebhookController } from './coinbase-webhook.controller'
import { CoinbaseReturnController } from './coinbase-return.controller'
import { CoinbaseOnrampService } from './coinbase-onramp.service'

@Module({
  providers: [CoinbaseOnrampService],
  controllers: [CoinbaseWebhookController, CoinbaseReturnController],
  exports: [CoinbaseOnrampService],
})
export class CoinbaseModule {}
