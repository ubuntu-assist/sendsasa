import { Module } from '@nestjs/common'
import { CryptoExchangeService } from './crypto-exchange.service'
import { DexModule } from '@blockchain/dex/dex.module'
import { BridgeModule } from '@blockchain/bridge/bridge.module'

@Module({
  imports: [DexModule, BridgeModule],
  providers: [CryptoExchangeService],
  exports: [CryptoExchangeService],
})
export class CryptoExchangeModule {}
