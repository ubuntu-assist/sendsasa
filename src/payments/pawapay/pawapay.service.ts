import { Injectable } from '@nestjs/common'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'
import logger from '@common/utils/logger'
import config from '@common/utils/config'

@Injectable()
export class PawapayService {
  private get http() {
    return axios.create({
      baseURL: config.PAWAPAY_API_URL,
      headers: { Authorization: `Bearer ${config.PAWAPAY_API_TOKEN}` },
      timeout: 15000,
    })
  }

  generateId(): string {
    return uuidv4()
  }

  // pawaPay customerMessage must be 4–22 alphanumeric chars (no spaces/punctuation).
  private sanitizeCustomerMessage(s: string): string {
    const clean = s.replace(/[^A-Za-z0-9]/g, '')
    return clean.length >= 4 ? clean.slice(0, 22) : 'SendSasa'
  }

  async predictCorrespondent(phone: string): Promise<string> {
    const normalized = phone.replace(/^\+/, '')
    const { data } = await this.http.post('/v2/predict-provider', {
      phoneNumber: normalized,
    })
    return data.provider as string
  }

  async initiateDeposit(
    depositId: string,
    phone: string,
    amount: number,
    description: string,
    clientReferenceId?: string,
  ): Promise<{
    depositId: string
    status: 'ACCEPTED' | 'REJECTED'
    rejectionReason?: string
  }> {
    const provider = await this.predictCorrespondent(phone)
    const body: Record<string, unknown> = {
      depositId,
      amount: String(Math.round(amount)),
      currency: 'XAF',
      payer: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: phone.replace(/^\+/, ''),
          provider,
        },
      },
      customerMessage: this.sanitizeCustomerMessage(description),
    }
    if (clientReferenceId) body.clientReferenceId = clientReferenceId

    const { data } = await this.http.post('/v2/deposits', body)
    logger.info(`[pawaPay] Deposit ${depositId} → ${data.status}`)
    return {
      depositId: data.depositId ?? depositId,
      status: data.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      rejectionReason: data.failureReason?.failureMessage,
    }
  }

  async initiatePayout(
    payoutId: string,
    phone: string,
    amount: number,
    description: string,
    clientReferenceId?: string,
  ): Promise<{
    payoutId: string
    status: 'ACCEPTED' | 'REJECTED'
    rejectionReason?: string
  }> {
    const provider = await this.predictCorrespondent(phone)
    const body: Record<string, unknown> = {
      payoutId,
      amount: String(Math.round(amount)),
      currency: 'XAF',
      recipient: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: phone.replace(/^\+/, ''),
          provider,
        },
      },
      customerMessage: this.sanitizeCustomerMessage(description),
    }
    if (clientReferenceId) body.clientReferenceId = clientReferenceId

    const { data } = await this.http.post('/v2/payouts', body)
    logger.info(`[pawaPay] Payout ${payoutId} → ${data.status}`)
    return {
      payoutId: data.payoutId ?? payoutId,
      status: data.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
      rejectionReason: data.failureReason?.failureMessage,
    }
  }

  async bulkPayout(
    recipients: Array<{
      payoutId: string
      phone: string
      amount: number
      description: string
    }>,
  ): Promise<
    Array<{ payoutId: string; status: string; rejectionReason?: string }>
  > {
    const results: Array<{
      payoutId: string
      status: string
      rejectionReason?: string
    }> = []

    for (let i = 0; i < recipients.length; i += 20) {
      const chunk = recipients.slice(i, i + 20)
      const payouts = await Promise.all(
        chunk.map(async (r) => {
          const provider = await this.predictCorrespondent(r.phone)
          return {
            payoutId: r.payoutId,
            amount: String(Math.round(r.amount)),
            currency: 'XAF',
            recipient: {
              type: 'MMO',
              accountDetails: {
                phoneNumber: r.phone.replace(/^\+/, ''),
                provider,
              },
            },
            customerMessage: this.sanitizeCustomerMessage(r.description),
          }
        }),
      )

      const { data } = await this.http.post('/v2/payouts/bulk', payouts)
      const items: Array<{
        payoutId: string
        status: string
        rejectionReason?: string
      }> = Array.isArray(data) ? data : []
      results.push(...items)
      logger.info(
        `[pawaPay] Bulk payout chunk ${i}–${i + chunk.length}: ${items.length} items`,
      )
    }

    return results
  }

  async initiateRefund(
    refundId: string,
    depositId: string,
    amount: number,
    _reason: string,
  ): Promise<{ refundId: string; status: 'ACCEPTED' | 'REJECTED' }> {
    const { data } = await this.http.post('/v2/refunds', {
      refundId,
      depositId,
      amount: String(Math.round(amount)),
      currency: 'XAF',
    })
    logger.info(`[pawaPay] Refund ${refundId} → ${data.status}`)
    return {
      refundId: data.refundId ?? refundId,
      status: data.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
    }
  }

  // Returns both depositId (to store for callback matching) and the redirect URL.
  async createPaymentPage(
    _amount: number,
    description: string,
    returnUrl: string,
  ): Promise<{ depositId: string; pageUrl: string }> {
    const depositId = this.generateId()
    const { data } = await this.http.post('/v2/paymentpage', {
      depositId,
      returnUrl,
      reason: description.slice(0, 50),
    })
    logger.info(`[pawaPay] Payment page response: ${JSON.stringify(data)}`)
    return {
      depositId,
      pageUrl: (data.redirectUrl ?? data.pageUrl ?? data.url) as string,
    }
  }

  private remittanceCorridorsCache?: { data: any[]; expiresAt: number }

  async getActiveRemittanceCorridors(): Promise<any[]> {
    const now = Date.now()
    if (
      this.remittanceCorridorsCache &&
      now < this.remittanceCorridorsCache.expiresAt
    ) {
      return this.remittanceCorridorsCache.data
    }

    const { data } = await this.http.get('/v2/active-conf', {
      params: { operationType: 'REMITTANCE' },
    })

    // Flatten countries → providers → currencies into a list of active corridors.
    const corridors: any[] = []
    const countries: any[] = Array.isArray(data?.countries) ? data.countries : []
    for (const countryEntry of countries) {
      for (const providerEntry of countryEntry.providers ?? []) {
        for (const currencyEntry of providerEntry.currencies ?? []) {
          const remittanceOp = currencyEntry?.operationTypes?.REMITTANCE
          if (remittanceOp?.status === 'ACTIVE') {
            corridors.push({
              receivingCountry: countryEntry.country,
              receivingCurrency: currencyEntry.currency,
              provider: providerEntry.provider,
              minAmount: remittanceOp.minAmount,
              maxAmount: remittanceOp.maxAmount,
            })
          }
        }
      }
    }

    this.remittanceCorridorsCache = {
      data: corridors,
      expiresAt: now + 5 * 60 * 1000,
    }
    logger.info(`[pawaPay] Fetched ${corridors.length} remittance corridors`)
    return corridors
  }

  async remittance(
    remittanceId: string,
    senderPhone: string,
    recipientPhone: string,
    _recipientCountry: string,
    sendAmount: number,
    exchangeRate: number,
    description: string,
    receiveCurrency: string,
    receiveAmount: number,
  ): Promise<{
    remittanceId: string
    status: 'ACCEPTED' | 'REJECTED'
    rejectionReason?: string
  }> {
    const recipientProvider = await this.predictCorrespondent(recipientPhone)
    const body = {
      remittanceId,
      amount: String(Math.round(receiveAmount)),
      currency: receiveCurrency,
      customerMessage: this.sanitizeCustomerMessage(description),
      recipient: {
        type: 'MMO',
        accountDetails: {
          phoneNumber: recipientPhone.replace(/^\+/, ''),
          provider: recipientProvider,
        },
        recipientDetails: {
          firstName: 'Recipient',
          lastName: 'Unknown',
        },
      },
      sender: {
        transactionDetails: {
          transactionReference: remittanceId,
          originalAmount: String(Math.round(sendAmount)),
          originalCurrency: 'XAF',
          buyFxRate: String(exchangeRate),
          senderFees: '0',
          purposeOfFunds: 'FAMILY_SUPPORT',
          sourceOfFunds: 'SALARY',
        },
        senderDetails: {
          firstName: 'Sender',
          lastName: 'Unknown',
          dateOfBirth: '1990-01-01',
          nationality: 'CMR',
          phoneNumber: senderPhone.replace(/^\+/, ''),
          address: {
            addressLine: 'Cameroon',
            postalCode: '00237',
            city: 'Yaounde',
            country: 'CMR',
          },
          identification: {
            type: 'NATIONAL_ID',
            number: '000000000',
          },
        },
      },
    }
    try {
      const { data } = await this.http.post('/v2/remittances', body)
      logger.info(`[pawaPay] Remittance ${remittanceId} → ${data.status}`)
      return {
        remittanceId: data.remittanceId ?? remittanceId,
        status: data.status === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED',
        rejectionReason: data.failureReason?.failureMessage,
      }
    } catch (err: any) {
      logger.error(`[pawaPay] Remittance ${remittanceId} failed: ${JSON.stringify(err?.response?.data ?? err?.message)}`)
      throw err
    }
  }
}

export const pawapayService = new PawapayService()
