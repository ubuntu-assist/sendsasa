import { Module } from '@nestjs/common'
import { SafiPayService } from './safipay.service'
import { SafiPayFlowService } from './safipay-flow.service'
import { SafiPayRedirectController } from './safipay-redirect.controller'
import { GeminiService } from '../services/gemini.service'

@Module({
  controllers: [SafiPayRedirectController],
  providers: [SafiPayService, SafiPayFlowService, GeminiService],
  exports: [SafiPayService, SafiPayFlowService],
})
export class SafiPayModule {}
