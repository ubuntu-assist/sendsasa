import { Controller, Post, Req, Res } from '@nestjs/common'
import { Request, Response } from 'express'
import { TrustLockService } from '@features/trustlock/trustlock.service'
import { NjangiService } from '@features/njangi/njangi.service'
import { SplitChatService } from '@features/splitchat/splitchat.service'
import { PayDayService } from '@features/payday/payday.service'
import { SafiPayService } from '@features/safipay/safipay.service'
import { KoboKallService } from '@features/kobokall/kobokall.service'
import { Group } from '@features/njangi/group.schema'
import { LocalTransfer } from '@features/kobokall/kobokall-remittance.schema'
import logger from '@common/utils/logger'

@Controller('pawapay')
export class PawapayCallbackController {
  constructor(
    private readonly trustlock: TrustLockService,
    private readonly njangi: NjangiService,
    private readonly splitchat: SplitChatService,
    private readonly payday: PayDayService,
    private readonly safipay: SafiPayService,
    private readonly kobokall: KoboKallService,
  ) {}

  @Post('callback')
  async handleCallback(@Req() req: Request, @Res() res: Response) {
    res.json({ received: true })

    setImmediate(async () => {
      const { depositId, payoutId, refundId, status } = req.body
      const failureCode: string = req.body.failureReason?.failureCode ?? ''
      try {
        if (depositId) {
          const deal = await this.trustlock.getDealByDepositId(depositId)
          if (deal) {
            if (status === 'COMPLETED')
              await this.trustlock.onDepositCompleted(depositId)
            else if (status === 'FAILED')
              await this.trustlock.onDepositFailed(depositId, failureCode ?? '')
            return
          }

          const member = await this.njangi.getMemberByDepositId(depositId)
          if (member) {
            const group = await Group.findById((member as any).groupId)
            if ((group as any)?.type === 'SPLITCHAT') {
              if (status === 'COMPLETED')
                await this.splitchat.onContributionReceived(depositId)
            } else {
              if (status === 'COMPLETED')
                await this.njangi.onMemberContributed(depositId)
            }
            return
          }

          const transfer = await LocalTransfer.findOne({ depositId })
          if (transfer) {
            if (status === 'COMPLETED')
              await this.kobokall.onDepositCompleted(depositId)
            else if (status === 'FAILED')
              await this.kobokall.onDepositFailed(depositId, failureCode ?? '')
            return
          }

          if (status === 'COMPLETED')
            await this.safipay.onInvoicePaid(depositId)
          return
        }

        if (payoutId) {
          const deal = await this.trustlock.getDealByPayoutId(payoutId)
          if (deal) {
            await this.trustlock.onPayoutCompleted(payoutId)
            return
          }

          const group = await Group.findOne({ pawapayPayoutId: payoutId })
          if (group) {
            if ((group as any).type === 'NJANGI')
              await this.njangi.onPayoutCompleted(payoutId)
            if ((group as any).type === 'SPLITCHAT')
              await this.splitchat.onPayoutCompleted(payoutId)
            return
          }

          const transfer = await LocalTransfer.findOne({ payoutId })
          if (transfer) {
            if (status === 'COMPLETED')
              await this.kobokall.onPayoutCompleted(payoutId)
            else if (status === 'FAILED')
              await this.kobokall.onPayoutFailed(payoutId, failureCode ?? '')
            return
          }

          if (status === 'COMPLETED') await this.payday.onItemPaid(payoutId)
          else await this.payday.onItemFailed(payoutId, failureCode ?? '')
          return
        }

        if (refundId) {
          const deal = await this.trustlock.getDealByRefundId(refundId)
          if (deal && status === 'COMPLETED')
            await this.trustlock.onRefundCompleted(refundId)
          return
        }
      } catch (err) {
        logger.error(`[PawaPay] Callback error: ${(err as Error).message}`)
      }
    })
  }
}
