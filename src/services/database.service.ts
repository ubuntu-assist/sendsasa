import { User, Transaction, PaymentRequest, MessageLog } from '../models'
import { IUser, ITransaction, IPaymentRequest, IMessageLog } from '../types'
import { generateWallet, getEncryptedSeed } from './xrpl.service'

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

  static async createUser(
    whatsappId: string,
    phoneNumber: string,
  ): Promise<IUser> {
    const existingUser = await this.getUserByWhatsAppId(whatsappId)
    if (existingUser) {
      return existingUser
    }

    const wallet = await generateWallet()

    const user = new User({
      whatsappId,
      phoneNumber,
      xrplAddress: wallet.address,
      encryptedSeed: getEncryptedSeed(wallet.seed),
      createdAt: new Date(),
      lastActive: new Date(),
    })

    await user.save()

    console.log(`User created: ${whatsappId} → ${wallet.address}`)

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
    status: 'pending' | 'success' | 'failed' = 'success',
    fromPhone?: string,
    toPhone?: string,
  ): Promise<ITransaction> {
    const transaction = new Transaction({
      txHash,
      fromAddress,
      toAddress,
      amount,
      status,
      fromPhone,
      toPhone,
      timestamp: new Date(),
    })

    await transaction.save()

    console.log(`Transaction logged: ${txHash}`)

    return transaction
  }

  static async getTransactionsByAddress(
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

  static async updateTransactionStatus(
    txHash: string,
    status: 'pending' | 'success' | 'failed',
  ): Promise<void> {
    await Transaction.updateOne({ txHash }, { $set: { status } })
  }

  static async getTransactionCount(): Promise<number> {
    return await Transaction.countDocuments()
  }

  static async getSuccessfulTransactionCount(): Promise<number> {
    return await Transaction.countDocuments({ status: 'success' })
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
    const requestId = `PR-${Date.now()}-${Math.random()
      .toString(36)
      .substring(7)}`

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
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
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

  static async getPendingRequestsFromRequester(
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
  ): Promise<void> {
    await PaymentRequest.updateOne(
      { requestId },
      {
        $set: {
          status: 'approved',
          txHash,
          completedAt: new Date(),
        },
      },
    )
  }

  static async rejectPaymentRequest(requestId: string): Promise<void> {
    await PaymentRequest.updateOne(
      { requestId },
      {
        $set: {
          status: 'rejected',
          completedAt: new Date(),
        },
      },
    )
  }

  static async failPaymentRequest(requestId: string): Promise<void> {
    await PaymentRequest.updateOne(
      { requestId },
      {
        $set: {
          status: 'failed',
          completedAt: new Date(),
        },
      },
    )
  }

  static async expireOldRequests(): Promise<number> {
    const result = await PaymentRequest.updateMany(
      {
        status: 'pending',
        expiresAt: { $lt: new Date() },
      },
      {
        $set: { status: 'expired' },
      },
    )

    return result.modifiedCount
  }
}

export class MessageLogService {
  static async logIncomingMessage(
    whatsappId: string,
    message: string,
    messageType: 'text' | 'interactive' | 'button' = 'text',
  ): Promise<void> {
    const log = new MessageLog({
      whatsappId,
      direction: 'incoming',
      messageType,
      message,
      timestamp: new Date(),
    })

    await log.save()
  }

  static async logOutgoingMessage(
    whatsappId: string,
    message: string,
    messageType: 'text' | 'interactive' | 'button' = 'text',
  ): Promise<void> {
    const log = new MessageLog({
      whatsappId,
      direction: 'outgoing',
      messageType,
      message,
      timestamp: new Date(),
    })

    await log.save()
  }

  static async getMessageHistory(
    whatsappId: string,
    limit: number = 50,
  ): Promise<IMessageLog[]> {
    return await MessageLog.find({ whatsappId })
      .sort({ timestamp: -1 })
      .limit(limit)
  }

  static async getMessageCount(): Promise<number> {
    return await MessageLog.countDocuments()
  }
}
