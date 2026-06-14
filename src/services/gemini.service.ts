import { Injectable } from '@nestjs/common'
import { GoogleGenerativeAI } from '@google/generative-ai'
import config from '../utils/config'
import type {
  AdjudicationParams,
  DisputeVerdict,
  PayrollItem,
  CreateInvoiceDto,
} from '../types'
import logger from '../utils/logger'

@Injectable()
export class GeminiService {
  private readonly model = new GoogleGenerativeAI(
    config.GEMINI_API_KEY ?? '',
  ).getGenerativeModel({ model: 'gemini-1.5-flash' })

  async adjudicateDispute(params: AdjudicationParams): Promise<DisputeVerdict> {
    const prompt = `You are a neutral marketplace dispute arbiter.

Deal: "${params.dealTitle}" — ${params.dealAmount} XAF
Buyer's reason: "${params.buyerReason}"
Evidence URLs: ${params.evidenceUrls.length > 0 ? params.evidenceUrls.join(', ') : 'none'}

Respond ONLY with valid JSON, no markdown:
{"verdict":"RELEASE|REFUND|MANUAL_REVIEW","confidence":0.0,"reasoning":"one sentence"}`

    try {
      const result = await this.model.generateContent(prompt)
      const text = result.response.text().trim()
      const clean = text.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      const parsed = JSON.parse(clean) as DisputeVerdict
      logger.info(`[Gemini] Dispute verdict: ${parsed.verdict} (${parsed.confidence})`)
      return parsed
    } catch (err) {
      logger.error('[Gemini] adjudicateDispute error:', err)
      return { verdict: 'MANUAL_REVIEW', confidence: 0, reasoning: 'AI unavailable' }
    }
  }

  async parsePayroll(text: string): Promise<PayrollItem[]> {
    const prompt = `Parse this payroll instruction into a JSON array.
Rules:
- Bare 9-digit numbers → prepend "237" to make E.164 (no +)
- Return only valid JSON array, no markdown
- Each item: {"recipientPhone":"237XXXXXXXXX","recipientName":"Name or null","amount":NUMBER}

Input: "${text}"

Output:`

    try {
      const result = await this.model.generateContent(prompt)
      const raw = result.response.text().trim()
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      const items = JSON.parse(clean) as Array<{
        recipientPhone: string
        recipientName?: string
        amount: number
      }>
      logger.info(`[Gemini] Parsed ${items.length} payroll items`)
      return items.map((i) => ({
        recipientPhone: i.recipientPhone,
        recipientName: i.recipientName ?? undefined,
        amount: i.amount,
        status: 'PENDING' as const,
      }))
    } catch (err) {
      logger.error('[Gemini] parsePayroll error:', err)
      return []
    }
  }

  async parseInvoice(text: string): Promise<Partial<CreateInvoiceDto>> {
    const today = new Date().toISOString().split('T')[0]
    const prompt = `Extract invoice details from this text.
Today is ${today}. Return only valid JSON, no markdown:
{"clientPhone":"237XXXXXXXXX or null","description":"string","total":NUMBER,"dueDate":"YYYY-MM-DD"}

Input: "${text}"

Output:`

    try {
      const result = await this.model.generateContent(prompt)
      const raw = result.response.text().trim()
      const clean = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim()
      const parsed = JSON.parse(clean) as {
        clientPhone?: string
        description?: string
        total?: number
        dueDate?: string
      }
      logger.info('[Gemini] Parsed invoice from text')
      return {
        clientPhone: parsed.clientPhone ?? undefined,
        description: parsed.description,
        total: parsed.total,
        dueDate: parsed.dueDate ? new Date(parsed.dueDate) : undefined,
      }
    } catch (err) {
      logger.error('[Gemini] parseInvoice error:', err)
      return {}
    }
  }
}
