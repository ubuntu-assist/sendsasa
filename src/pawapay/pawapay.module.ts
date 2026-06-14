import { Module } from '@nestjs/common'
import { PawapayCallbackController } from './pawapay-callback.controller'
import { PawapayService } from './pawapay.service'
import { TrustLockModule } from '../trustlock/trustlock.module'
import { NjangiModule } from '../njangi/njangi.module'
import { SplitChatModule } from '../splitchat/splitchat.module'
import { PayDayModule } from '../payday/payday.module'
import { SafiPayModule } from '../safipay/safipay.module'
import { KoboKallModule } from '../kobokall/kobokall.module'

@Module({
  imports: [TrustLockModule, NjangiModule, SplitChatModule, PayDayModule, SafiPayModule, KoboKallModule],
  controllers: [PawapayCallbackController],
  providers: [PawapayService],
  exports: [PawapayService],
})
export class PawapayModule {}
