import { Document } from 'mongoose'

export interface WalletInfo {
  address: string
  seed: string
  publicKey: string
  privateKey: string
}

export interface TransactionResult {
  success: boolean
  hash: string
  amount: string
  from: string
  to: string
  message: string
}

export interface BalanceInfo {
  address: string
  balance: string
  currency: string
}

export interface TransactionHistory {
  hash: string
  date: Date
  amount: string
  from: string
  to: string
  direction: 'sent' | 'received'
}

export interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  text: {
    body: string
  }
  type: 'text' | 'button' | 'interactive'
}

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: {
            name: string
          }
          wa_id: string
        }>
        messages?: WhatsAppMessage[]
        statuses?: Array<{
          id: string
          status: string
          timestamp: string
          recipient_id: string
        }>
      }
      field: string
    }>
  }>
}

export interface WhatsAppTextMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'text'
  text: {
    preview_url: boolean
    body: string
  }
}

export interface WhatsAppInteractiveMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'interactive'
  interactive: {
    type: 'button'
    body: {
      text: string
    }
    action: {
      buttons: Array<{
        type: 'reply'
        reply: {
          id: string
          title: string
        }
      }>
    }
  }
}

export type CommandType =
  | 'balance'
  | 'send'
  | 'request'
  | 'history'
  | 'address'
  | 'help'
  | 'requests'
  | 'menu'
  | 'get_started'
  | 'unknown'

export interface ParsedCommand {
  type: CommandType
  amount?: number
  recipient?: string
  message?: string
}

export type UserState = 'new' | 'registered'

export type MenuAction =
  | 'send_money'
  | 'request_money'
  | 'my_wallet'
  | 'help'
  | 'transaction_history'
  | 'pending_requests'
  | 'share_address'
  | 'main_menu'

export interface SendMoneyFlowData {
  amount: number
  recipient: string
  recipientType: 'phone' | 'address'
  message?: string
}

export interface RequestMoneyFlowData {
  amount: number
  from: string
  fromType: 'phone' | 'address'
  reason?: string
}

export interface InteractiveMessage {
  type: 'interactive'
  from: string
  id: string
  timestamp: string
  interactive: {
    type: string
    button_reply?: {
      id: string
      title: string
    }
  }
}

export interface ButtonMessage {
  type: 'button'
  from: string
  id: string
  timestamp: string
  button: {
    payload: string
    text: string
  }
}

export interface IUser extends Document {
  whatsappId: string
  phoneNumber: string
  createdAt: Date
  lastActive: Date

  // Security fields (PIN)
  pinHash: string
  pinAttempts: number
  pinLockedUntil?: Date
  pinLastChanged: Date
  pinSetupComplete: boolean

  // Username fields
  username: string // @marie.sasa
  usernameLastChanged?: Date

  securityQuestions: ISecurityQuestion[]
  pendingPinRecovery?: { step: 1 | 2; expiresAt: Date }

  // RLUSD trust line tracking
  rlusdTrustLineCreated: boolean
  rlusdTrustLineHash?: string

  // USDC trust line tracking
  usdcTrustLineCreated: boolean
  usdcTrustLineHash?: string

  // Web3Auth wallet fields
  web3auth_verifier_id: string     // E.164 phone number
  evm_address: string              // Cached 0x... (same for BSC/Base/ETH)
  xrpl_address: string             // Cached r...
  solana_address: string           // Cached base58 Solana public key
  wallet_created_at: Date
  beneficiaries: IBeneficiary[]
  momotrustContext?: string
  momotrustContextUpdatedAt?: Date
}

export interface IBeneficiary {
  id: string
  nickname: string
  phoneNumber: string
  addedAt: Date
}

export interface ISecurityQuestion {
  questionId: string
  answerHash: string
}

export interface ITransaction extends Document {
  txHash: string
  fromAddress: string
  toAddress: string
  fromPhone?: string
  toPhone?: string
  amount: number

  currency: 'XRP' | 'RLUSD' | 'USDC' | 'BNB' | 'USDT' | 'USDC_BSC' | 'SOL' | 'USDC_SOL' | 'USDT_SOL' | 'EURC_SOL'

  status: 'pending' | 'success' | 'failed'
  timestamp: Date
}

export interface IPaymentRequest extends Document {
  requestId: string
  requesterAddress: string
  requesterPhone: string
  payerAddress: string
  payerPhone: string
  amount: number

  currency: 'XRP' | 'RLUSD' | 'USDC' | 'BNB' | 'USDT' | 'USDC_BSC' | 'SOL' | 'USDC_SOL' | 'USDT_SOL' | 'EURC_SOL'

  message?: string
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'failed'
  txHash?: string
  createdAt: Date
  expiresAt: Date
  completedAt?: Date
}

export interface IMessageLog extends Document {
  whatsappId: string
  direction: 'incoming' | 'outgoing'
  messageType: 'text' | 'interactive' | 'button'
  message: string
  timestamp: Date
}

// ── MoMo Trust enums ──────────────────────────────────────────────────────────

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

// ── MoMo Trust DTOs ───────────────────────────────────────────────────────────

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
}

export interface CreatePotDto {
  name: string
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
  description: string
  total: number
  dueDate: Date
}

// ── KoboKall types ───────────────────────────────────────────────────────────

export enum RemittanceStatus {
  INITIATED  = 'INITIATED',
  PROCESSING = 'PROCESSING',
  COMPLETED  = 'COMPLETED',
  FAILED     = 'FAILED',
  CANCELLED  = 'CANCELLED',
}

export interface KoboKallRemittance {
  remittanceId: string
  senderPhone: string
  recipientPhone: string
  recipientCountry: string
  sendAmount: number
  receiveAmount: number
  receiveCurrency: string
  exchangeRate: number
  correspondent: string
  status: RemittanceStatus
  failureCode?: string
}

export interface CreateKoboKallDto {
  recipientPhone: string
  recipientCountry: string
  sendAmount: number
}

// ── Gemini AI types ───────────────────────────────────────────────────────────

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
