import { Module } from '@nestjs/common'
import { NjangiService } from './njangi.service'
import { NjangiFlowService } from './njangi-flow.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [NjangiService, NjangiFlowService, PawapayService],
  exports: [NjangiService, NjangiFlowService],
})
export class NjangiModule {}
