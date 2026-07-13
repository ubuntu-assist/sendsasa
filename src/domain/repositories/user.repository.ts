import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { User } from '@models/User'
import { IUser, UserContext } from '@app/types'
import { BaseRepository } from './base.repository'

@Injectable()
export class UserRepository extends BaseRepository {
  protected readonly model: Model<any> = User

  findByWhatsappId(id: string): Promise<IUser | null> {
    return this._findOne({ whatsappId: id })
  }

  findByPhone(phone: string): Promise<IUser | null> {
    return this._findOne({ phoneNumber: phone })
  }

  findByUsernameRegex(query: string): Promise<IUser | null> {
    return this._findOne({ username: new RegExp(`^${query}$`, 'i') })
  }

  findByXrplAddress(address: string): Promise<IUser | null> {
    return this._findOne({ xrpl_address: address })
  }

  findByWhatsappIdOrPhone(
    whatsappId: string,
    phone: string,
  ): Promise<IUser | null> {
    return this._findOne({ $or: [{ whatsappId }, { phoneNumber: phone }] })
  }

  upsertByWhatsappId(
    whatsappId: string,
    data: Partial<IUser>,
  ): Promise<IUser | null> {
    return this._findOneAndUpdate({ whatsappId }, { $set: data }, { new: true, upsert: true })
  }

  setContext(
    whatsappId: string,
    context: UserContext | null,
  ): Promise<IUser | null> {
    const update = context
      ? { $set: { momotrustContext: JSON.stringify(context), momotrustContextUpdatedAt: new Date() } }
      : { $unset: { momotrustContext: '', momotrustContextUpdatedAt: '' } }
    return this._findOneAndUpdate({ whatsappId }, update, { new: true })
  }

  updateByWhatsappId(
    whatsappId: string,
    data: Partial<IUser>,
  ): Promise<IUser | null> {
    return this._findOneAndUpdate({ whatsappId }, { $set: data }, { new: true })
  }

  setContextByPhone(
    phone: string,
    context: UserContext | null,
  ): Promise<IUser | null> {
    const update = context
      ? { $set: { momotrustContext: JSON.stringify(context), momotrustContextUpdatedAt: new Date() } }
      : { $unset: { momotrustContext: '', momotrustContextUpdatedAt: '' } }
    return this._findOneAndUpdate({ phoneNumber: phone }, update, { new: true })
  }

  updateByPhone(phone: string, data: Partial<IUser>): Promise<IUser | null> {
    return this._findOneAndUpdate({ phoneNumber: phone }, { $set: data }, { new: true })
  }

  updateManyByPhone(
    phones: string[],
    data: Partial<IUser>,
  ): Promise<{ modifiedCount: number }> {
    return this._updateMany({ phoneNumber: { $in: phones } }, { $set: data })
  }

  clearContextByPhones(phones: string[]): Promise<{ modifiedCount: number }> {
    return this._updateMany(
      { phoneNumber: { $in: phones } },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )
  }

  count(): Promise<number> {
    return this._countDocuments({})
  }

  findAll(): Promise<IUser[]> {
    return this._find({})
  }
}
