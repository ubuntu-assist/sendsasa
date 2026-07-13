import { Injectable } from '@nestjs/common'
import { BaseFlowService } from '@messaging/flow/base-flow.service'
import { DealRepository } from '@domain/repositories/deal.repository'
import { IUser } from '@app/types'
import config from '@common/utils/config'

const _dealRepo = new DealRepository()

@Injectable()
export class TrustLockFlowService extends BaseFlowService {
  static async launchTrustLockCreateFlow(user: IUser): Promise<void> {
    await TrustLockFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '🔒 Secure a Deal',
      body: 'Protect your purchase with a secure deposit. Funds are released only upon delivery confirmation.',
      flowId: config.FLOW_ID_TRUSTLOCK_CREATE,
      flowCta: 'Create Deal',
      initialScreen: 'DEAL_DETAILS',
    })
  }

  static async launchDisputeFlow(user: IUser, dealId: string): Promise<void> {
    const deal = await _dealRepo.findById(dealId)
    if (!deal) return
    await TrustLockFlowService.sendFlowMessage({
      recipientId: user.whatsappId,
      header: '⚠️ Report an Issue',
      body: 'Describe the problem. Our AI will review your case and the evidence.',
      flowId: config.FLOW_ID_DISPUTE_FILE,
      flowCta: 'Submit Dispute',
      initialScreen: 'DISPUTE_REASON',
      screenData: { deal_short_code: (deal as any).shortCode },
    })
  }
}
