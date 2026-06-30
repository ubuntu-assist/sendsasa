import { Module } from '@nestjs/common'
import { NjangiService } from './njangi.service'
import { NjangiFlowService } from './njangi-flow.service'

@Module({
  providers: [NjangiService, NjangiFlowService],
  exports: [NjangiService, NjangiFlowService],
})
export class NjangiModule {}
