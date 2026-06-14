import { Module } from '@nestjs/common'
import { KoboKallService } from './kobokall.service'
import { KoboKallFlowService } from './kobokall-flow.service'

@Module({
  providers: [KoboKallService, KoboKallFlowService],
  exports: [KoboKallService, KoboKallFlowService],
})
export class KoboKallModule {}
