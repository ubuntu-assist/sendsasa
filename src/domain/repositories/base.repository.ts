import { Model } from 'mongoose'

export abstract class BaseRepository {
  protected abstract readonly model: Model<any>

  protected _findById(id: string) {
    return this.model.findById(id).exec()
  }

  protected _findOne(filter: Record<string, any>) {
    return this.model.findOne(filter).exec()
  }

  protected _find(filter: Record<string, any>) {
    return this.model.find(filter).exec()
  }

  protected _create(data: Partial<any>) {
    return this.model.create(data)
  }

  protected _updateOne(filter: Record<string, any>, update: Record<string, any>) {
    return this.model.updateOne(filter, update).exec()
  }

  protected _updateMany(filter: Record<string, any>, update: Record<string, any>) {
    return this.model.updateMany(filter, update).exec()
  }

  protected _countDocuments(filter: Record<string, any>) {
    return this.model.countDocuments(filter).exec()
  }

  protected _deleteOne(filter: Record<string, any>) {
    return this.model.deleteOne(filter).exec()
  }

  protected _findOneAndUpdate(
    filter: Record<string, any>,
    update: Record<string, any>,
    options?: { new?: boolean; upsert?: boolean },
  ) {
    return this.model.findOneAndUpdate(filter, update, options).exec()
  }
}
