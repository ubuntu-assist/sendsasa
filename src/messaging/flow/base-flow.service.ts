import { FlowDataExchangeService } from './flow-data-exchange.service'
import { sendMessage } from '@messaging/whatsapp/whatsapp.service'

interface FlowLaunchParams {
  recipientId: string
  header: string
  body: string
  footer?: string
  flowId: string | undefined
  flowCta: string
  initialScreen: string
  screenData?: Record<string, any>
}

export abstract class BaseFlowService {
  protected static async sendFlowMessage(
    params: FlowLaunchParams,
  ): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(
      params.recipientId,
    )
    await sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: params.recipientId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: params.header },
        body: { text: params.body },
        footer: { text: params.footer ?? 'MoMo Trust · SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: params.flowId,
            flow_cta: params.flowCta,
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: params.initialScreen,
              ...(params.screenData ? { data: params.screenData } : {}),
            },
          },
        },
      },
    })
  }
}
