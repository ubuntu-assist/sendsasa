import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import config from '@common/utils/config'

@Injectable()
export class KoboKallFlowService extends BaseFlowService {
  static async sendKoboKallFlow(phone: string): Promise<void> {
    await KoboKallFlowService.sendFlowMessage({
      recipientId: phone,
      header: '📲 MoMo Transfer',
      body: 'Send money to any MTN or Orange MoMo number in Cameroon.',
      footer: 'Powered by pawaPay',
      flowId: config.FLOW_ID_KOBOKALL_SEND,
      flowCta: 'Get Started',
      initialScreen: 'KOBOKALL_SEND',
    })
  }
}
