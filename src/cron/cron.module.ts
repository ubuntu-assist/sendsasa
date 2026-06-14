import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { CronController } from './cron.controller'
import { CronJobService } from './cron.service'
import { CoinbaseModule } from '../coinbase/coinbase.module'
import { NjangiModule } from '../njangi/njangi.module'
import { SafiPayModule } from '../safipay/safipay.module'

@Module({
  imports: [ScheduleModule.forRoot(), CoinbaseModule, NjangiModule, SafiPayModule],
  controllers: [CronController],
  providers: [CronJobService],
})
export class CronModule {}
