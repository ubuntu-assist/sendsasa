import { Global, Module } from '@nestjs/common'
import { WhatsAppService } from './whatsapp.service'
import { WhatsAppMenuService } from './whatsapp-menu.service'
import { MessageParserService } from './message-parser.service'

@Global()
@Module({
  providers: [WhatsAppService, WhatsAppMenuService, MessageParserService],
  exports: [WhatsAppService, WhatsAppMenuService, MessageParserService],
})
export class WhatsAppModule {}
