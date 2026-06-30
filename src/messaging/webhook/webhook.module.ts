import { Module } from '@nestjs/common'
import { WebhookController } from './webhook.controller'
import { MessageHandlerService } from './message-handler.service'
import { FlowModule } from '@messaging/flow/flow.module'
import { OnramperModule } from '@onramp/onramper/onramper.module'

@Module({
  imports: [FlowModule, OnramperModule],
  providers: [MessageHandlerService],
  controllers: [WebhookController],
})
export class WebhookModule {}
