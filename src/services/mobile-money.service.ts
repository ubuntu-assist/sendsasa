/**
 * Mobile Money payout service — Cameroon (XAF)
 *
 * Providers: MTN Mobile Money, Orange Money, UBA M2U
 *
 * TODO: Replace stub implementations with real API calls once
 *       the Mobile Wallet API documentation is received.
 *       Each provider class has a clear interface to fill in.
 */

import logger from '../utils/logger'

export type MobileMoneyProvider = 'mtn' | 'orange' | 'uba'

export interface PayoutRequest {
  provider: MobileMoneyProvider
  recipientPhone: string   // E.164 format e.g. "+237612345678"
  amount: number           // XAF amount (integer)
  currency: 'XAF'
  reference: string        // Unique reference — use OffRampTransaction._id
  description: string      // Shown to recipient e.g. "SendSasa from @john.sasa"
}

export interface PayoutResult {
  success: boolean
  providerTxId?: string    // Transaction ID from the Mobile Money provider
  reference: string        // Echo of request.reference
  message: string
}

// ── Provider interface ────────────────────────────────────────────────────────

interface IMobileMoneyProvider {
  payout(request: PayoutRequest): Promise<PayoutResult>
}

// ── MTN Mobile Money ──────────────────────────────────────────────────────────
// TODO: Wire in Mobile Wallet API (docs pending)
// Likely endpoints: POST /disbursement/v1_0/transfer

class MTNMobileMoneyProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[MTN MoMo] Initiating payout: ${request.amount} XAF → ${request.recipientPhone} (ref: ${request.reference})`)

    // TODO: Replace with real API call
    // const response = await axios.post('https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer', {
    //   amount: request.amount.toString(),
    //   currency: 'XAF',
    //   externalId: request.reference,
    //   payee: { partyIdType: 'MSISDN', partyId: request.recipientPhone.replace('+', '') },
    //   payerMessage: request.description,
    //   payeeNote: request.description,
    // }, { headers: { ... } })

    throw new Error('MTN MoMo API not yet configured — awaiting API documentation')
  }
}

// ── Orange Money ──────────────────────────────────────────────────────────────
// TODO: Wire in Mobile Wallet API (docs pending)

class OrangeMoneyProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[Orange Money] Initiating payout: ${request.amount} XAF → ${request.recipientPhone} (ref: ${request.reference})`)

    // TODO: Replace with real API call
    throw new Error('Orange Money API not yet configured — awaiting API documentation')
  }
}

// ── UBA M2U ───────────────────────────────────────────────────────────────────
// TODO: Wire in Mobile Wallet API (docs pending)

class UBAM2UProvider implements IMobileMoneyProvider {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    logger.info(`[UBA M2U] Initiating payout: ${request.amount} XAF → ${request.recipientPhone} (ref: ${request.reference})`)

    // TODO: Replace with real API call
    throw new Error('UBA M2U API not yet configured — awaiting API documentation')
  }
}

// ── Factory ───────────────────────────────────────────────────────────────────

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

class MobileMoneyService {
  async payout(request: PayoutRequest): Promise<PayoutResult> {
    const provider = providers[request.provider]
    if (!provider) {
      throw new Error(`Unknown mobile money provider: ${request.provider}`)
    }
    return provider.payout(request)
  }
}

export const mobileMoneyService = new MobileMoneyService()
