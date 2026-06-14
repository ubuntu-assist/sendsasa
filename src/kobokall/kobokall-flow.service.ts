import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from '../flow/flow-data-exchange.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import config from '../utils/config'

@Injectable()
export class KoboKallFlowService {
  static async sendKoboKallFlow(phone: string): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(phone)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '✈️ KoboKall' },
        body: { text: "Send money abroad via Mobile Money" },
        footer: { text: 'Powered by pawaPay' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_KOBOKALL_SEND,
            flow_cta: 'Get Started',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'KOBOKALL_SEND' },
          },
        },
      },
    })
  }
}
