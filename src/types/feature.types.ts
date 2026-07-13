export enum DealStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  ACTIVE = 'ACTIVE',
  RELEASING = 'RELEASING',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  EXPIRED = 'EXPIRED',
}

export enum GroupStatus {
  SETUP = 'SETUP',
  ACTIVE = 'ACTIVE',
  COLLECTING = 'COLLECTING',
  PAYING_OUT = 'PAYING_OUT',
  CYCLE_COMPLETE = 'CYCLE_COMPLETE',
  COMPLETED = 'COMPLETED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
  DISSOLVED = 'DISSOLVED',
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  DISBURSING = 'DISBURSING',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  REMINDER_SENT = 'REMINDER_SENT',
  CANCELLED = 'CANCELLED',
}

export interface CreateDealDto {
  title: string
  description?: string
  category: string
  amount: number
  sellerPhone: string
}

export interface FileDisputeDto {
  reason: string
  description?: string
}

export interface CreateGroupDto {
  name: string
  contributionAmount: number
  cycleDurationDays: number
  totalCycles: number
  payoutOrder?: 'sequential' | 'random' | 'admin_choice'
  allowDiaspora?: boolean
}

export interface CreatePotDto {
  name: string
  mode: 'ORGANIZER' | 'SPLIT'
  amountPerPerson: number
  targetParticipants: number
  deadline?: Date
}

export interface PayrollItem {
  recipientPhone: string
  recipientName?: string
  amount: number
  provider?: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  pawapayPayoutId?: string
  failureReason?: string
  paidAt?: Date
}

export interface CreatePayrollDto {
  name: string
  items: PayrollItem[]
}

export interface CreateInvoiceDto {
  clientPhone: string
  clientName?: string
  clientEmail?: string
  description: string
  total: number
  currency?: 'EUR' | 'USD' | 'XAF'
  dueDate: Date
}

export interface CreateKoboKallDto {
  recipientPhone: string
  amount: number
}

export interface AdjudicationParams {
  dealTitle: string
  dealAmount: number
  buyerReason: string
  evidenceUrls: string[]
}

export interface DisputeVerdict {
  verdict: 'RELEASE' | 'REFUND' | 'MANUAL_REVIEW'
  confidence: number
  reasoning: string
}
