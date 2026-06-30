export interface StellarPaymentEvent {
  id: string
  paging_token: string
  type: string
  from: string
  to: string
  asset_type: string
  asset_code?: string
  asset_issuer?: string
  amount: string
  transaction_hash: string
  created_at: string
}

export interface Sep38Quote {
  id: string
  expires_at: string
  price: string
  sell_asset: string
  buy_asset: string
  sell_amount: string
  buy_amount: string
  fee?: {
    total: string
    asset: string
  }
}

export interface Sep38PriceResponse {
  buy_amount: string
  sell_amount: string
  price: string
  fee?: {
    total: string
    asset: string
  }
}

export interface Sep31TransactionRequest {
  amount: string
  asset_code: string
  asset_issuer: string
  quote_id?: string
  stellar_payment_account_id?: string
  fields: {
    receiver: {
      mobile_number: string
      country_code: string
    }
  }
  sender_id?: string
  receiver_id?: string
}

export interface Sep31TransactionResponse {
  id: string
  stellar_account_id: string
  stellar_memo_type: string
  stellar_memo: string
}

export interface Sep10Challenge {
  transaction: string
  network_passphrase: string
}

export interface HorizonCursorDoc {
  key: string
  paging_token: string
}

export interface SorobanContractEvent {
  id: string
  ledger: number
  ledgerClosedAt: string
  contractId: string
  type: string
  topic: string[]
  value: unknown
  txHash: string
}

export interface TrustLockContractState {
  client: string
  provider: string
  amount: bigint
  token: string
  lockTime: number
  released: boolean
}

export interface StellarAccountInfo {
  publicKey: string
  sponsored: boolean
  usdcTrustline: boolean
}
