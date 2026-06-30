import { Injectable } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import axios from 'axios'
import { CoinbaseOnrampService } from '@onramp/coinbase/coinbase-onramp.service'
import { NjangiService } from '@features/njangi/njangi.service'
import { SafiPayService } from '@features/safipay/safipay.service'
import { Deal } from '@features/trustlock/deal.schema'
import { User } from '@models/User'

@Injectable()
export class CronJobService {
  constructor(
    private readonly coinbaseOnramp: CoinbaseOnrampService,
    private readonly njangi: NjangiService,
    private readonly safipay: SafiPayService,
  ) {}
  @Cron('*/5 * * * *')
  async selfPing() {
    if (process.env.NODE_ENV !== 'production') return

    const selfUrl = process.env.SELF_URL || 'http://localhost:3000'
    try {
      const response = await axios.get(`${selfUrl}/cron/activate`, {
        timeout: 10000,
        headers: { 'User-Agent': 'SelfPing-KeepAlive/1.0' },
      })
      console.log(`Self-ping successful at ${new Date().toISOString()}`)
      console.log('Ping response:', response.data)
    } catch (error: unknown) {
      console.error(`Self-ping failed at ${new Date().toISOString()}`)
      console.error(`Error: ${(error as Error).message}`)
    }
  }

  @Cron('*/2 * * * *')
  async pollCoinbase() {
    if (process.env.NODE_ENV !== 'production') return

    try {
      await this.coinbaseOnramp.pollPendingOnRampTransactions()
    } catch (error: unknown) {
      console.error('Coinbase poller error:', (error as Error).message)
    }
  }

  @Cron('0 2 * * *')
  async expireDeals() {
    const cutoff = new Date(Date.now() - 7 * 24 * 3600_000)
    await Deal.updateMany(
      { status: { $in: ['PENDING_PAYMENT', 'ACTIVE'] }, createdAt: { $lt: cutoff } },
      { status: 'EXPIRED' },
    )
  }

  @Cron('0 8 * * *')
  async njangiReminders() {
    try {
      await this.njangi.sendAllPendingReminders()
    } catch (error: unknown) {
      console.error('Njangi reminders error:', (error as Error).message)
    }
  }

  @Cron('0 9 * * *')
  async safipayReminders() {
    try {
      await this.safipay.sendAllOverdueReminders()
    } catch (error: unknown) {
      console.error('SafiPay reminders error:', (error as Error).message)
    }
  }

  @Cron('*/30 * * * *')
  async resetStaleContexts() {
    const cutoff = new Date(Date.now() - 30 * 60_000)
    await User.updateMany(
      { momotrustContext: { $exists: true }, momotrustContextUpdatedAt: { $lt: cutoff } },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )
  }
}
