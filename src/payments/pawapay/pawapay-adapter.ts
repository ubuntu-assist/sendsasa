import { Injectable } from '@nestjs/common'
import { PawapayService } from './pawapay.service'

export interface GatewayDepositRequest {
  idempotencyKey: string
  phone: string
  amount: number
  description: string
  clientReferenceId?: string
}

export interface GatewayPayoutRequest {
  idempotencyKey: string
  phone: string
  amount: number
  description: string
  clientReferenceId?: string
}

export interface GatewayResponse {
  id: string
  status: 'ACCEPTED' | 'REJECTED'
  rejectionReason?: string
}

export interface IPaymentGateway {
  deposit(req: GatewayDepositRequest): Promise<GatewayResponse>
  payout(req: GatewayPayoutRequest): Promise<GatewayResponse>
}

@Injectable()
export class PawapayAdapter implements IPaymentGateway {
  constructor(private readonly pawapay: PawapayService) {}

  async deposit(req: GatewayDepositRequest): Promise<GatewayResponse> {
    const result = await this.pawapay.initiateDeposit(
      req.idempotencyKey,
      req.phone,
      req.amount,
      req.description,
      req.clientReferenceId,
    )
    return {
      id: result.depositId,
      status: result.status,
      rejectionReason: result.rejectionReason,
    }
  }

  async payout(req: GatewayPayoutRequest): Promise<GatewayResponse> {
    const result = await this.pawapay.initiatePayout(
      req.idempotencyKey,
      req.phone,
      req.amount,
      req.description,
      req.clientReferenceId,
    )
    return {
      id: result.payoutId,
      status: result.status,
      rejectionReason: result.rejectionReason,
    }
  }
}
