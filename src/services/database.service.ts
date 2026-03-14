// src/services/database-FINAL-FIXED.service.ts
import { User, Transaction, PaymentRequest, MessageLog } from '../models'
import { IUser, ITransaction, IPaymentRequest, IMessageLog } from '../types'
import {
  generateWallet,
  getEncryptedSeed,
  createRLUSDTrustLine,
  createUSDCTrustLine,
  getAllBalances,
} from './xrpl.service'

/**
 * User Management
 */
export class UserService {
  /**
   * Get user by WhatsApp ID
   */
  static async getUserByWhatsAppId(whatsappId: string): Promise<IUser | null> {
    return await User.findOne({ whatsappId })
  }

  /**
   * Get user by phone number
   */
  static async getUserByPhone(phoneNumber: string): Promise<IUser | null> {
    return await User.findOne({ phoneNumber })
  }

  /**
   * Get user by XRPL address
   */
  static async getUserByAddress(xrplAddress: string): Promise<IUser | null> {
    return await User.findOne({ xrplAddress })
  }

  /**
   * Create new user with XRPL wallet + RLUSD + USDC trust lines
   * FIXED: generateWallet handles funding automatically on testnet
   */
  static async createUser(
    whatsappId: string,
    phoneNumber: string,
  ): Promise<IUser> {
    // Check if user already exists
    const existingUser = await this.getUserByWhatsAppId(whatsappId)
    if (existingUser) {
      return existingUser
    }

    // Generate XRPL wallet (auto-funded on testnet!)
    const wallet = await generateWallet()
    const { address, seed } = wallet

    // Wait 2 seconds for ledger to process funding
    if (process.env.XRPL_NETWORK !== 'mainnet') {
      await new Promise((resolve) => setTimeout(resolve, 2000))
    }

    // Initialize trust line tracking
    let rlusdHash: string | undefined
    let usdcHash: string | undefined
    let rlusdCreated = false
    let usdcCreated = false

    // Create RLUSD trust line (non-blocking - FREE!)
    try {
      const rlusdResult = await createRLUSDTrustLine(seed)
      if (rlusdResult.success) {
        rlusdHash = rlusdResult.hash
        rlusdCreated = true
        console.log(`✅ RLUSD trust line created (FREE): ${rlusdHash}`)
      }
    } catch (error) {
      console.error('⚠️ RLUSD trust line failed (non-critical):', error)
    }

    // Create USDC trust line (non-blocking - FREE!)
    try {
      const usdcResult = await createUSDCTrustLine(seed)
      if (usdcResult.success) {
        usdcHash = usdcResult.hash
        usdcCreated = true
        console.log(`✅ USDC trust line created (FREE): ${usdcHash}`)
      }
    } catch (error) {
      console.error('⚠️ USDC trust line failed (non-critical):', error)
    }

    // Create user document
    const user = new User({
      whatsappId,
      phoneNumber,
      xrplAddress: address,
      encryptedSeed: getEncryptedSeed(seed),

      // Required fields
      username: `@${phoneNumber.slice(-8)}.sasa`, // Generate default username from phone
      pinHash: '', // Empty for now - user will set PIN later

      // Multi-currency support
      preferredCurrency: 'XRP', // Default
      rlusdTrustLineCreated: rlusdCreated,
      usdcTrustLineCreated: usdcCreated,
      rlusdTrustLineHash: rlusdHash,
      usdcTrustLineHash: usdcHash,

      // Timestamps
      createdAt: new Date(),
      lastActive: new Date(),
    })

    await user.save()

    console.log(`✅ User created: ${whatsappId} | ${address}`)
    return user
  }

  /**
   * Update user's preferred currency
   */
  static async updatePreferredCurrency(
    whatsappId: string,
    currency: 'XRP' | 'RLUSD' | 'USDC',
  ): Promise<IUser | null> {
    return await User.findOneAndUpdate(
      { whatsappId },
      { preferredCurrency: currency },
      { new: true },
    )
  }

  /**
   * Update trust line status
   */
  static async updateTrustLineStatus(
    whatsappId: string,
    currency: 'RLUSD' | 'USDC',
    txHash: string,
  ): Promise<IUser | null> {
    const update =
      currency === 'RLUSD'
        ? { rlusdTrustLineCreated: true, rlusdTrustLineHash: txHash }
        : { usdcTrustLineCreated: true, usdcTrustLineHash: txHash }

    return await User.findOneAndUpdate({ whatsappId }, update, { new: true })
  }

  /**
   * Get user balances (all currencies)
   */
  static async getUserBalances(user: IUser): Promise<{
    xrp: string
    rlusd: string
    usdc: string
  }> {
    return await getAllBalances(user.xrplAddress)
  }

  /**
   * Update last active timestamp
   */
  static async updateLastActive(whatsappId: string): Promise<void> {
    await User.updateOne({ whatsappId }, { lastActive: new Date() })
  }

  /**
   * Get user by username
   */
  static async getUserByUsername(username: string): Promise<IUser | null> {
    return await User.findOne({ username: username.toLowerCase() })
  }

  /**
   * Update username
   */
  static async updateUsername(
    whatsappId: string,
    newUsername: string,
  ): Promise<IUser | null> {
    return await User.findOneAndUpdate(
      { whatsappId },
      {
        username: newUsername.toLowerCase(),
        usernameLastChanged: new Date(),
      },
      { new: true },
    )
  }

  /**
   * Check if username is available
   */
  static async isUsernameAvailable(username: string): Promise<boolean> {
    const existing = await User.findOne({ username: username.toLowerCase() })
    return !existing
  }
}

