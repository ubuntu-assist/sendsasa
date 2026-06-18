import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from '../flow/flow-data-exchange.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { IUser } from '../types'
import config from '../utils/config'

@Injectable()
export class TrustLockFlowService {
  static async launchTrustLockCreateFlow(user: IUser): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '🔒 Secure a Deal' },
        body: {
          text: 'Protect your purchase with a secure deposit. Funds are released only upon delivery confirmation.',
        },
        footer: { text: 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_TRUSTLOCK_CREATE,
            flow_cta: 'Create Deal',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'DEAL_DETAILS' },
          },
        },
      },
    })
  }

  static async launchDisputeFlow(user: IUser, dealId: string): Promise<void> {
    const { Deal } = await import('./deal.schema')
    const deal = await Deal.findById(dealId)
    if (!deal) return
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '⚠️ Report an Issue' },
        body: {
          text: 'Describe the problem. Our AI will review your case and the evidence.',
        },
        footer: { text: 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_DISPUTE_FILE,
            flow_cta: 'Submit Dispute',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'DISPUTE_REASON',
              data: { deal_short_code: (deal as any).shortCode },
            },
          },
        },
      },
    })
  }
}
