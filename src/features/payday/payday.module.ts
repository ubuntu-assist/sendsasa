import { Module } from '@nestjs/common'
import { PayDayService } from './payday.service'
import { PayDayFlowService } from './payday-flow.service'
import { GeminiService } from '@shared/gemini.service'
import { StellarService } from '@blockchain/stellar/stellar.service'

@Module({
  providers: [PayDayService, PayDayFlowService, GeminiService, StellarService],
  exports: [PayDayService, PayDayFlowService],
})
export class PayDayModule {}