/**
 * Transaction Management
 */
export class TransactionService {
  /**
   * Log transaction to database
   * UPDATED: Added currency parameter
   */
  static async logTransaction(
    txHash: string,
    fromAddress: string,
    toAddress: string,
    amount: number,
    currency: 'XRP' | 'RLUSD' | 'USDC' = 'XRP', // NEW: Currency parameter
    status: 'pending' | 'success' | 'failed',
    fromPhone?: string,
    toPhone?: string,
  ): Promise<ITransaction> {
    const transaction = new Transaction({
      txHash,
      fromAddress,
      toAddress,
      fromPhone,
      toPhone,
      amount,
      currency, // NEW: Currency field
      status,
      timestamp: new Date(),
    })

    await transaction.save()
    console.log(`📝 Transaction logged: ${txHash} (${currency})`)
    return transaction
  }

  /**
   * Get transaction by hash
   */
  static async getTransactionByHash(
    txHash: string,
  ): Promise<ITransaction | null> {
    return await Transaction.findOne({ txHash })
  }

  /**
   * Get transactions for an address
   */
  static async getTransactionsForAddress(
    address: string,
    limit: number = 10,
  ): Promise<ITransaction[]> {
    return await Transaction.find({
      $or: [{ fromAddress: address }, { toAddress: address }],
    })
      .sort({ timestamp: -1 })
      .limit(limit)
  }

  /**
   * Get transactions for a phone number
   */
  static async getTransactionsForPhone(
    phoneNumber: string,
    limit: number = 10,
  ): Promise<ITransaction[]> {
    return await Transaction.find({
      $or: [{ fromPhone: phoneNumber }, { toPhone: phoneNumber }],
    })
      .sort({ timestamp: -1 })
      .limit(limit)
  }

  /**
   * Update transaction status
   */
  static async updateTransactionStatus(
    txHash: string,
    status: 'pending' | 'success' | 'failed',
  ): Promise<ITransaction | null> {
    return await Transaction.findOneAndUpdate(
      { txHash },
      { status },
      { new: true },
    )
  }
}

/**
 * Payment Request Management
 */
export class PaymentRequestService {
  /**
   * Create payment request
   * UPDATED: Added currency parameter
   */
  static async createPaymentRequest(
    requesterAddress: string,
    requesterPhone: string,
    payerAddress: string,
    payerPhone: string,
    amount: number,
    currency: 'XRP' | 'RLUSD' | 'USDC' = 'XRP', // NEW: Currency parameter
    message?: string,
  ): Promise<IPaymentRequest> {
    const requestId = `PR_${Date.now()}_${Math.random().toString(36).substring(7)}`

    const request = new PaymentRequest({
      requestId,
      requesterAddress,
      requesterPhone,
      payerAddress,
      payerPhone,
      amount,
      currency, // NEW: Currency field
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    })

    await request.save()
    console.log(`📝 Payment request created: ${requestId} (${currency})`)
    return request
  }

  /**
   * Get payment request by ID
   */
  static async getPaymentRequestById(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOne({ requestId })
  }

  /**
   * Get pending requests for payer
   */
  static async getPendingRequestsForPayer(
    payerAddress: string,
  ): Promise<IPaymentRequest[]> {
    return await PaymentRequest.find({
      payerAddress,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })
  }

  /**
   * Get pending requests for requester
   */
  static async getPendingRequestsForRequester(
    requesterAddress: string,
  ): Promise<IPaymentRequest[]> {
    return await PaymentRequest.find({
      requesterAddress,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })
  }

  /**
   * Approve payment request
   */
  static async approvePaymentRequest(
    requestId: string,
    txHash: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOneAndUpdate(
      { requestId },
      {
        status: 'approved',
        txHash,
        completedAt: new Date(),
      },
      { new: true },
    )
  }

  /**
   * Reject payment request
   */
  static async rejectPaymentRequest(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOneAndUpdate(
      { requestId },
      {
        status: 'rejected',
        completedAt: new Date(),
      },
      { new: true },
    )
  }

  /**
   * Fail payment request
   */
  static async failPaymentRequest(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOneAndUpdate(
      { requestId },
      {
        status: 'failed',
        completedAt: new Date(),
      },
      { new: true },
    )
  }

  /**
   * Expire old requests
   */
  static async expireOldRequests(): Promise<void> {
    await PaymentRequest.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() },
      },
      { status: 'expired' },
    )
  }
}

/**
 * Message Log Management
 */
export class MessageLogService {
  /**
   * Log incoming message
   */
  static async logIncomingMessage(
    whatsappId: string,
    message: string,
  ): Promise<IMessageLog> {
    const log = new MessageLog({
      whatsappId,
      direction: 'incoming',
      message,
      timestamp: new Date(),
    })

    await log.save()
    return log
  }

  /**
   * Log outgoing message
   */
  static async logOutgoingMessage(
    whatsappId: string,
    message: string,
  ): Promise<IMessageLog> {
    const log = new MessageLog({
      whatsappId,
      direction: 'outgoing',
      message,
      timestamp: new Date(),
    })

    await log.save()
    return log
  }

  /**
   * Get message history for user
   */
  static async getMessageHistory(
    whatsappId: string,
    limit: number = 50,
  ): Promise<IMessageLog[]> {
    return await MessageLog.find({ whatsappId })
      .sort({ timestamp: -1 })
      .limit(limit)
  }

  /**
   * Clear old message logs (older than 30 days)
   */
  static async clearOldLogs(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await MessageLog.deleteMany({ timestamp: { $lt: thirtyDaysAgo } })
  }
}
