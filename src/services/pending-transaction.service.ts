// src/services/pending-transaction-MULTI-CURRENCY.service.ts
/**
 * In-memory storage for pending transactions
 * In production, use Redis for distributed systems
 */

interface PendingTransaction {
  whatsappId: string
  phoneNumber: string
  senderAddress: string
  recipientAddress: string
  recipientDisplay: string
  recipientPhone?: string
  amount: number
  currency?: 'XRP' | 'RLUSD' | 'USDC' // NEW: Currency field
  timestamp: Date
}

class PendingTransactionService {
  private readonly transactions: Map<string, PendingTransaction> = new Map()

  /**
   * Store a pending transaction
   */
  store(transactionId: string, transaction: PendingTransaction): void {
    this.transactions.set(transactionId, transaction)

    // Auto-expire after 5 minutes
    setTimeout(
      () => {
        this.transactions.delete(transactionId)
      },
      5 * 60 * 1000,
    )
  }

  /**
   * Get a pending transaction
   */
  get(transactionId: string): PendingTransaction | undefined {
    return this.transactions.get(transactionId)
  }

  /**
   * Delete a pending transaction
   */
  delete(transactionId: string): void {
    this.transactions.delete(transactionId)
  }

  /**
   * Get all pending transactions for a user
   */
  getByUser(whatsappId: string): PendingTransaction[] {
    const userTransactions: PendingTransaction[] = []

    for (const [, tx] of this.transactions.entries()) {
      if (tx.whatsappId === whatsappId) {
        userTransactions.push(tx)
      }
    }

    return userTransactions
  }

  /**
   * Clear expired transactions (older than 5 minutes)
   */
  clearExpired(): void {
    const now = new Date()
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000)

    for (const [id, tx] of this.transactions.entries()) {
      if (tx.timestamp < fiveMinutesAgo) {
        this.transactions.delete(id)
      }
    }
  }
}

export const pendingTransactionService = new PendingTransactionService()
