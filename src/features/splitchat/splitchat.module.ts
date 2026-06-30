import { Module } from '@nestjs/common'
import { SplitChatService } from './splitchat.service'
import { SplitChatFlowService } from './splitchat-flow.service'

@Module({
  providers: [SplitChatService, SplitChatFlowService],
  exports: [SplitChatService, SplitChatFlowService],
})
export class SplitChatModule {}
