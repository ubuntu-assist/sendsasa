import { Module } from '@nestjs/common'
import { KoboKallService } from './kobokall.service'
import { KoboKallFlowService } from './kobokall-flow.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'

@Module({
  providers: [KoboKallService, KoboKallFlowService, StellarService, StellarAnchorService],
  exports: [KoboKallService, KoboKallFlowService],
})
export class KoboKallModule {}
