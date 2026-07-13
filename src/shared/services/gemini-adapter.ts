import { Injectable } from '@nestjs/common'
import { GeminiService } from './gemini.service'
import type { AdjudicationParams, DisputeVerdict, PayrollItem, CreateInvoiceDto } from '@app/types'

export interface IAIService {
  adjudicateDispute(params: AdjudicationParams): Promise<DisputeVerdict>
  parsePayroll(text: string): Promise<PayrollItem[]>
  parseInvoice(text: string): Promise<Partial<CreateInvoiceDto>>
}

@Injectable()
export class GeminiAdapter implements IAIService {
  constructor(private readonly gemini: GeminiService) {}

  adjudicateDispute(params: AdjudicationParams): Promise<DisputeVerdict> {
    return this.gemini.adjudicateDispute(params)
  }

  parsePayroll(text: string): Promise<PayrollItem[]> {
    return this.gemini.parsePayroll(text)
  }

  parseInvoice(text: string): Promise<Partial<CreateInvoiceDto>> {
    return this.gemini.parseInvoice(text)
  }
}
