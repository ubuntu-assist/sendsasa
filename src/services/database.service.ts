import { User, Transaction, PaymentRequest, MessageLog } from '../models'
import { IUser, ITransaction, IPaymentRequest, IMessageLog } from '../types'
import { generateWallet, getEncryptedSeed } from './xrpl.service'
import { pinVerificationService } from './pin-verification.service'
import { usernameService } from './username.service'

export class UserService {
  static async getUserByWhatsAppId(whatsappId: string): Promise<IUser | null> {
    return await User.findOne({ whatsappId })
  }

  static async getUserByPhone(phoneNumber: string): Promise<IUser | null> {
    return await User.findOne({ phoneNumber })
  }

  static async getUserByAddress(xrplAddress: string): Promise<IUser | null> {
    return await User.findOne({ xrplAddress })
  }

  static async getUserByUsername(username: string): Promise<IUser | null> {
    return await usernameService.getUserByUsername(username)
  }

  static async createUser(
    whatsappId: string,
    phoneNumber: string,
    pin: string,
    whatsappName?: string,
  ): Promise<IUser> {
    const existingUser = await this.getUserByWhatsAppId(whatsappId)
    if (existingUser) {
      return existingUser
    }

    const wallet = await generateWallet()

    const pinHash = await pinVerificationService.hashPIN(pin)

    const username = await usernameService.generateUsername(
      whatsappName || phoneNumber,
    )

    const user = new User({
      whatsappId,
      phoneNumber,
      xrplAddress: wallet.address,
      encryptedSeed: getEncryptedSeed(wallet.seed),
      createdAt: new Date(),
      lastActive: new Date(),

      pinHash,
      pinAttempts: 0,
      pinLastChanged: new Date(),

      username,
    })

    await user.save()

    console.log(`User created: ${username} → ${wallet.address}`)

    return user
  }

  static async updateLastActive(whatsappId: string): Promise<void> {
    await User.updateOne({ whatsappId }, { $set: { lastActive: new Date() } })
  }

  static async getAllUsers(limit: number = 100): Promise<IUser[]> {
    return await User.find().sort({ createdAt: -1 }).limit(limit)
  }

  static async getUserCount(): Promise<number> {
    return await User.countDocuments()
  }

  static async deleteUser(whatsappId: string): Promise<void> {
    await User.deleteOne({ whatsappId })
  }
}

export class TransactionService {
  static async logTransaction(
    txHash: string,
    fromAddress: string,
    toAddress: string,
    amount: number,
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
      status,
      timestamp: new Date(),
    })

    await transaction.save()

    console.log(`📝 Transaction logged: ${txHash} (${status})`)

    return transaction
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

  static async getTransactionByHash(
    txHash: string,
  ): Promise<ITransaction | null> {
    return await Transaction.findOne({ txHash })
  }

  static async getAllTransactions(
    limit: number = 100,
  ): Promise<ITransaction[]> {
    return await Transaction.find().sort({ timestamp: -1 }).limit(limit)
  }
}

export class PaymentRequestService {
  static async createPaymentRequest(
    requesterAddress: string,
    requesterPhone: string,
    payerAddress: string,
    payerPhone: string,
    amount: number,
    message?: string,
  ): Promise<IPaymentRequest> {
    const requestId = `REQ_${Date.now()}_${Math.random().toString(36).substring(7)}`
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    const request = new PaymentRequest({
      requestId,
      requesterAddress,
      requesterPhone,
      payerAddress,
      payerPhone,
      amount,
      message,
      status: 'pending',
      createdAt: new Date(),
      expiresAt,
    })

    await request.save()

    console.log(`Payment request created: ${requestId}`)

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

  static async approvePaymentRequest(
    requestId: string,
    txHash: string,
  ): Promise<IPaymentRequest | null> {
    const request = await PaymentRequest.findOneAndUpdate(
      { requestId, status: 'pending' },
      {
        $set: {
          status: 'approved',
          txHash,
          completedAt: new Date(),
        },
      },
      { new: true },
    )

    if (request) {
      console.log(`✅ Payment request approved: ${requestId}`)
    }

    return request
  }

  static async rejectPaymentRequest(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    const request = await PaymentRequest.findOneAndUpdate(
      { requestId, status: 'pending' },
      {
        $set: {
          status: 'rejected',
          completedAt: new Date(),
        },
      },
      { new: true },
    )

    if (request) {
      console.log(`❌ Payment request rejected: ${requestId}`)
    }

    return request
  }

  static async failPaymentRequest(
    requestId: string,
  ): Promise<IPaymentRequest | null> {
    return await PaymentRequest.findOneAndUpdate(
      { requestId },
      {
        $set: {
          status: 'failed',
          completedAt: new Date(),
        },
      },
      { new: true },
    )
  }

  static async cleanupExpiredRequests(): Promise<number> {
    const result = await PaymentRequest.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() },
      },
      {
        $set: { status: 'expired' },
      },
    )

    console.log(`Cleaned up ${result.modifiedCount} expired requests`)

    return result.modifiedCount || 0
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
      messageType: 'text',
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
      messageType: 'text',
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

  static async getAllMessageLogs(limit: number = 100): Promise<IMessageLog[]> {
    return await MessageLog.find().sort({ timestamp: -1 }).limit(limit)
  }

  static async cleanupOldLogs(): Promise<number> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

    const result = await MessageLog.deleteMany({
      timestamp: { $lt: thirtyDaysAgo },
    })

    console.log(`Cleaned up ${result.deletedCount} old message logs`)

    return result.deletedCount || 0
  }
}
