import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { GroupMember } from '@features/njangi/group-member.schema'
import { BaseRepository } from './base.repository'

type MemberDoc = typeof GroupMember.prototype

@Injectable()
export class GroupMemberRepository extends BaseRepository {
  protected readonly model: Model<any> = GroupMember

  create(data: Partial<MemberDoc>): Promise<MemberDoc> {
    return this._create(data)
  }

  findByGroupAndPhone(
    groupId: string,
    phone: string,
  ): Promise<MemberDoc | null> {
    return this._findOne({ groupId, phone })
  }

  findByDepositId(pawapayDepositId: string): Promise<MemberDoc | null> {
    return this._findOne({ pawapayDepositId })
  }

  findBySep24Id(sep24TransactionId: string): Promise<MemberDoc | null> {
    return this._findOne({ sep24TransactionId })
  }

  findByGroup(groupId: string): Promise<MemberDoc[]> {
    return this._find({ groupId })
  }

  findPaid(groupId: string): Promise<MemberDoc[]> {
    return this._find({ groupId, hasPaidCurrentCycle: true })
  }

  findUnpaid(groupId: string): Promise<MemberDoc[]> {
    return this._find({ groupId, hasPaidCurrentCycle: false })
  }

  countByGroup(groupId: string): Promise<number> {
    return this._countDocuments({ groupId })
  }

  countPaid(groupId: string): Promise<number> {
    return this._countDocuments({ groupId, hasPaidCurrentCycle: true })
  }

  updateByGroupAndPhone(
    groupId: string,
    phone: string,
    data: Partial<MemberDoc>,
  ): Promise<MemberDoc | null> {
    return this._findOneAndUpdate(
      { groupId, phone },
      { $set: data },
      { new: true },
    )
  }

  resetCyclePaid(groupId: string): Promise<{ modifiedCount: number }> {
    return this._updateMany(
      { groupId },
      {
        $set: {
          hasPaidCurrentCycle: false,
          paidAt: null,
          pawapayDepositId: null,
        },
      },
    )
  }

  deleteByGroupAndPhone(groupId: string, phone: string): Promise<unknown> {
    return this._deleteOne({ groupId, phone })
  }
}
