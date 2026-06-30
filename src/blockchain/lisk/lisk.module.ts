import { Module } from '@nestjs/common'
import { LiskTrustlockService } from './lisk-trustlock.service'
import { PayDayBatchService } from './payday-batch.service'

@Module({
  providers: [LiskTrustlockService, PayDayBatchService],
  exports: [LiskTrustlockService, PayDayBatchService],
})
export class LiskModule {}
