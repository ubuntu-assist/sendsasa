import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Transaction } from '@models/Transaction'
import { ITransaction } from '@app/types'
import { BaseRepository } from './base.repository'

@Injectable()
export class TransactionRepository extends BaseRepository {
  protected readonly model: Model<any> = Transaction

  create(data: Partial<ITransaction>): Promise<ITransaction> {
    return this._create(data)
  }

  findByAddress(address: string, limit = 10): Promise<ITransaction[]> {
    return this.model
      .find({ $or: [{ fromAddress: address }, { toAddress: address }] })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec()
  }

  findByPhone(phone: string, limit = 10): Promise<ITransaction[]> {
    return this.model
      .find({ $or: [{ fromPhone: phone }, { toPhone: phone }] })
      .sort({ timestamp: -1 })
      .limit(limit)
      .exec()
  }
}
