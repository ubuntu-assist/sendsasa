import { User, Transaction, PaymentRequest, MessageLog } from '../models'
import { IUser, ITransaction, IPaymentRequest, IMessageLog } from '../types'
import { getAllBalances } from './xrpl.service'
import { walletService } from './wallet.service'
import { normalizeToE164 } from './phone-number.service'

export class UserService {
  static async getUserByWhatsAppId(whatsappId: string): Promise<IUser | null> {
    return await User.findOne({ whatsappId })
  }

  static async getUserByPhone(phoneNumber: string): Promise<IUser | null> {
    return await User.findOne({ phoneNumber })
  }

  static async getUserByAddress(xrpl_address: string): Promise<IUser | null> {
    return await User.findOne({ xrpl_address })
  }

  static async createUser(
    whatsappId: string,
    phoneNumber: string,
  ): Promise<IUser> {
    const existingUser = await this.getUserByWhatsAppId(whatsappId)
    if (existingUser) {
      return existingUser
    }

    // Derive wallet addresses via Web3Auth (no private keys stored)
    const e164Phone = normalizeToE164(phoneNumber)
    const { evmAddress, xrplAddress } =
      await walletService.getOrCreateWallets(e164Phone)

    const user = new User({
      whatsappId,
      phoneNumber: e164Phone,
      xrplAddress,

      // Required fields
      username: `@${e164Phone.slice(-8)}.sasa`,
      pinHash: '',

      rlusdTrustLineCreated: false,
      usdcTrustLineCreated: false,

      // Web3Auth fields
      evm_address: evmAddress,
      xrpl_address: xrplAddress,
      web3auth_verifier_id: e164Phone,
      wallet_created_at: new Date(),

      createdAt: new Date(),
      lastActive: new Date(),
    })

    await user.save()

    return user
  }

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

  static async getUserBalances(user: IUser): Promise<{
    xrp: string
    rlusd: string
    usdc: string
  }> {
    return await getAllBalances(user.xrpl_address!)
  }

  static async updateLastActive(whatsappId: string): Promise<void> {
    await User.updateOne({ whatsappId }, { lastActive: new Date() })
  }

  static async getUserByUsername(username: string): Promise<IUser | null> {
    return await User.findOne({ username: username.toLowerCase() })
  }

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

  static async isUsernameAvailable(username: string): Promise<boolean> {
    const existing = await User.findOne({ username: username.toLowerCase() })
    return !existing
  }
}

export class TransactionService {
  static async logTransaction(
    txHash: string,
    fromAddress: string,
    toAddress: string,
    amount: number,
    currency: 'XRP' | 'RLUSD' | 'USDC' = 'XRP',
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
      currency,
      status,
      timestamp: new Date(),
    })

    await transaction.save()

    return transaction
  }

  static async getTransactionByHash(
    txHash: string,
  ): Promise<ITransaction | null> {
    return await Transaction.findOne({ txHash })
  }

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

export class PaymentRequestService {
  static async createPaymentRequest(
    requesterAddress: string,
    requesterPhone: string,
    payerAddress: string,
    payerPhone: string,
    amount: number,
    currency: 'XRP' | 'RLUSD' | 'USDC' = 'XRP',
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
      currency,
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    })

    await request.save()

    return request
  }

  static async getPaymentRequestById(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOne({ requestId })
  }

  static async getPendingRequestsForPayer(
    payerAddress: string,
  ): Promise<IPaymentRequest[]> {
    return await PaymentRequest.find({
      payerAddress,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })
  }

  static async getPendingRequestsForRequester(
    requesterAddress: string,
  ): Promise<IPaymentRequest[]> {
    return await PaymentRequest.find({
      requesterAddress,
      status: 'pending',
      expiresAt: { $gt: new Date() },
    }).sort({ createdAt: -1 })
  }

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

export class MessageLogService {
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

  static async getMessageHistory(
    whatsappId: string,
    limit: number = 50,
  ): Promise<IMessageLog[]> {
    return await MessageLog.find({ whatsappId })
      .sort({ timestamp: -1 })
      .limit(limit)
  }

  static async clearOldLogs(): Promise<void> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    await MessageLog.deleteMany({ timestamp: { $lt: thirtyDaysAgo } })
  }
}
