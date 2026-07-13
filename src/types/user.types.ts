import { Document } from 'mongoose'

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

export interface ISecurityQuestion {
  questionId: string
  answerHash: string
}

export interface IBeneficiary {
  id: string
  nickname: string
  phoneNumber: string
  addedAt: Date
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
  stellar_public_key?: string      // Cached Stellar G... public key (Ed25519)
  lisk_address?: string            // Cached 0x... on Lisk L2 (same as evm_address)
  wallet_created_at: Date
  beneficiaries: IBeneficiary[]
  momotrustContext?: string
  momotrustContextUpdatedAt?: Date
  operatingRegion?: 'cameroon' | 'europe' | 'north_america' | 'other'
}

// ── Typed session context (State pattern) ─────────────────────────────────────

export type UserContext =
  | { type: 'KOBOKALL'; id: string }
  | { type: 'NJANGI'; groupId: string }
  | { type: 'SPLITCHAT'; groupId: string }
  | { type: 'PAYDAY'; payrollId: string }
  | { type: 'SAFIPAY'; invoiceId: string }
  | { type: 'DISPUTE'; disputeId: string }
  | { type: 'CRYPTO_SELL'; asset: string; amount?: string }

export function serializeUserContext(ctx: UserContext): string {
  return JSON.stringify(ctx)
}

export function parseUserContext(raw: string | undefined): UserContext | null {
  if (!raw) return null
  // Try new JSON format first
  try {
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed.type === 'string') return parsed as UserContext
  } catch {}
  // Backward-compat: parse legacy colon-delimited format from existing DB rows
  const colonIdx = raw.indexOf(':')
  if (colonIdx === -1) return null
  const type = raw.slice(0, colonIdx)
  const rest = raw.slice(colonIdx + 1)
  switch (type) {
    case 'KOBOKALL': return { type: 'KOBOKALL', id: rest }
    case 'NJANGI': return { type: 'NJANGI', groupId: rest }
    case 'SPLITCHAT': return { type: 'SPLITCHAT', groupId: rest }
    case 'PAYDAY': return { type: 'PAYDAY', payrollId: rest }
    case 'SAFIPAY': return { type: 'SAFIPAY', invoiceId: rest }
    case 'DISPUTE': return { type: 'DISPUTE', disputeId: rest }
    case 'CRYPTO_SELL': {
      const parts = rest.split(':')
      return { type: 'CRYPTO_SELL', asset: parts[0], amount: parts[1] }
    }
    default: return null
  }
}
