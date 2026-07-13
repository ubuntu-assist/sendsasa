import { Module } from '@nestjs/common'
import { PawapayCallbackController } from './pawapay-callback.controller'
import { PawapayService } from './pawapay.service'
import { PawapayAdapter } from './pawapay-adapter'
import { TrustLockModule } from '@features/trustlock/trustlock.module'
import { NjangiModule } from '@features/njangi/njangi.module'
import { SplitChatModule } from '@features/splitchat/splitchat.module'
import { PayDayModule } from '@features/payday/payday.module'
import { SafiPayModule } from '@features/safipay/safipay.module'
import { KoboKallModule } from '@features/kobokall/kobokall.module'

@Module({
  imports: [
    TrustLockModule,
    NjangiModule,
    SplitChatModule,
    PayDayModule,
    SafiPayModule,
    KoboKallModule,
  ],
  controllers: [PawapayCallbackController],
  providers: [PawapayService, PawapayAdapter],
  exports: [PawapayService, PawapayAdapter],
})
export class PawapayModule {}
