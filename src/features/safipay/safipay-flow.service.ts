import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from '@messaging/flow/flow-data-exchange.service'
import { WhatsAppService } from '@messaging/whatsapp/whatsapp.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class SafiPayFlowService {
  static async launchSafiPayCreateFlow(user: IUser): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '🧾 Invoice a Client' },
        body: { text: 'Create a professional invoice with a MoMo payment link and send it instantly.' },
        footer: { text: 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_SAFIPAY_CREATE,
            flow_cta: 'Create Invoice',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'INVOICE_DETAILS' },
          },
        },
      },
    })
  }
}
