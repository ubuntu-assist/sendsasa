import { Module } from '@nestjs/common'
import { CctpService } from './cctp.service'
import { AllbridgeService } from './allbridge.service'

@Module({
  providers: [CctpService, AllbridgeService],
  exports: [CctpService, AllbridgeService],
})
export class BridgeModule {}
