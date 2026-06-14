import { Module } from '@nestjs/common'
import { XrplLifecycleService } from './xrpl-lifecycle.service'

@Module({
  providers: [XrplLifecycleService],
})
export class XrplModule {}
