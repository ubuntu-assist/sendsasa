import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Invoice } from '@features/safipay/invoice.schema'
import { InvoiceStatus } from '@app/types'
import { BaseRepository } from './base.repository'

type InvoiceDoc = typeof Invoice.prototype

@Injectable()
export class InvoiceRepository extends BaseRepository {
  protected readonly model: Model<any> = Invoice

  create(data: Partial<InvoiceDoc>): Promise<InvoiceDoc> {
    return this._create(data)
  }

  findById(id: string): Promise<InvoiceDoc | null> {
    return this._findById(id)
  }

  findByShortCode(shortCode: string): Promise<InvoiceDoc | null> {
    return this._findOne({ shortCode })
  }

  findByDepositId(pawapayDepositId: string): Promise<InvoiceDoc | null> {
    return this._findOne({ pawapayDepositId })
  }

  findBySep24Id(sep24TransactionId: string): Promise<InvoiceDoc | null> {
    return this._findOne({ sep24TransactionId })
  }

  findByTempoSep24Id(tempoSep24Id: string): Promise<InvoiceDoc | null> {
    return this._findOne({ tempoSep24Id })
  }

  findBySep31Id(sep31TransactionId: string): Promise<InvoiceDoc | null> {
    return this._findOne({ sep31TransactionId })
  }

  findByMerchant(merchantPhone: string): Promise<InvoiceDoc[]> {
    return this._find({ merchantPhone })
  }

  findOverdue(): Promise<InvoiceDoc[]> {
    return this._find({
      status: { $in: [InvoiceStatus.SENT, InvoiceStatus.REMINDER_SENT] },
      dueDate: { $lt: new Date() },
    })
  }

  // Invoices that are past due and have not yet received 3 reminders.
  findPendingReminders(): Promise<InvoiceDoc[]> {
    return this._find({
      status: { $in: [InvoiceStatus.SENT, InvoiceStatus.REMINDER_SENT, InvoiceStatus.OVERDUE] },
      dueDate: { $lt: new Date() },
      reminderCount: { $lt: 3 },
    })
  }

  findByMerchantSorted(merchantPhone: string, limit = 10): Promise<InvoiceDoc[]> {
    return this.model
      .find({ merchantPhone })
      .sort({ createdAt: -1 })
      .limit(limit)
      .exec()
  }

  updateById(id: string, data: Partial<InvoiceDoc>): Promise<InvoiceDoc | null> {
    return this._findOneAndUpdate({ _id: id }, { $set: data }, { new: true })
  }

  markPaid(id: string): Promise<InvoiceDoc | null> {
    return this._findOneAndUpdate(
      { _id: id },
      { $set: { status: InvoiceStatus.PAID, paidAt: new Date() } },
      { new: true },
    )
  }

  markOverdue(id: string): Promise<InvoiceDoc | null> {
    return this._findOneAndUpdate(
      { _id: id },
      { $set: { status: InvoiceStatus.OVERDUE } },
      { new: true },
    )
  }
}
