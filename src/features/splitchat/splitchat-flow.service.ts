import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import { IUser } from '@app/types'
import config from '@common/utils/config'

@Injectable()
export class SplitChatFlowService extends BaseFlowService {
  static async launchSplitChatCreateFlow(user: IUser): Promise<void> {
    await SplitChatFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '🎉 Group Collection',
      body: 'Collect money from multiple people for a shared event, gift, or project.',
      flowId: config.FLOW_ID_SPLITCHAT_CREATE,
      flowCta: 'Create Pot',
      initialScreen: 'POT_DETAILS',
    })
  }
}
