import { Module } from '@nestjs/common'
import { SafiPayService } from './safipay.service'
import { SafiPayFlowService } from './safipay-flow.service'
import { GeminiService } from '../services/gemini.service'

@Module({
  providers: [SafiPayService, SafiPayFlowService, GeminiService],
  exports: [SafiPayService, SafiPayFlowService],
})
export class SafiPayModule {}
