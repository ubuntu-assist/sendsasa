import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from '../flow/flow-data-exchange.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { IUser } from '../types'
import config from '../utils/config'

@Injectable()
export class PayDayFlowService {
  static async launchPayDayCreateFlow(user: IUser): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '💼 Pay My Team' },
        body: { text: 'Pick employees from your contacts or paste a list — AI will parse it automatically.' },
        footer: { text: 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_PAYDAY_CREATE,
            flow_cta: 'Create Payroll',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'PAYROLL_INPUT' },
          },
        },
      },
    })
  }
}
