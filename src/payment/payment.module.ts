import { Module } from '@nestjs/common'
import { PaymentController } from './payment.controller'
import { CoinbaseModule } from '../coinbase/coinbase.module'

@Module({
  imports: [CoinbaseModule],
  controllers: [PaymentController],
})
export class PaymentModule {}
