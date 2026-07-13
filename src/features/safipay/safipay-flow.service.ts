import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class SafiPayFlowService extends BaseFlowService {
  static async launchSafiPayCreateFlow(user: IUser): Promise<void> {
    await SafiPayFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '🧾 Invoice a Client',
      body: 'Create a professional invoice with a MoMo payment link and send it instantly.',
      flowId: config.FLOW_ID_SAFIPAY_CREATE,
      flowCta: 'Create Invoice',
      initialScreen: 'INVOICE_DETAILS',
    })
  }
}
