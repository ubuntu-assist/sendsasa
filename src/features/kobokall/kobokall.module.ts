import { Module } from '@nestjs/common'
import { KoboKallService } from './kobokall.service'
import { KoboKallFlowService } from './kobokall-flow.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [KoboKallService, KoboKallFlowService, PawapayService],
  exports: [KoboKallService, KoboKallFlowService],
})
export class KoboKallModule {}
