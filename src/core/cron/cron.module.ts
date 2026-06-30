import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { CronController } from './cron.controller'
import { CronJobService } from './cron.service'
import { CoinbaseModule } from '@onramp/coinbase/coinbase.module'
import { NjangiModule } from '@features/njangi/njangi.module'
import { SafiPayModule } from '@features/safipay/safipay.module'

@Module({
  imports: [ScheduleModule.forRoot(), CoinbaseModule, NjangiModule, SafiPayModule],
  controllers: [CronController],
  providers: [CronJobService],
})
export class CronModule {}
