import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Group } from '@features/njangi/group.schema'
import { GroupStatus } from '@app/types'
import { BaseRepository } from './base.repository'

type GroupDoc = typeof Group.prototype

@Injectable()
export class GroupRepository extends BaseRepository {
  protected readonly model: Model<any> = Group

  create(data: Partial<GroupDoc>): Promise<GroupDoc> {
    return this._create(data)
  }

  findById(id: string): Promise<GroupDoc | null> {
    return this._findById(id)
  }

  findByShortCode(
    shortCode: string,
    type?: 'NJANGI' | 'SPLITCHAT',
  ): Promise<GroupDoc | null> {
    return this._findOne(type ? { shortCode, type } : { shortCode })
  }

  findByPayoutId(pawapayPayoutId: string): Promise<GroupDoc | null> {
    return this._findOne({ pawapayPayoutId })
  }

  findCollecting(type: 'NJANGI' | 'SPLITCHAT'): Promise<GroupDoc[]> {
    return this._find({
      type,
      status: { $in: [GroupStatus.ACTIVE, GroupStatus.COLLECTING] },
    })
  }

  findByIds(ids: string[]): Promise<GroupDoc[]> {
    return this._find({ _id: { $in: ids } })
  }

  updateById(id: string, data: Partial<GroupDoc>): Promise<GroupDoc | null> {
    return this._findOneAndUpdate({ _id: id }, { $set: data }, { new: true })
  }
}
