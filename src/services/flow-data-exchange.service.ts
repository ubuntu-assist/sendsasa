import crypto from 'crypto'
import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { User } from '../models/User'
import { isPhoneNumber } from './message-parser.service'
import { getAllBalances } from './xrpl.service'
import config from '../utils/config'

/**
 * WhatsApp Flow Data Exchange Service
 *
 * Handles real-time screen-by-screen validation during WhatsApp Flows.
 *
 * IMPORTANT — why we do NOT execute the XRPL transaction here:
 * WhatsApp enforces a strict 10-second timeout on data_exchange responses.
 * XRPL submitAndWait alone takes 4-8 seconds. Combined with PIN check,
 * balance fetch, and recipient lookup it consistently exceeds the limit,
 * causing "could not load content". All heavy async work (transaction
 * execution, receipt generation) happens in message-handler.service after
 * the nfm_reply arrives from the terminal SEND_MONEY_SUCCESS screen.
 */

interface FlowDataExchangeRequest {
  version: string
  action: string
  flow_token: string
  screen: string
  data: Record<string, any>
}

interface FlowDataExchangeResponse {
  version: string
  screen: string
  data?: Record<string, any>
}

export class FlowDataExchangeService {
  private static readonly PRIVATE_KEY = config.PRIVATE_KEY!

  /**
   * Normalize a PIN to a canonical string.
   * Passcode inputs arrive as numbers during data_exchange (1042)
   * but as strings during complete ("01042"). parseInt strips leading
   * zeros so both representations hash/compare to the same value.
   */
  private static normalizePin(pin: string | number): string {
    return parseInt(pin.toString(), 10).toString()
  }

  /**
   * Decrypt incoming request from WhatsApp
   */
  private static decryptRequest(
    encryptedAesKey: string,
    encryptedFlowData: string,
    initialVector: string,
  ): {
    decryptedBody: FlowDataExchangeRequest
    aesKeyBuffer: Buffer
    initialVectorBuffer: Buffer
  } {
    try {
      let privateKey = FlowDataExchangeService.PRIVATE_KEY

      if (privateKey.includes('|')) {
        privateKey = privateKey.replace(/\|/g, '\n')
      }

      if (!privateKey.includes('-----BEGIN')) {
        throw new Error(
          'Invalid private key format. Must be in PEM format starting with -----BEGIN',
        )
      }

      const decryptedAesKey = crypto.privateDecrypt(
        {
          key: privateKey,
          padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
          oaepHash: 'sha256',
        },
        Buffer.from(encryptedAesKey, 'base64'),
      )

      const flowDataBuffer = Buffer.from(encryptedFlowData, 'base64')
      const initialVectorBuffer = Buffer.from(initialVector, 'base64')

      const TAG_LENGTH = 16
      const encryptedFlowDataBody = flowDataBuffer.subarray(0, -TAG_LENGTH)
      const encryptedFlowDataTag = flowDataBuffer.subarray(-TAG_LENGTH)

      const decipher = crypto.createDecipheriv(
        'aes-128-gcm',
        decryptedAesKey,
        initialVectorBuffer,
      )
      decipher.setAuthTag(encryptedFlowDataTag)

      const decryptedJSONString = Buffer.concat([
        decipher.update(encryptedFlowDataBody),
        decipher.final(),
      ]).toString('utf-8')

      return {
        decryptedBody: JSON.parse(decryptedJSONString),
        aesKeyBuffer: decryptedAesKey,
        initialVectorBuffer,
      }
    } catch (error) {
      console.error('Decryption error:', error)
      if (error instanceof Error) {
        if (
          error.message.includes('unsupported') ||
          error.message.includes('DECODER')
        ) {
          throw new Error(
            'Private key format error. Ensure PRIVATE_KEY is a valid RSA private key in PEM format.',
          )
        }
      }
      throw new Error('Failed to decrypt request')
    }
  }

