import { Module } from '@nestjs/common'
import { TrustLockService } from './trustlock.service'
import { TrustLockFlowService } from './trustlock-flow.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [TrustLockService, TrustLockFlowService, PawapayService],
  exports: [TrustLockService, TrustLockFlowService],
})
export class TrustLockModule {}
