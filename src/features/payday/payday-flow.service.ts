import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class PayDayFlowService extends BaseFlowService {
  static async launchPayDayCreateFlow(user: IUser): Promise<void> {
    await PayDayFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '💼 Pay My Team',
      body: 'Pick employees from your contacts or paste a list — AI will parse it automatically.',
      flowId: config.FLOW_ID_PAYDAY_CREATE,
      flowCta: 'Create Payroll',
      initialScreen: 'PAYROLL_INPUT',
    })
  }
}
