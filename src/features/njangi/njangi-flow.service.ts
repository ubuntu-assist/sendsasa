import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from '@messaging/flow/flow-data-exchange.service'
import { WhatsAppService } from '@messaging/whatsapp/whatsapp.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class NjangiFlowService {
  static async launchNjangiCreateFlow(user: IUser): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '💰 My Njangi' },
        body: {
          text: 'Start a rotating savings group and invite your members. Contributions are collected automatically.',
        },
        footer: { text: 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_NJANGI_CREATE,
            flow_cta: 'Create Njangi',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'GROUP_DETAILS' },
          },
        },
      },
    })
  }
}
