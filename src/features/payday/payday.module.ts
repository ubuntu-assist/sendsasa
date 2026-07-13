import { Module } from '@nestjs/common'
import { PayDayService } from './payday.service'
import { PayDayFlowService } from './payday-flow.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [PayDayService, PayDayFlowService, PawapayService],
  exports: [PayDayService, PayDayFlowService],
})
export class PayDayModule {}
