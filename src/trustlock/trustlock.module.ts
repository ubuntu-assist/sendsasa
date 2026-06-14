import { Module } from '@nestjs/common'
import { TrustLockService } from './trustlock.service'
import { TrustLockFlowService } from './trustlock-flow.service'
import { GeminiService } from '../services/gemini.service'

@Module({
  providers: [TrustLockService, TrustLockFlowService, GeminiService],
  exports: [TrustLockService, TrustLockFlowService],
})
export class TrustLockModule {}