  /**
   * Encrypt outgoing response to WhatsApp
   * CRITICAL: Must flip IV before encrypting response
   */
  private static encryptResponse(
    response: any,
    aesKeyBuffer: Buffer,
    initialVectorBuffer: Buffer,
  ): string {
    try {
      const flippedIv: number[] = []
      for (const pair of initialVectorBuffer.entries()) {
        flippedIv.push(~pair[1])
      }

      const cipher = crypto.createCipheriv(
        'aes-128-gcm',
        aesKeyBuffer,
        Buffer.from(flippedIv),
      )

      return Buffer.concat([
        cipher.update(JSON.stringify(response), 'utf-8'),
        cipher.final(),
        cipher.getAuthTag(),
      ]).toString('base64')
    } catch (error) {
      console.error('Encryption error:', error)
      throw new Error('Failed to encrypt response')
    }
  }

  /**
   * Handle data exchange endpoint
   */
  static async handleDataExchange(req: Request, res: Response): Promise<void> {
    try {
      const { encrypted_flow_data, encrypted_aes_key, initial_vector } =
        req.body

      if (!encrypted_flow_data || !encrypted_aes_key || !initial_vector) {
        res.status(400).json({ error: 'Missing required encryption fields' })
        return
      }

      const { decryptedBody, aesKeyBuffer, initialVectorBuffer } =
        FlowDataExchangeService.decryptRequest(
          encrypted_aes_key,
          encrypted_flow_data,
          initial_vector,
        )

      console.log('Flow Data Exchange:', {
        action: decryptedBody.action,
        screen: decryptedBody.screen,
        data: decryptedBody.data,
        version: decryptedBody.version,
        flow_token: decryptedBody.flow_token ? 'present' : 'missing',
      })

      // HEALTH CHECK
      if (decryptedBody.action === 'ping') {
        console.log('🏥 Health check (ping) request detected')
        const healthCheckResponse = {
          version: decryptedBody.version,
          data: { status: 'active' },
        }
        res.send(
          FlowDataExchangeService.encryptResponse(
            healthCheckResponse,
            aesKeyBuffer,
            initialVectorBuffer,
          ),
        )
        return
      }

      let responseData: FlowDataExchangeResponse

      if (decryptedBody.screen === 'PIN_SETUP') {
        responseData =
          await FlowDataExchangeService.handlePinSetup(decryptedBody)
      } else if (decryptedBody.screen === 'SECURITY_QUESTIONS') {
        responseData =
          await FlowDataExchangeService.handleSecurityQuestions(decryptedBody)
      } else if (decryptedBody.screen === 'SEND_MONEY_DETAILS') {
        responseData =
          await FlowDataExchangeService.handleSendMoneyDetails(decryptedBody)
      } else if (decryptedBody.screen === 'SEND_MONEY_CONFIRM') {
        responseData =
          await FlowDataExchangeService.handleSendMoneyConfirm(decryptedBody)
      } else if (decryptedBody.screen === 'REQUEST_MONEY_DETAILS') {
        responseData =
          await FlowDataExchangeService.handleRequestMoneyDetails(decryptedBody)
      } else if (decryptedBody.screen === 'REQUEST_MONEY_CONFIRM') {
        responseData =
          await FlowDataExchangeService.handleRequestMoneyConfirm(decryptedBody)
      } else {
        responseData = {
          version: decryptedBody.version,
          screen: decryptedBody.screen,
          data: decryptedBody.data,
        }
      }

      res.send(
        FlowDataExchangeService.encryptResponse(
          responseData,
          aesKeyBuffer,
          initialVectorBuffer,
        ),
      )
    } catch (error) {
      console.error('❌ Data exchange error:', error)
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  /**
   * PIN Setup screen — validate pin/confirm_pin, navigate to SECURITY_QUESTIONS
   */
  private static async handlePinSetup(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { pin, confirm_pin } = flowData.data

    console.log('Validating PIN Setup:', {
      pin,
      confirm_pin,
      pinType: typeof pin,
      confirmPinType: typeof confirm_pin,
    })

    const errors: Record<string, string> = {}

    if (pin === undefined || pin === null || pin === '') {
      errors['pin'] = 'PIN is required'
    } else {
      const pinStr = pin.toString()
      if (!/^\d+$/.test(pinStr)) {
        errors['pin'] = 'PIN must contain only numbers'
      } else if (pinStr.length < 4 || pinStr.length > 6) {
        errors['pin'] = 'PIN must be 4-6 digits'
      }
    }

    if (
      confirm_pin === undefined ||
      confirm_pin === null ||
      confirm_pin === ''
    ) {
      errors['confirm_pin'] = 'Please confirm your PIN'
    } else if (
      pin !== undefined &&
      pin !== null &&
      pin.toString() !== confirm_pin.toString()
    ) {
      errors['confirm_pin'] = 'PINs do not match'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: 'PIN_SETUP',
        data: { ...flowData.data, __errors__: errors },
      }
    }

    return {
      version: flowData.version,
      screen: 'SECURITY_QUESTIONS',
      data: {
        pin: Number(pin),
        confirm_pin: Number(confirm_pin),
      },
    }
  }

  /**
   * Security Questions screen
   */
  private static async handleSecurityQuestions(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { answer_1, answer_2 } = flowData.data
    const errors: Record<string, string> = {}

    if (!answer_1 || answer_1.trim() === '') {
      errors['answer_1'] = 'Answer 1 is required'
    }
    if (!answer_2 || answer_2.trim() === '') {
      errors['answer_2'] = 'Answer 2 is required'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: 'SECURITY_QUESTIONS',
        data: { ...flowData.data, __errors__: errors },
      }
    }

    return {
      version: flowData.version,
      screen: flowData.screen,
      data: flowData.data,
    }
  }

