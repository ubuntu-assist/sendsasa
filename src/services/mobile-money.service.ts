import { Injectable } from '@nestjs/common'
import logger from '../utils/logger'

/**
 * Direct Mobile Money payout service — Cameroon (XAF)
 *
 * Providers: MTN Mobile Money, Orange Money, UBA M2U
 *
 * TODO: Replace stub implementations with real API calls once
 *       the Mobile Wallet API documentation is received.
 */

export type MobileMoneyProvider = 'mtn' | 'orange' | 'uba'

export interface PayoutRequest {
  provider: MobileMoneyProvider
  recipientPhone: string
  amount: number
  currency: 'XAF'
  reference: string
  description: string
}

export interface PayoutResult {
  success: boolean
  providerTxId?: string
  reference: string
  message: string
}

interface IMobileMoneyProvider {
  payout(request: PayoutRequest): Promise<PayoutResult>
}

class MTNMobileMoneyProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[MTN MoMo] Initiating payout: ${request.amount} XAF → ${request.recipientPhone}`)
    throw new Error('MTN MoMo API not yet configured — awaiting API documentation')
  }
}

class OrangeMoneyProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[Orange Money] Initiating payout: ${request.amount} XAF → ${request.recipientPhone}`)
    throw new Error('Orange Money API not yet configured — awaiting API documentation')
  }
}

class UBAM2UProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[UBA M2U] Initiating payout: ${request.amount} XAF → ${request.recipientPhone}`)
    throw new Error('UBA M2U API not yet configured — awaiting API documentation')
  }
}

const providers: Record<MobileMoneyProvider, IMobileMoneyProvider> = {
  mtn: new MTNMobileMoneyProvider(),
  orange: new OrangeMoneyProvider(),
  uba: new UBAM2UProvider(),
}

export const PROVIDER_DISPLAY: Record<MobileMoneyProvider, string> = {
  mtn: 'MTN Mobile Money',
  orange: 'Orange Money',
  uba: 'UBA M2U',
}

@Injectable()
export class MobileMoneyService {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    const provider = providers[request.provider]
    if (!provider) throw new Error(`Unknown mobile money provider: ${request.provider}`)
    return provider.payout(request)
  }
}

export const mobileMoneyService = new MobileMoneyService()
