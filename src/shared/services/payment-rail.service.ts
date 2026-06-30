import { Injectable } from '@nestjs/common'
import type { IUser } from '@app/types'

export type PaymentRail = 'pawapay' | 'stellar'

@Injectable()
export class PaymentRailService {
  getRail(user: IUser): PaymentRail {
    return user.operatingRegion === 'cameroon' ? 'pawapay' : 'stellar'
  }
}
