import { Module } from '@nestjs/common'
import { PayDayService } from './payday.service'
import { PayDayFlowService } from './payday-flow.service'
import { GeminiService } from '../services/gemini.service'

@Module({
  providers: [PayDayService, PayDayFlowService, GeminiService],
  exports: [PayDayService, PayDayFlowService],
})
export class PayDayModule {}
