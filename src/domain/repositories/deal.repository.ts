import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Deal } from '@features/trustlock/deal.schema'
import { DealStatus } from '@app/types'
import { BaseRepository } from './base.repository'

type DealDoc = typeof Deal.prototype

@Injectable()
export class DealRepository extends BaseRepository {
  protected readonly model: Model<any> = Deal

  create(data: Partial<DealDoc>): Promise<DealDoc> {
    return this._create(data)
  }

  findById(id: string): Promise<DealDoc | null> {
    return this._findById(id)
  }

  findByShortCode(shortCode: string): Promise<DealDoc | null> {
    return this._findOne({ shortCode })
  }

  findByDepositId(pawapayDepositId: string): Promise<DealDoc | null> {
    return this._findOne({ pawapayDepositId })
  }

  findByPayoutId(pawapayPayoutId: string): Promise<DealDoc | null> {
    return this._findOne({ pawapayPayoutId })
  }

  findByRefundId(pawapayRefundId: string): Promise<DealDoc | null> {
    return this._findOne({ pawapayRefundId })
  }

  findBySep24Id(sep24TransactionId: string): Promise<DealDoc | null> {
    return this._findOne({ sep24TransactionId })
  }

  findPendingRelease(buyerPhone: string): Promise<DealDoc | null> {
    return this._findOne({
      buyerPhone,
      status: DealStatus.ACTIVE,
    })
  }

  findReleasingWithoutReleaseTxHash(): Promise<DealDoc | null> {
    return this._findOne({
      status: 'RELEASING',
      stellarReleaseTxHash: { $exists: false },
    })
  }

  expireOldDeals(): Promise<{ modifiedCount: number }> {
    return this._updateMany(
      { status: DealStatus.PENDING_PAYMENT, expiresAt: { $lt: new Date() } },
      { $set: { status: DealStatus.EXPIRED } },
    )
  }

  updateById(id: string, data: Partial<DealDoc>): Promise<DealDoc | null> {
    return this._findOneAndUpdate({ _id: id }, { $set: data }, { new: true })
  }
}
