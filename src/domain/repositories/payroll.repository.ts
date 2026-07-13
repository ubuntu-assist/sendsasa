import { Injectable } from '@nestjs/common'
import { Model } from 'mongoose'
import { Payroll } from '@features/payday/payroll.schema'
import { BaseRepository } from './base.repository'

type PayrollDoc = typeof Payroll.prototype

@Injectable()
export class PayrollRepository extends BaseRepository {
  protected readonly model: Model<any> = Payroll

  create(data: Partial<PayrollDoc>): Promise<PayrollDoc> {
    return this._create(data)
  }

  findById(id: string): Promise<PayrollDoc | null> {
    return this._findById(id)
  }

  findByShortCode(shortCode: string): Promise<PayrollDoc | null> {
    return this._findOne({ shortCode })
  }

  // Dot-notation subdocument query — finds the payroll whose items array
  // contains an item with the given pawapayPayoutId.
  findByPayoutItemId(pawapayPayoutId: string): Promise<PayrollDoc | null> {
    return this._findOne({ 'items.pawapayPayoutId': pawapayPayoutId })
  }

  findByEmployer(employerPhone: string): Promise<PayrollDoc[]> {
    return this._find({ employerPhone })
  }

  updateById(id: string, data: Partial<PayrollDoc>): Promise<PayrollDoc | null> {
    return this._findOneAndUpdate({ _id: id }, { $set: data }, { new: true })
  }

  updatePayrollItem(
    payrollId: string,
    pawapayPayoutId: string,
    itemData: Record<string, unknown>,
  ): Promise<PayrollDoc | null> {
    const setFields: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(itemData)) {
      setFields[`items.$[item].${k}`] = v
    }
    return this.model
      .findOneAndUpdate(
        { _id: payrollId },
        { $set: setFields },
        {
          arrayFilters: [{ 'item.pawapayPayoutId': pawapayPayoutId }],
          new: true,
        },
      )
      .exec()
  }
}
