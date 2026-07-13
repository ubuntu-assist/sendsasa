import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Dispute } from '@features/trustlock/dispute.schema'
import { BaseRepository } from './base.repository'

type DisputeDoc = typeof Dispute.prototype

@Injectable()
export class DisputeRepository extends BaseRepository {
  protected readonly model: Model<any> = Dispute

  create(data: Partial<DisputeDoc>): Promise<DisputeDoc> {
    return this._create(data)
  }

  findById(id: string): Promise<DisputeDoc | null> {
    return this._findById(id)
  }

  findByDealId(dealId: string): Promise<DisputeDoc | null> {
    return this._findOne({ dealId })
  }

  findByDealIdAndPhone(dealId: string, phone: string): Promise<DisputeDoc | null> {
    return this._findOne({ dealId, filedByPhone: phone })
  }

  updateById(id: string, data: Partial<DisputeDoc>): Promise<DisputeDoc | null> {
    return this._findOneAndUpdate({ _id: id }, { $set: data }, { new: true })
  }
}
