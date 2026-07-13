import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class NjangiFlowService extends BaseFlowService {
  static async launchNjangiCreateFlow(user: IUser): Promise<void> {
    await NjangiFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '💰 My Njangi',
      body: 'Start a rotating savings group and invite your members. Contributions are collected automatically.',
      flowId: config.FLOW_ID_NJANGI_CREATE,
      flowCta: 'Create Njangi',
      initialScreen: 'GROUP_DETAILS',
    })
  }
}
