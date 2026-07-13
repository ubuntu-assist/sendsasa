import { Module } from '@nestjs/common'
import { SplitChatService } from './splitchat.service'
import { SplitChatFlowService } from './splitchat-flow.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [SplitChatService, SplitChatFlowService, PawapayService],
  exports: [SplitChatService, SplitChatFlowService],
})
export class SplitChatModule {}
