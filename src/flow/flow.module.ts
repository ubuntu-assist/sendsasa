import { Module } from '@nestjs/common'
import { FlowController } from './flow.controller'
import { FlowLauncherService } from './flow-launcher.service'
import { FlowDataExchangeService } from './flow-data-exchange.service'
import { CoinbaseModule } from '../coinbase/coinbase.module'

@Module({
  imports: [CoinbaseModule],
  providers: [FlowLauncherService, FlowDataExchangeService],
  controllers: [FlowController],
  exports: [FlowLauncherService, FlowDataExchangeService],
})
export class FlowModule {}
