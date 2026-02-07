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
  timestamp: Date
}

class PendingTransactionService {
  private readonly transactions: Map<string, PendingTransaction> = new Map()

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

  get(transactionId: string): PendingTransaction | undefined {
    return this.transactions.get(transactionId)
  }

  delete(transactionId: string): void {
    this.transactions.delete(transactionId)
  }

  getByUser(whatsappId: string): PendingTransaction[] {
    const userTransactions: PendingTransaction[] = []

    for (const [id, tx] of this.transactions.entries()) {
      if (tx.whatsappId === whatsappId) {
        userTransactions.push(tx)
      }
    }

    return userTransactions
  }

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
