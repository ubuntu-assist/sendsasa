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