  /**
   * Send Money Details screen
   *
   * Called for both dropdown on-select (partial) and footer submit (full).
   * Always re-fetches balances so balance TextBody components stay populated.
   */
  private static async handleSendMoneyDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { currency, amount, recipient_type, recipient } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    if (!user) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          available_balance_xrp: '0',
          available_balance_rlusd: '0',
          available_balance_usdc: '0',
          __errors__: { amount: 'User not found' },
        },
      }
    }

    let balances = { xrp: '0', rlusd: '0', usdc: '0' }
    try {
      balances = await getAllBalances(user.xrplAddress)
    } catch (error) {
      console.error('Failed to fetch balances:', error)
    }

    const balanceData = {
      available_balance_xrp: balances.xrp,
      available_balance_rlusd: balances.rlusd,
      available_balance_usdc: balances.usdc,
    }

    // Partial submit (dropdown on-select) — return screen as-is with fresh balances
    const isFullSubmit = currency && amount && recipient_type && recipient
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, ...balanceData },
      }
    }

    const errors: Record<string, string> = {}

    // Validate amount + balance
    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      errors['amount'] = 'Amount must be greater than 0'
    } else {
      let balance = 0
      if (currency === 'XRP') balance = parseFloat(balances.xrp)
      else if (currency === 'RLUSD') balance = parseFloat(balances.rlusd)
      else if (currency === 'USDC') balance = parseFloat(balances.usdc)

      const total = numAmount + numAmount * 0.001
      if (total > balance) {
        errors['amount'] =
          `Insufficient ${currency} balance. Available: ${balance.toFixed(6)}`
      }
    }

    // Validate recipient exists
    const validation = await FlowDataExchangeService.validateRecipient(
      recipient,
      recipient_type,
    )
    if (!validation.valid) {
      errors['recipient'] = validation.error || 'Invalid recipient'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, ...balanceData, __errors__: errors },
      }
    }

    const numAmt = parseFloat(amount)
    const fee = numAmt * 0.001
    const total = numAmt + fee
    const recipientDisplay =
      await FlowDataExchangeService.getRecipientDisplayName(
        recipient,
        recipient_type,
      )

    return {
      version: flowData.version,
      screen: 'SEND_MONEY_CONFIRM',
      data: {
        currency: currency.toString(),
        amount: numAmt.toString(),
        recipient_type: recipient_type.toString(),
        recipient: recipient.toString(),
        recipient_display: recipientDisplay,
        fee: fee.toFixed(6),
        total: total.toFixed(6),
      },
    }
  }

  /**
   * Send Money Confirm screen — validation only, NO transaction execution.
   *
   * Validates: PIN lockout → PIN correctness → balance (re-check) → recipient.
   * On success: navigates to SEND_MONEY_SUCCESS terminal screen.
   * The actual XRPL transaction is executed by message-handler after nfm_reply,
   * which keeps this response well within WhatsApp's 10-second timeout.
   */
  private static async handleSendMoneyConfirm(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const {
      currency,
      amount,
      recipient_type,
      recipient,
      recipient_display,
      fee,
      total,
      transaction_pin,
    } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    if (!user) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: { transaction_pin: 'User not found' },
        },
      }
    }

    if (!user.pinHash) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: { transaction_pin: 'PIN not set up yet' },
        },
      }
    }

    // --- PIN lockout check ---
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.pinLockedUntil.getTime() - Date.now()) / 60000,
      )
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: {
            transaction_pin: `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`,
          },
        },
      }
    }

    // --- PIN validation ---
    if (
      transaction_pin === undefined ||
      transaction_pin === null ||
      transaction_pin === ''
    ) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: { transaction_pin: 'Transaction PIN is required' },
        },
      }
    }

    const pinStr = FlowDataExchangeService.normalizePin(transaction_pin)
    const isPinValid = await bcrypt.compare(pinStr, user.pinHash)

    console.log('🔐 PIN validation in data exchange:', {
      rawPin: transaction_pin,
      normalizedPin: pinStr,
      isValid: isPinValid,
    })

    if (!isPinValid) {
      user.pinAttempts = (user.pinAttempts || 0) + 1

      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000)
        user.pinAttempts = 0
        await user.save()
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            __errors__: {
              transaction_pin:
                'Too many incorrect attempts. Account locked for 15 minutes',
            },
          },
        }
      }

      await user.save()
      const attemptsLeft = 3 - user.pinAttempts
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: {
            transaction_pin: `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining`,
          },
        },
      }
    }

    // PIN correct — reset attempts
    if (user.pinAttempts > 0) {
      user.pinAttempts = 0
      user.pinLockedUntil = undefined
      await user.save()
    }

    // --- Re-check balance (quick, no tx yet) ---
    try {
      const balances = await getAllBalances(user.xrplAddress)
      let balance = 0
      if (currency === 'XRP') balance = parseFloat(balances.xrp)
      else if (currency === 'RLUSD') balance = parseFloat(balances.rlusd)
      else if (currency === 'USDC') balance = parseFloat(balances.usdc)

      const numTotal = parseFloat(total || '0') || parseFloat(amount) * 1.001

      if (numTotal > balance) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            __errors__: {
              transaction_pin: `Insufficient ${currency} balance. Available: ${balance.toFixed(6)}`,
            },
          },
        }
      }
    } catch (error) {
      console.error('Balance re-check failed:', error)
      // Non-blocking — proceed, final check happens in message-handler
    }

    // --- Re-check recipient exists ---
    const validation = await FlowDataExchangeService.validateRecipient(
      recipient,
      recipient_type,
    )
    if (!validation.valid) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          __errors__: {
            transaction_pin: validation.error || 'Invalid recipient',
          },
        },
      }
    }

    // --- All valid — navigate to success screen ---
    // Transaction is NOT executed here. message-handler executes it
    // after receiving the nfm_reply from the SEND_MONEY_SUCCESS Done button.
    return {
      version: flowData.version,
      screen: 'SEND_MONEY_SUCCESS',
      data: {
        currency,
        amount: amount.toString(),
        total: total || (parseFloat(amount) * 1.001).toFixed(6),
        recipient_display: recipient_display || recipient,
        recipient_type,
        recipient,
      },
    }
  }

  /**
   * Request Money Details screen
   *
   * Validates amount and recipient existence before navigating to confirm.
   */
  private static async handleRequestMoneyDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { amount, recipient_type, recipient } = flowData.data
    const errors: Record<string, string> = {}

    // Partial submit — return as-is
    const isFullSubmit = amount && recipient_type && recipient
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: flowData.data,
      }
    }

    const numAmount = parseFloat(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      errors['amount'] = 'Amount must be greater than 0'
    }

    const validation = await FlowDataExchangeService.validateRecipient(
      recipient,
      recipient_type,
    )
    if (!validation.valid) {
      errors['recipient'] = validation.error || 'Invalid recipient'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, __errors__: errors },
      }
    }

    const recipientDisplay =
      await FlowDataExchangeService.getRecipientDisplayName(
        recipient,
        recipient_type,
      )

    return {
      version: flowData.version,
      screen: 'REQUEST_MONEY_CONFIRM',
      data: {
        ...flowData.data,
        amount: numAmount.toString(),
        recipient_display: recipientDisplay,
      },
    }
  }

  /**
   * Request Money Confirm screen — no additional validation needed.
   * Recipient was already validated in handleRequestMoneyDetails.
   */
  private static async handleRequestMoneyConfirm(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    return {
      version: flowData.version,
      screen: flowData.screen,
      data: flowData.data,
    }
  }

  /**
   * Validate recipient — checks format and existence on SendSasa
   */
  private static async validateRecipient(
    recipient: string,
    type: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      if (type === 'Phone Number') {
        if (!isPhoneNumber(recipient)) {
          return { valid: false, error: 'Invalid phone number format' }
        }
        const cleanPhone = recipient.replace(/\+/g, '').replace(/\s/g, '')
        const recipientUser = await User.findOne({ whatsappId: cleanPhone })
        if (!recipientUser) {
          return { valid: false, error: 'Phone number not found on SendSasa' }
        }
        return { valid: true }
      } else if (type === 'SendSasa Username') {
        const user = await User.findOne({ username: recipient.toLowerCase() })
        if (!user) {
          return { valid: false, error: 'Username not found on SendSasa' }
        }
        return { valid: true }
      } else if (type === 'Wallet Address') {
        if (!/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(recipient)) {
          return { valid: false, error: 'Invalid XRPL wallet address format' }
        }
        return { valid: true }
      }
      return { valid: false, error: 'Invalid recipient type' }
    } catch (error) {
      console.error('Recipient validation error:', error)
      return { valid: false, error: 'Validation failed' }
    }
  }

  /**
   * Get display name for recipient
   */
  private static async getRecipientDisplayName(
    recipient: string,
    type: string,
  ): Promise<string> {
    try {
      if (type === 'Phone Number') {
        const cleanPhone = recipient.replace(/\+/g, '').replace(/\s/g, '')
        const user = await User.findOne({ whatsappId: cleanPhone })
        if (user && user.username) {
          return `@${user.username} (${recipient})`
        }
        return recipient
      } else if (type === 'SendSasa Username') {
        return `@${recipient}`
      } else if (type === 'Wallet Address') {
        return `${recipient.slice(0, 8)}...${recipient.slice(-6)}`
      }
      return recipient
    } catch (error) {
      console.error('Get display name error:', error)
      return recipient
    }
  }

  /**
   * Extract WhatsApp ID from flow token
   * Token format: base64(whatsappId:timestamp:signature)
   */
  private static extractWhatsappIdFromToken(flowToken: string): string {
    try {
      const decoded = Buffer.from(flowToken, 'base64').toString('utf-8')
      return decoded.split(':')[0]
    } catch (error) {
      console.error('Failed to extract whatsappId from token:', error)
      return ''
    }
  }

  /**
   * Generate flow token for user
   */
  static generateFlowToken(whatsappId: string): string {
    const timestamp = Date.now()
    const signature = crypto
      .createHmac('sha256', FlowDataExchangeService.PRIVATE_KEY)
      .update(`${whatsappId}:${timestamp}`)
      .digest('hex')

    return Buffer.from(`${whatsappId}:${timestamp}:${signature}`).toString(
      'base64',
    )
  }
}
