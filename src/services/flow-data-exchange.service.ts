import crypto from 'node:crypto'
import { Request, Response } from 'express'
import bcrypt from 'bcrypt'
import { Wallet } from 'xrpl'
import { User } from '../models/User'
import { OnRampTransaction } from '../models/OnRampTransaction'
import { isPhoneNumber } from './message-parser.service'
import { getAllBalances, isAccountActivated } from './xrpl.service'
import { evmService } from './evm.service'
import { getSOLBalance, getAllBalances as getSolanaBalances, isValidSolanaAddress } from './solana.service'
import { fxRateService } from './fx-rate.service'
import { normalizeToE164 } from './phone-number.service'
import {
  PROVIDER_DISPLAY,
  type MobileMoneyProvider,
} from './mobile-money.service'
import {
  calculateCardQuote,
  createSessionToken,
  buildPaymentURL,
  buildHeadlessPaymentURL,
  CARD_FEE_PCT,
} from './coinbase-onramp.service'
import { getAdminEVMAddress } from '../config/admin-wallet'
import { sendCtaUrlButton } from './whatsapp.service'
import config from '../utils/config'

const OFFRAMP_CURRENCIES = ['XRP', 'RLUSD', 'USDC', 'USDT']
const OFFRAMP_PROVIDERS: MobileMoneyProvider[] = ['mtn', 'orange', 'uba']

type ChainId = 'xrpl' | 'bsc' | 'solana'

const CURRENCY_CHAIN: Record<string, ChainId> = {
  XRP:      'xrpl',
  RLUSD:    'xrpl',
  USDC:     'xrpl',
  BNB:      'bsc',
  USDT:     'bsc',
  USDC_BSC: 'bsc',
  SOL:      'solana',
  USDC_SOL: 'solana',
  USDT_SOL: 'solana',
  EURC_SOL: 'solana',
}

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

  private static normalizePin(pin: string | number): string {
    return Number.parseInt(pin.toString(), 10).toString()
  }

  /** Convert { fieldName: errorMsg } → { error_fieldName: errorMsg, error_other: '' } */
  private static errorFields(
    errors: Record<string, string>,
    fields: string[],
  ): Record<string, string> {
    const result: Record<string, string> = {}
    for (const field of fields) {
      result[`error_${field}`] = errors[field] ?? ''
    }
    return result
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

      // Handle | separator (legacy .env format)
      if (privateKey.includes('|')) {
        privateKey = privateKey.replaceAll('|', '\n')
      }

      // Handle literal \n stored by Render/Railway env var editors
      if (privateKey.includes(String.raw`\n`)) {
        privateKey = privateKey.replaceAll(String.raw`\n`, '\n')
      }

      // Remove any surrounding quotes some env editors add
      privateKey = privateKey.replaceAll(/^["']|["']$/g, '')

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
   * Main entry point — handle data exchange endpoint
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
        res.send(
          FlowDataExchangeService.encryptResponse(
            { version: decryptedBody.version, data: { status: 'active' } },
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
      } else if (decryptedBody.screen === 'IMPORT_WALLET_SEED') {
        responseData =
          await FlowDataExchangeService.handleImportWalletSeed(decryptedBody)
      } else if (decryptedBody.screen === 'OFFRAMP_DETAILS') {
        responseData =
          await FlowDataExchangeService.handleOffRampDetails(decryptedBody)
      } else if (decryptedBody.screen === 'OFFRAMP_CONFIRM') {
        responseData =
          await FlowDataExchangeService.handleOffRampConfirm(decryptedBody)
      } else if (decryptedBody.screen === 'CARD_PAYMENT_DETAILS') {
        responseData =
          await FlowDataExchangeService.handleCardPaymentDetails(decryptedBody)
      } else if (decryptedBody.screen === 'CARD_PAYMENT_CONFIRM') {
        responseData =
          await FlowDataExchangeService.handleCardPaymentConfirm(decryptedBody)
      } else if (decryptedBody.screen === 'BENEFICIARY_LIST') {
        responseData =
          await FlowDataExchangeService.handleBeneficiaryList(decryptedBody)
      } else if (decryptedBody.screen === 'ADD_BENEFICIARY') {
        responseData =
          await FlowDataExchangeService.handleAddBeneficiary(decryptedBody)
      } else if (decryptedBody.screen === 'DELETE_BENEFICIARY') {
        responseData =
          await FlowDataExchangeService.handleDeleteBeneficiary(decryptedBody)
      } else if (decryptedBody.screen === 'SELECT_BENEFICIARY') {
        responseData =
          await FlowDataExchangeService.handleSelectBeneficiary(decryptedBody)
      } else if (decryptedBody.screen === 'SELECT_OFFRAMP_CONTACT') {
        responseData =
          await FlowDataExchangeService.handleSelectOfframpContact(decryptedBody)
      } else if (decryptedBody.screen === 'SELECT_CARD_CONTACT') {
        responseData =
          await FlowDataExchangeService.handleSelectCardContact(decryptedBody)
      } else if (decryptedBody.screen === 'SELECT_REQUEST_CONTACT') {
        responseData =
          await FlowDataExchangeService.handleSelectRequestContact(decryptedBody)
      } else if (decryptedBody.screen === 'REQUEST_CARD_DETAILS') {
        responseData =
          await FlowDataExchangeService.handleRequestCardDetails(decryptedBody)
      } else if (decryptedBody.screen === 'SELECT_REQUEST_CARD_CONTACT') {
        responseData =
          await FlowDataExchangeService.handleSelectRequestCardContact(decryptedBody)
      } else if (decryptedBody.screen === 'REQUEST_CARD_CONFIRM') {
        responseData =
          await FlowDataExchangeService.handleRequestCardConfirm(decryptedBody)
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
      console.error('Error details:', {
        message: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      })
      res.status(500).json({ error: 'Internal server error' })
    }
  }

  // ── PIN Setup ────────────────────────────────────────────────────────────

  /**
   * Validate PIN Setup screen
   *
   * Passcode inputs arrive as numbers — pass as Number() to SECURITY_QUESTIONS
   * which declares pin/confirm_pin as type: number in its data schema.
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
        data: {
          ...flowData.data,
          ...FlowDataExchangeService.errorFields(errors, [
            'pin',
            'confirm_pin',
          ]),
        },
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

  // ── Security Questions ───────────────────────────────────────────────────

  private static async handleSecurityQuestions(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { answer_1, answer_2 } = flowData.data

    console.log('Validating Security Questions:', {
      question_1: flowData.data.question_1,
      answer_1,
      question_2: flowData.data.question_2,
      answer_2,
    })

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
        data: {
          ...flowData.data,
          ...FlowDataExchangeService.errorFields(errors, [
            'answer_1',
            'answer_2',
          ]),
        },
      }
    }

    return {
      version: flowData.version,
      screen: flowData.screen,
      data: flowData.data,
    }
  }

  // ── Send Money Helpers ───────────────────────────────────────────────────

  private static async getBalanceForCurrency(user: any, currency: string): Promise<string> {
    try {
      const chain = CURRENCY_CHAIN[currency]
      if (!chain || chain === 'xrpl') {
        const balances = await getAllBalances(user.xrpl_address || user.xrplAddress)
        if (currency === 'RLUSD') return balances.rlusd
        if (currency === 'USDC') return balances.usdc
        return balances.xrp
      }
      if (chain === 'bsc') {
        if (!user.evm_address) return '0'
        if (currency === 'USDT') return evmService.getBalance(user.evm_address, 'bsc', 'USDT')
        if (currency === 'USDC_BSC') return evmService.getBalance(user.evm_address, 'bsc', 'USDC')
        return evmService.getBalance(user.evm_address, 'bsc')
      }
      if (chain === 'solana') {
        if (!user.solana_address) return '0'
        if (currency === 'USDC_SOL' || currency === 'USDT_SOL' || currency === 'EURC_SOL') {
          const bals = await getSolanaBalances(user.solana_address)
          if (currency === 'USDC_SOL') return bals.usdc
          if (currency === 'USDT_SOL') return bals.usdt
          return bals.eurc
        }
        return getSOLBalance(user.solana_address)
      }
      return '0'
    } catch {
      return '0'
    }
  }

  // ── Send Money Details ───────────────────────────────────────────────────

  /**
   * Called for both dropdown on-select (partial) and footer submit (full).
   * Re-fetches balance for the selected currency on every interaction.
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
          available_balance: '—',
          ...FlowDataExchangeService.errorFields({ amount: 'User not found' }, [
            'currency',
            'amount',
            'recipient_type',
            'recipient',
          ]),
        },
      }
    }

    const rawBalance = currency
      ? await FlowDataExchangeService.getBalanceForCurrency(user, currency)
      : '0'
    const balanceData = {
      available_balance: currency ? `${rawBalance} ${currency}` : 'Select a currency',
      xrpl_balances: flowData.data.xrpl_balances,
      bsc_balances: flowData.data.bsc_balances,
      solana_balances: flowData.data.solana_balances,
    }

    const isSavedContactFlow = recipient_type === 'Saved Contact'

    // Partial submit (dropdown on-select) — return screen as-is with fresh balance
    const isFullSubmit = currency && amount && recipient_type && (recipient || isSavedContactFlow)
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, ...balanceData },
      }
    }

    const errors: Record<string, string> = {}

    // Validate amount + balance
    const numAmount = Number.parseFloat(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      errors['amount'] = 'Amount must be greater than 0'
    } else {
      const balance = Number.parseFloat(rawBalance)
      const total = numAmount + numAmount * 0.001
      if (total > balance) {
        errors['amount'] = `Insufficient ${currency} balance. Available: ${balance.toFixed(6)}`
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...balanceData,
          ...FlowDataExchangeService.errorFields(errors, [
            'currency',
            'amount',
            'recipient_type',
            'recipient',
          ]),
        },
      }
    }

    const numAmt = Number.parseFloat(amount)

    // Saved contact: route to SELECT_BENEFICIARY with contacts list
    if (isSavedContactFlow) {
      const contacts = (user.beneficiaries ?? []).map((b: any) => ({
        id: b.phoneNumber,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))
      if (contacts.length === 0) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            ...balanceData,
            ...FlowDataExchangeService.errorFields(
              { recipient_type: 'You have no saved contacts. Add contacts via My Contacts first.' },
              ['currency', 'amount', 'recipient_type', 'recipient'],
            ),
          },
        }
      }
      return {
        version: flowData.version,
        screen: 'SELECT_BENEFICIARY',
        data: { currency, amount: numAmt.toString(), contacts },
      }
    }

    // Normal flow: validate recipient (chain-aware for wallet addresses)
    const validation = await FlowDataExchangeService.validateRecipient(
      recipient,
      recipient_type,
      currency,
    )
    if (!validation.valid) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...balanceData,
          ...FlowDataExchangeService.errorFields(
            { recipient: validation.error || 'Invalid recipient' },
            ['currency', 'amount', 'recipient_type', 'recipient'],
          ),
        },
      }
    }

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

  // ── Send Money Confirm ───────────────────────────────────────────────────

  /**
   * Validates PIN + balance + recipient. Does NOT execute the transaction.
   * Transaction runs in message-handler after nfm_reply to avoid the 10s timeout.
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
      total,
      transaction_pin,
    } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    const pinError = (msg: string) => ({
      version: flowData.version,
      screen: flowData.screen,
      data: { ...flowData.data, error_transaction_pin: msg },
    })

    if (!user) return pinError('User not found')
    if (!user.pinHash) return pinError('PIN not set up yet')

    // Check lockout
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.pinLockedUntil.getTime() - Date.now()) / 60000,
      )
      return pinError(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`,
      )
    }

    // Require PIN
    if (
      transaction_pin === undefined ||
      transaction_pin === null ||
      transaction_pin === ''
    ) {
      return pinError('Transaction PIN is required')
    }

    // Validate PIN
    const pinStr = FlowDataExchangeService.normalizePin(transaction_pin)
    const isPinValid = await bcrypt.compare(pinStr, user.pinHash)

    console.log('🔐 PIN validation in data exchange:', {
      normalizedPin: pinStr,
      isValid: isPinValid,
    })

    if (!isPinValid) {
      user.pinAttempts = (user.pinAttempts || 0) + 1

      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000)
        user.pinAttempts = 0
        await user.save()
        return pinError(
          'Too many incorrect attempts. Account locked for 15 minutes',
        )
      }

      await user.save()
      const attemptsLeft = 3 - user.pinAttempts
      return pinError(
        `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining`,
      )
    }

    // PIN correct — reset attempts
    if (user.pinAttempts > 0) {
      user.pinAttempts = 0
      user.pinLockedUntil = undefined
      await user.save()
    }

    // Re-check balance in real time
    try {
      const rawBalance = await FlowDataExchangeService.getBalanceForCurrency(user, currency)
      const balance = Number.parseFloat(rawBalance)
      const numTotal =
        Number.parseFloat(total || '0') || Number.parseFloat(amount) * 1.001

      if (numTotal > balance) {
        return pinError(
          `Insufficient ${currency} balance. Available: ${balance.toFixed(6)}`,
        )
      }
    } catch (error) {
      console.error('Balance re-check failed:', error)
      // Non-blocking — proceed, final check happens in message-handler
    }

    // Re-check recipient
    const validation = await FlowDataExchangeService.validateRecipient(
      recipient,
      recipient_type,
      currency,
    )
    if (!validation.valid) {
      return pinError(validation.error || 'Invalid recipient')
    }

    // All valid — navigate to SEND_MONEY_SUCCESS
    // Transaction executed in message-handler after nfm_reply
    return {
      version: flowData.version,
      screen: 'SEND_MONEY_SUCCESS',
      data: {
        currency,
        amount: amount.toString(),
        total: total || (Number.parseFloat(amount) * 1.001).toFixed(6),
        recipient_display: recipient_display || recipient,
        recipient_type,
        recipient,
      },
    }
  }

  // ── Request Money Details ────────────────────────────────────────────────

  /**
   * Called for both dropdown on-select (partial) and footer submit (full).
   * Validates amount and recipient before navigating to confirm screen.
   */
  private static async handleRequestMoneyDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { currency, amount, recipient_type, recipient, note } = flowData.data
    const errors: Record<string, string> = {}

    const isSavedContactFlow = recipient_type === 'Saved Contact'

    // Partial submit — return as-is
    const isFullSubmit = amount && recipient_type && (recipient || isSavedContactFlow)
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: flowData.data,
      }
    }

    const numAmount = Number.parseFloat(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      errors['amount'] = 'Amount must be greater than 0'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...FlowDataExchangeService.errorFields(errors, [
            'currency', 'amount', 'recipient_type', 'recipient',
          ]),
        },
      }
    }

    // Saved contact: route to SELECT_REQUEST_CONTACT
    if (isSavedContactFlow) {
      const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(flowData.flow_token)
      const user = await User.findOne({ whatsappId })
      const contacts = (user?.beneficiaries ?? []).map((b: any) => ({
        id: b.phoneNumber,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))
      if (contacts.length === 0) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            ...FlowDataExchangeService.errorFields(
              { recipient_type: 'You have no saved contacts. Add contacts via My Contacts first.' },
              ['currency', 'amount', 'recipient_type', 'recipient'],
            ),
          },
        }
      }
      return {
        version: flowData.version,
        screen: 'SELECT_REQUEST_CONTACT',
        data: { currency, amount: numAmount.toString(), note: note ?? '', contacts },
      }
    }

    // Normal flow: validate recipient
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
          ...FlowDataExchangeService.errorFields(
            { recipient: validation.error || 'Invalid recipient' },
            ['currency', 'amount', 'recipient_type', 'recipient'],
          ),
        },
      }
    }

    const recipientDisplay = await FlowDataExchangeService.getRecipientDisplayName(
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

  // ── Request Money Confirm ────────────────────────────────────────────────

  /**
   * No server-side validation needed here.
   * Recipient was already validated in handleRequestMoneyDetails.
   * The complete action fires directly and message-handler creates the request.
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

  // ── Import Wallet Seed ───────────────────────────────────────────────────

  /**
   * Validate seed on IMPORT_WALLET_SEED screen.
   *
   * Checks in order:
   * 1. Seed not empty
   * 2. Seed derives a valid XRPL wallet (Wallet.fromSeed)
   * 3. Address not already registered on SendSasa
   * 4. Account is activated on the XRPL mainnet ledger (has 10 XRP reserve)
   *
   * On success navigates to IMPORT_WALLET_CONFIRM with address + live XRP balance.
   * The raw seed is passed through to the confirm screen data so it can be
   * included in the complete payload. It is marked sensitive in the flow JSON
   * so WhatsApp hides it in the response summary.
   * message-handler encrypts it immediately on receipt — never stored plain.
   */
  private static async handleImportWalletSeed(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { seed } = flowData.data

    const seedError = (msg: string) => ({
      version: flowData.version,
      screen: 'IMPORT_WALLET_SEED' as const,
      data: { ...flowData.data, error_seed: msg },
    })

    if (!seed || seed.trim() === '') return seedError('Seed is required')

    // Validate seed format by attempting to derive the wallet
    let derivedAddress: string
    try {
      const wallet = Wallet.fromSeed(seed.trim())
      derivedAddress = wallet.classicAddress
    } catch {
      return seedError('Invalid seed. Please check and try again.')
    }

    // Check if this address is already registered on SendSasa
    const existingUser = await User.findOne({ xrplAddress: derivedAddress })
    if (existingUser)
      return seedError('This wallet is already registered on SendSasa.')

    // Check if the account is activated on the ledger
    const activated = await isAccountActivated(derivedAddress)
    if (!activated) {
      return seedError(
        `Address ${derivedAddress} has no funds on the XRPL mainnet. Please fund it with at least 1 XRP first.`,
      )
    }

    // Fetch live XRP balance to show on confirm screen
    const balances = await getAllBalances(derivedAddress)

    return {
      version: flowData.version,
      screen: 'IMPORT_WALLET_CONFIRM',
      data: {
        xrpl_address: derivedAddress,
        xrp_balance: balances.xrp,
        seed: seed.trim(),
      },
    }
  }

  // ── Off-Ramp Details ────────────────────────────────────────────────────
  //
  // Validates currency, amount, recipient phone, and MM provider.
  // On success: fetches a live quote and navigates to OFFRAMP_CONFIRM.
  // On partial submit (dropdown): returns the screen as-is with fresh balances.

  private static async handleOffRampDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    // Form field names are now `currency` and `amount` (fixed from legacy crypto_currency/crypto_amount)
    const { currency, amount, recipient_type, recipient_phone, mm_provider } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    // Re-fetch balances for every submission so they stay fresh
    let balances = { xrp: '0', rlusd: '0', usdc: '0' }
    if (user) {
      try {
        balances = await getAllBalances(user.xrpl_address || user.xrplAddress)
      } catch {
        // non-blocking
      }
    }

    const balanceData = {
      available_balance_xrp: balances.xrp,
      available_balance_rlusd: balances.rlusd,
      available_balance_usdc: balances.usdc,
    }

    const isSavedContactFlow = recipient_type === 'Saved Contact'

    // Partial submit (dropdown on-select) — return as-is with fresh balances
    const isFullSubmit = currency && amount && mm_provider && recipient_type &&
      (recipient_phone || isSavedContactFlow)
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, ...balanceData },
      }
    }

    if (!user) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...balanceData,
          ...FlowDataExchangeService.errorFields(
            { amount: 'User not found' },
            ['currency', 'amount', 'mm_provider', 'recipient_type', 'recipient_phone'],
          ),
        },
      }
    }

    const errors: Record<string, string> = {}

    // Validate currency
    if (!OFFRAMP_CURRENCIES.includes(currency)) {
      errors['currency'] = 'Invalid currency selected'
    }

    // Validate provider
    if (!OFFRAMP_PROVIDERS.includes(mm_provider as MobileMoneyProvider)) {
      errors['mm_provider'] = 'Invalid provider selected'
    }

    // Validate amount
    const numAmount = Number.parseFloat(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      errors['amount'] = 'Amount must be greater than 0'
    } else if (!errors['currency']) {
      if (currency !== 'USDT') {
        let balance = 0
        if (currency === 'XRP') balance = Number.parseFloat(balances.xrp)
        else if (currency === 'RLUSD') balance = Number.parseFloat(balances.rlusd)
        else if (currency === 'USDC') balance = Number.parseFloat(balances.usdc)
        if (numAmount > balance) {
          errors['amount'] = `Insufficient ${currency} balance. Available: ${balance.toFixed(6)}`
        }
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...balanceData,
          ...FlowDataExchangeService.errorFields(errors, [
            'currency', 'amount', 'mm_provider', 'recipient_type', 'recipient_phone',
          ]),
        },
      }
    }

    // Saved contact: route to SELECT_OFFRAMP_CONTACT with contacts list
    if (isSavedContactFlow) {
      const contacts = (user.beneficiaries ?? []).map((b: any) => ({
        id: b.phoneNumber,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))
      if (contacts.length === 0) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            ...balanceData,
            ...FlowDataExchangeService.errorFields(
              { recipient_type: 'You have no saved contacts. Add contacts via My Contacts first.' },
              ['currency', 'amount', 'mm_provider', 'recipient_type', 'recipient_phone'],
            ),
          },
        }
      }
      return {
        version: flowData.version,
        screen: 'SELECT_OFFRAMP_CONTACT',
        data: { currency, amount: numAmount.toString(), mm_provider, contacts },
      }
    }

    // Normal flow: validate recipient phone
    if (!recipient_phone || recipient_phone.trim() === '') {
      errors['recipient_phone'] = 'Recipient phone is required'
    } else {
      try {
        normalizeToE164(recipient_phone, undefined, { strict: true })
      } catch {
        errors['recipient_phone'] = 'Invalid phone number format (e.g. +237612345678)'
      }
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...balanceData,
          ...FlowDataExchangeService.errorFields(errors, [
            'currency', 'amount', 'mm_provider', 'recipient_type', 'recipient_phone',
          ]),
        },
      }
    }

    return FlowDataExchangeService.buildOfframpConfirm(
      flowData.version,
      currency,
      numAmount,
      mm_provider,
      normalizeToE164(recipient_phone!),
    )
  }

  private static async buildOfframpConfirm(
    version: string,
    currency: string,
    numAmount: number,
    mm_provider: string,
    normalizedPhone: string,
  ): Promise<FlowDataExchangeResponse> {
    let quote
    try {
      quote = await fxRateService.calculateQuote(numAmount, currency)
    } catch (error: any) {
      throw error
    }

    const providerDisplay = PROVIDER_DISPLAY[mm_provider as MobileMoneyProvider]

    return {
      version,
      screen: 'OFFRAMP_CONFIRM',
      data: {
        crypto_amount: numAmount.toString(),
        crypto_currency: currency,
        xaf_amount: quote.xafAmount.toString(),
        fee_xaf: quote.feeXAF.toString(),
        rate_display: quote.rateDisplay,
        recipient_phone: normalizedPhone,
        mm_provider,
        mm_provider_name: providerDisplay,
        recipient_display: `${providerDisplay} ${normalizedPhone}`,
        crypto_amount_usd: quote.cryptoAmountUSD.toFixed(6),
        fixer_rate: quote.fixerRate.toFixed(4),
        sendsasa_rate: quote.sendSasaRate.toFixed(4),
      },
    }
  }

  // ── Off-Ramp Confirm ─────────────────────────────────────────────────────
  //
  // Validates PIN. On success: navigates to OFFRAMP_SUCCESS.
  // The actual crypto transfer + MM payout run in message-handler after nfm_reply.

  private static async handleOffRampConfirm(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { transaction_pin } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    const pinError = (msg: string) => ({
      version: flowData.version,
      screen: flowData.screen,
      data: { ...flowData.data, error_transaction_pin: msg },
    })

    if (!user) return pinError('User not found')

    // Check lockout
    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.pinLockedUntil.getTime() - Date.now()) / 60000,
      )
      return pinError(
        `Account locked. Try again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}`,
      )
    }

    if (
      transaction_pin === undefined ||
      transaction_pin === null ||
      transaction_pin === ''
    ) {
      return pinError('Transaction PIN is required')
    }

    const pinStr = Number.parseInt(transaction_pin.toString(), 10).toString()
    const isPinValid = await bcrypt.compare(pinStr, user.pinHash)

    if (!isPinValid) {
      user.pinAttempts = (user.pinAttempts || 0) + 1

      if (user.pinAttempts >= 3) {
        user.pinLockedUntil = new Date(Date.now() + 15 * 60 * 1000)
        user.pinAttempts = 0
        await user.save()
        return pinError(
          'Too many incorrect attempts. Account locked for 15 minutes',
        )
      }

      await user.save()
      const attemptsLeft = 3 - user.pinAttempts
      return pinError(
        `Incorrect PIN. ${attemptsLeft} attempt${attemptsLeft > 1 ? 's' : ''} remaining`,
      )
    }

    // PIN correct — reset attempts
    if (user.pinAttempts > 0) {
      user.pinAttempts = 0
      user.pinLockedUntil = undefined
      await user.save()
    }

    // Navigate to success — pass all data through so nfm_reply carries it
    return {
      version: flowData.version,
      screen: 'OFFRAMP_SUCCESS',
      data: { ...flowData.data },
    }
  }

  // ── Card Payment Details ─────────────────────────────────────────────────
  //
  // Validates usd_amount, mm_provider, recipient_phone.
  // On full submit: calculates quote (with 3.99% card fee) → CARD_PAYMENT_CONFIRM.
  // On dropdown on-select: returns screen as-is.

  private static async handleCardPaymentDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { payment_type, usd_amount, mm_provider, recipient_type, recipient_phone, email } = flowData.data
    const isHeadless = payment_type === 'headless'
    const isSavedContactFlow = recipient_type === 'Saved Contact'

    // Partial submit (dropdown on-select)
    const isFullSubmit = usd_amount && mm_provider && recipient_type &&
      (recipient_phone || isSavedContactFlow)
    if (!isFullSubmit) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: flowData.data,
      }
    }

    const errors: Record<string, string> = {}

    const numAmount = Number.parseFloat(usd_amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      errors['usd_amount'] = 'Amount must be greater than 0'
    } else if (numAmount < 5) {
      errors['usd_amount'] = 'Minimum amount is $5'
    }

    if (!['mtn', 'orange', 'uba'].includes(mm_provider)) {
      errors['mm_provider'] = 'Invalid provider selected'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...FlowDataExchangeService.errorFields(errors, [
            'usd_amount', 'mm_provider', 'recipient_type', 'recipient_phone', 'email',
          ]),
        },
      }
    }

    // Saved contact: route to SELECT_CARD_CONTACT
    if (isSavedContactFlow) {
      const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(flowData.flow_token)
      const user = await User.findOne({ whatsappId })
      const contacts = (user?.beneficiaries ?? []).map((b: any) => ({
        id: b.phoneNumber,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))
      if (contacts.length === 0) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: {
            ...flowData.data,
            ...FlowDataExchangeService.errorFields(
              { recipient_type: 'You have no saved contacts. Add contacts via My Contacts first.' },
              ['usd_amount', 'mm_provider', 'recipient_type', 'recipient_phone', 'email'],
            ),
          },
        }
      }
      return {
        version: flowData.version,
        screen: 'SELECT_CARD_CONTACT',
        data: {
          usd_amount: numAmount.toFixed(2),
          mm_provider,
          payment_type: payment_type ?? 'hosted',
          email: email?.trim().toLowerCase() ?? '',
          contacts,
        },
      }
    }

    // Normal flow: validate phone
    let normalizedPhone = ''
    if (!recipient_phone || recipient_phone.trim() === '') {
      errors['recipient_phone'] = 'Recipient phone is required'
    } else {
      try {
        normalizedPhone = normalizeToE164(recipient_phone, undefined, { strict: true })
      } catch {
        errors['recipient_phone'] = 'Invalid phone number format (e.g. +237612345678)'
      }
    }

    // Email only required for headless (Apple/Google Pay)
    if (isHeadless && (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))) {
      errors['email'] = 'Please enter a valid email address'
    }

    if (Object.keys(errors).length > 0) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: {
          ...flowData.data,
          ...FlowDataExchangeService.errorFields(errors, [
            'usd_amount', 'mm_provider', 'recipient_type', 'recipient_phone', 'email',
          ]),
        },
      }
    }

    return FlowDataExchangeService.buildCardPaymentConfirm(
      flowData.version,
      payment_type ?? 'hosted',
      numAmount,
      mm_provider,
      normalizedPhone,
      email?.trim().toLowerCase() ?? '',
    )
  }

  private static async buildCardPaymentConfirm(
    version: string,
    payment_type: string,
    numAmount: number,
    mm_provider: string,
    normalizedPhone: string,
    email: string,
  ): Promise<FlowDataExchangeResponse> {
    let quote
    try {
      const rates = await fxRateService.getRates()
      quote = calculateCardQuote(numAmount, rates.sendSasaRate, rates.fixerRate)
    } catch (err: any) {
      throw err
    }

    const providerName = PROVIDER_DISPLAY[mm_provider as MobileMoneyProvider]

    return {
      version,
      screen: 'CARD_PAYMENT_CONFIRM',
      data: {
        payment_type,
        usd_amount: numAmount.toFixed(2),
        card_fee_usd: quote.cardFeeUSD.toFixed(2),
        total_usd_charged: quote.totalUSDCharged.toFixed(2),
        xaf_amount: quote.xafAmount.toString(),
        fee_xaf: quote.feeXAF.toString(),
        rate_display: quote.rateDisplay,
        mm_provider,
        mm_provider_name: providerName,
        recipient_phone: normalizedPhone,
        email,
        fixer_rate: quote.fixerRate.toFixed(4),
        sendsasa_rate: quote.sendSasaRate.toFixed(4),
      },
    }
  }

  // ── Card Payment Confirm ──────────────────────────────────────────────────
  //
  // No PIN required — the card payment IS the authentication.
  // Creates an OnRampTransaction, generates a Coinbase session token,
  // sends the user a WhatsApp message with the payment URL,
  // then navigates to CARD_PAYMENT_LINK (terminal screen).

  private static async handleCardPaymentConfirm(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const {
      payment_type,
      usd_amount,
      card_fee_usd,
      total_usd_charged,
      xaf_amount,
      fee_xaf,
      rate_display,
      mm_provider,
      mm_provider_name,
      recipient_phone,
      email,
    } = flowData.data

    const isHeadless = payment_type === 'headless'

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(flowData.flow_token)
    const user = await User.findOne({ whatsappId })

    const cardError = (msg: string) => ({
      version: flowData.version,
      screen: flowData.screen,
      data: { ...flowData.data, error_usd_amount: msg },
    })

    if (!user) return cardError('Session expired. Please restart.')

    let adminAddress: string
    try {
      adminAddress = await getAdminEVMAddress()
    } catch {
      return cardError('Service temporarily unavailable. Please try again.')
    }

    let fixerRate = 0
    let sendSasaRate = 0
    try {
      const rates = await fxRateService.getRates()
      fixerRate = rates.fixerRate
      sendSasaRate = rates.sendSasaRate
    } catch { /* use 0 — non-critical for record keeping */ }

    const numUSD = Number.parseFloat(usd_amount)

    // Create DB record first — crash-safe regardless of which path follows
    const onRamp = new OnRampTransaction({
      senderPhone: user.whatsappId,
      recipientPhone: recipient_phone,
      mmProvider: mm_provider as MobileMoneyProvider,
      usdAmount: numUSD,
      cardFeePct: CARD_FEE_PCT,
      cardFeeUSD: Number.parseFloat(card_fee_usd),
      totalUSDCharged: Number.parseFloat(total_usd_charged),
      xafAmount: Number.parseInt(xaf_amount, 10),
      feeXAF: Number.parseInt(fee_xaf, 10),
      fixerRate,
      sendSasaRate,
      adminAddress,
      userEmail: isHeadless ? (email?.trim().toLowerCase() ?? '') : undefined,
      status: 'pending',
    })
    await onRamp.save()

    const refId = (onRamp._id as { toString(): string }).toString()
    const baseUrl = config.JWT_ISSUER || 'https://api.sendsasa.com'

    let paymentURL: string

    if (isHeadless) {
      // Headless: send URL to our self-hosted page which embeds the Coinbase iframe
      paymentURL = buildHeadlessPaymentURL(refId, baseUrl)

      sendCtaUrlButton(
        user.whatsappId,
        `📱 *Apple / Google Pay*\n\n` +
          `*You pay:* $${total_usd_charged} (incl. 3.99% card fee)\n` +
          `*Delivers:* ${xaf_amount} XAF → ${recipient_phone}\n` +
          `*Via:* ${mm_provider_name}\n` +
          `*Rate:* ${rate_display}\n` +
          `*Ref:* ${refId}\n\n` +
          `Tap the button below to complete your payment.`,
        'Open Payment Page',
        paymentURL,
      ).catch((err) => console.error('Failed to send headless payment link:', err))
    } else {
      // Hosted: create Coinbase session token → direct pay.coinbase.com URL
      let sessionToken: string
      try {
        sessionToken = await createSessionToken(numUSD, adminAddress, refId)
      } catch (err: any) {
        await onRamp.deleteOne().catch(() => {})
        return cardError(err.message || 'Could not create payment session. Please try again.')
      }

      paymentURL = buildPaymentURL(sessionToken)

      sendCtaUrlButton(
        user.whatsappId,
        `💳 *Card Payment*\n\n` +
          `*You pay:* $${total_usd_charged} (incl. 3.99% card fee)\n` +
          `*Delivers:* ${xaf_amount} XAF → ${recipient_phone}\n` +
          `*Via:* ${mm_provider_name}\n` +
          `*Rate:* ${rate_display}\n` +
          `*Ref:* ${refId}\n\n` +
          `Tap the button below to pay with your debit card.`,
        'Pay with Card',
        paymentURL,
      ).catch((err) => console.error('Failed to send hosted payment link:', err))
    }

    return {
      version: flowData.version,
      screen: 'CARD_PAYMENT_LINK',
      data: {
        usd_amount,
        total_usd_charged,
        xaf_amount,
        mm_provider_name,
        recipient_phone,
      },
    }
  }

  // ── Beneficiary List ────────────────────────────────────────────────────
  // Routes to ADD_BENEFICIARY or DELETE_BENEFICIARY based on the selected action.

  private static async handleBeneficiaryList(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { selected_action } = flowData.data

    if (!selected_action) {
      return {
        version: flowData.version,
        screen: flowData.screen,
        data: { ...flowData.data, error_action: 'Please select an action' },
      }
    }

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })

    if (selected_action === 'delete') {
      const beneficiaries = user?.beneficiaries ?? []
      if (beneficiaries.length === 0) {
        return {
          version: flowData.version,
          screen: flowData.screen,
          data: { ...flowData.data, error_action: 'You have no saved contacts to delete' },
        }
      }
      const contacts = beneficiaries.map((b: any) => ({
        id: b.id,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))
      return {
        version: flowData.version,
        screen: 'DELETE_BENEFICIARY',
        data: { contacts },
      }
    }

    // selected_action === 'add'
    return {
      version: flowData.version,
      screen: 'ADD_BENEFICIARY',
      data: {},
    }
  }

  // ── Add Beneficiary ──────────────────────────────────────────────────────

  private static async handleAddBeneficiary(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { nickname, phone } = flowData.data

    const addError = (errors: Record<string, string>) => ({
      version: flowData.version,
      screen: 'ADD_BENEFICIARY' as const,
      data: {
        ...flowData.data,
        ...FlowDataExchangeService.errorFields(errors, ['nickname', 'phone']),
      },
    })

    const errors: Record<string, string> = {}

    if (!nickname || nickname.trim() === '') {
      errors['nickname'] = 'Nickname is required'
    } else if (nickname.trim().length > 30) {
      errors['nickname'] = 'Nickname must be 30 characters or less'
    }

    let normalizedPhone = ''
    if (!phone || phone.trim() === '') {
      errors['phone'] = 'Phone number is required'
    } else {
      try {
        normalizedPhone = normalizeToE164(phone, undefined, { strict: true })
      } catch {
        errors['phone'] = 'Invalid phone number format (e.g. +237612345678)'
      }
    }

    if (Object.keys(errors).length > 0) return addError(errors)

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })
    if (!user) return addError({ nickname: 'Session expired. Please try again.' })

    const already = (user.beneficiaries ?? []).some(
      (b: any) => b.phoneNumber === normalizedPhone,
    )
    if (already) return addError({ phone: 'This number is already in your contacts' })

    // Save to DB immediately so nfm_reply just needs to send confirmation
    const crypto = await import('node:crypto')
    user.beneficiaries.push({
      id: crypto.default.randomBytes(8).toString('hex'),
      nickname: nickname.trim(),
      phoneNumber: normalizedPhone,
      addedAt: new Date(),
    } as any)
    await user.save()

    return {
      version: flowData.version,
      screen: 'BENEFICIARY_SAVED',
      data: { nickname: nickname.trim(), phone: normalizedPhone },
    }
  }

  // ── Delete Beneficiary ───────────────────────────────────────────────────

  private static async handleDeleteBeneficiary(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { contact_id } = flowData.data

    const deleteError = (msg: string) => ({
      version: flowData.version,
      screen: 'DELETE_BENEFICIARY' as const,
      data: { ...flowData.data, error_contact_id: msg },
    })

    if (!contact_id) return deleteError('Please select a contact to delete')

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(
      flowData.flow_token,
    )
    const user = await User.findOne({ whatsappId })
    if (!user) return deleteError('Session expired. Please try again.')

    const before = user.beneficiaries.length
    user.beneficiaries = (user.beneficiaries as any[]).filter(
      (b: any) => b.id !== contact_id,
    ) as any
    if (user.beneficiaries.length === before) {
      return deleteError('Contact not found. Please try again.')
    }

    await user.save()

    return {
      version: flowData.version,
      screen: 'BENEFICIARY_DELETED',
      data: {},
    }
  }

  // ── Select Beneficiary (in Send Money flow) ──────────────────────────────
  // The user picked a contact from the dropdown on SELECT_BENEFICIARY.
  // Resolve the phone → SendSasa user → route to SEND_MONEY_CONFIRM.

  private static async handleSelectBeneficiary(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { currency, amount, contact } = flowData.data

    const selectError = (msg: string) => ({
      version: flowData.version,
      screen: 'SELECT_BENEFICIARY' as const,
      data: { ...flowData.data, error_contact: msg },
    })

    if (!contact) return selectError('Please select a contact')

    // Validate contact is a SendSasa user
    const cleanPhone = contact.replaceAll('+', '').replaceAll(/\s/g, '')
    const recipientUser = await User.findOne({ whatsappId: cleanPhone })
    if (!recipientUser) return selectError('This contact is not on SendSasa')

    const numAmt = Number.parseFloat(amount)
    const fee = numAmt * 0.001
    const total = numAmt + fee
    const recipientDisplay = `${recipientUser.username} (${contact})`

    return {
      version: flowData.version,
      screen: 'SEND_MONEY_CONFIRM',
      data: {
        currency: currency.toString(),
        amount: numAmt.toString(),
        recipient_type: 'Phone Number',
        recipient: contact,
        recipient_display: recipientDisplay,
        fee: fee.toFixed(6),
        total: total.toFixed(6),
      },
    }
  }

  // ── Select Offramp Contact ───────────────────────────────────────────────
  // User picked a saved contact on SELECT_OFFRAMP_CONTACT.
  // No SendSasa check — MoMo numbers don't need to be registered users.

  private static async handleSelectOfframpContact(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { currency, amount, mm_provider, contact } = flowData.data

    const selectError = (msg: string) => ({
      version: flowData.version,
      screen: 'SELECT_OFFRAMP_CONTACT' as const,
      data: { ...flowData.data, error_contact: msg },
    })

    if (!contact) return selectError('Please select a contact')

    const numAmount = Number.parseFloat(amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      return selectError('Invalid amount. Please go back and re-enter.')
    }

    try {
      return await FlowDataExchangeService.buildOfframpConfirm(
        flowData.version, currency, numAmount, mm_provider, contact,
      )
    } catch (error: any) {
      return selectError(error.message || 'Failed to fetch exchange rate. Please try again.')
    }
  }

  // ── Select Card Contact ──────────────────────────────────────────────────
  // User picked a saved contact on SELECT_CARD_CONTACT.

  private static async handleSelectCardContact(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { usd_amount, mm_provider, payment_type, email, contact } = flowData.data

    const selectError = (msg: string) => ({
      version: flowData.version,
      screen: 'SELECT_CARD_CONTACT' as const,
      data: { ...flowData.data, error_contact: msg },
    })

    if (!contact) return selectError('Please select a contact')

    const numAmount = Number.parseFloat(usd_amount)
    if (Number.isNaN(numAmount) || numAmount <= 0) {
      return selectError('Invalid amount. Please go back and re-enter.')
    }

    try {
      return await FlowDataExchangeService.buildCardPaymentConfirm(
        flowData.version,
        payment_type ?? 'hosted',
        numAmount,
        mm_provider,
        contact,
        email ?? '',
      )
    } catch (err: any) {
      return selectError(err.message || 'Failed to fetch exchange rate. Please try again.')
    }
  }

  // ── Select Request Contact ───────────────────────────────────────────────
  // User picked a saved contact on SELECT_REQUEST_CONTACT.
  // Contact must be a SendSasa user (payment requests require app registration).

  private static async handleSelectRequestContact(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { currency, amount, note, contact } = flowData.data

    const selectError = (msg: string) => ({
      version: flowData.version,
      screen: 'SELECT_REQUEST_CONTACT' as const,
      data: { ...flowData.data, error_contact: msg },
    })

    if (!contact) return selectError('Please select a contact')

    const cleanPhone = contact.replaceAll('+', '').replaceAll(/\s/g, '')
    const recipientUser = await User.findOne({ whatsappId: cleanPhone })
    if (!recipientUser) return selectError('This contact is not on SendSasa')

    const numAmount = Number.parseFloat(amount)
    const recipientDisplay = `${recipientUser.username} (${contact})`

    return {
      version: flowData.version,
      screen: 'REQUEST_MONEY_CONFIRM',
      data: {
        currency,
        amount: numAmount.toString(),
        recipient_type: 'Phone Number',
        recipient: contact,
        recipient_display: recipientDisplay,
        note: note ?? '',
      },
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Validate recipient — checks format and existence on SendSasa
   */
  private static async validateRecipient(
    recipient: string,
    type: string,
    currency?: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      if (type === 'Phone Number') {
        if (!isPhoneNumber(recipient)) {
          return { valid: false, error: 'Invalid phone number format' }
        }
        const cleanPhone = recipient.replaceAll('+', '').replaceAll(/\s/g, '')
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
        const chain = currency ? (CURRENCY_CHAIN[currency] ?? 'xrpl') : 'xrpl'
        if (chain === 'xrpl') {
          if (!/^r[1-9A-HJ-NP-Za-km-z]{25,34}$/.test(recipient)) {
            return { valid: false, error: 'Invalid XRPL wallet address (r...)' }
          }
        } else if (chain === 'bsc') {
          if (!/^0x[a-fA-F0-9]{40}$/.test(recipient)) {
            return { valid: false, error: 'Invalid EVM wallet address (0x...)' }
          }
        } else if (chain === 'solana') {
          if (!isValidSolanaAddress(recipient)) {
            return { valid: false, error: 'Invalid Solana wallet address' }
          }
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
        const cleanPhone = recipient.replaceAll('+', '').replaceAll(/\s/g, '')
        const user = await User.findOne({ whatsappId: cleanPhone })
        if (user?.username) {
          return `${user.username} (${recipient})`
        }
        return recipient
      } else if (type === 'SendSasa Username') {
        return recipient
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

  // ── Request Card Details ──────────────────────────────────────────────────
  // User fills amount, MoMo provider and their own phone.
  // Always uses hosted Coinbase checkout (no email/payment_type needed).

  private static async handleRequestCardDetails(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { usd_amount, mm_provider, recipient_phone, payer_type, payer_phone } = flowData.data
    const isSavedContact = payer_type === 'Saved Contact'

    const detailError = (fields: Record<string, string>) => ({
      version: flowData.version,
      screen: flowData.screen,
      data: {
        ...flowData.data,
        ...FlowDataExchangeService.errorFields(fields, [
          'usd_amount', 'mm_provider', 'recipient_phone', 'payer_type', 'payer_phone',
        ]),
      },
    })

    const errors: Record<string, string> = {}

    const numAmount = Number.parseFloat(usd_amount)
    if (!usd_amount || Number.isNaN(numAmount) || numAmount <= 0) {
      errors['usd_amount'] = 'Please enter a valid amount'
    } else if (numAmount < 5) {
      errors['usd_amount'] = 'Minimum amount is $5'
    } else if (numAmount > 2000) {
      errors['usd_amount'] = 'Maximum amount is $2,000'
    }

    if (!mm_provider || !OFFRAMP_PROVIDERS.includes(mm_provider as MobileMoneyProvider)) {
      errors['mm_provider'] = 'Please select a mobile money provider'
    }

    let normalizedRecipient = ''
    if (!recipient_phone || recipient_phone.trim() === '') {
      errors['recipient_phone'] = 'Your mobile money number is required'
    } else {
      try {
        normalizedRecipient = normalizeToE164(recipient_phone, undefined, { strict: true })
      } catch {
        errors['recipient_phone'] = 'Invalid phone number format (e.g. +237612345678)'
      }
    }

    if (!payer_type) {
      errors['payer_type'] = 'Please select how to send the request'
    }

    if (!isSavedContact) {
      if (!payer_phone || payer_phone.trim() === '') {
        errors['payer_phone'] = "Payer's WhatsApp number is required"
      } else {
        try {
          normalizeToE164(payer_phone, undefined, { strict: true })
        } catch {
          errors['payer_phone'] = 'Invalid phone number format (e.g. +237612345678)'
        }
      }
    }

    if (Object.keys(errors).length > 0) return detailError(errors)

    // Saved contact: show contact picker
    if (isSavedContact) {
      const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(flowData.flow_token)
      const user = await User.findOne({ whatsappId })
      const beneficiaries = (user as any)?.beneficiaries ?? []

      if (beneficiaries.length === 0) {
        return detailError({ payer_type: 'No saved contacts. Add contacts via My Contacts first.' })
      }

      const contacts = beneficiaries.map((b: any) => ({
        id: b.phoneNumber,
        title: `${b.nickname} (${b.phoneNumber})`,
      }))

      return {
        version: flowData.version,
        screen: 'SELECT_REQUEST_CARD_CONTACT',
        data: {
          usd_amount: numAmount.toString(),
          mm_provider,
          recipient_phone: normalizedRecipient,
          contacts,
        },
      }
    }

    // Normal flow: build confirm screen
    const normalizedPayer = normalizeToE164(payer_phone!, undefined, { strict: true })
    return FlowDataExchangeService.buildRequestCardConfirm(
      flowData.version,
      numAmount,
      mm_provider,
      normalizedRecipient,
      normalizedPayer,
    )
  }

  // ── Select Request Card Contact ───────────────────────────────────────────
  // User picked a saved contact as the payer. No SendSasa check needed —
  // card payments work for any WhatsApp number.

  private static async handleSelectRequestCardContact(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const { usd_amount, mm_provider, recipient_phone, contact } = flowData.data

    const selectError = (msg: string) => ({
      version: flowData.version,
      screen: 'SELECT_REQUEST_CARD_CONTACT' as const,
      data: { ...flowData.data, error_contact: msg },
    })

    if (!contact) return selectError('Please select a contact')

    const numAmount = Number.parseFloat(usd_amount)
    return FlowDataExchangeService.buildRequestCardConfirm(
      flowData.version,
      numAmount,
      mm_provider,
      recipient_phone,
      contact,
    )
  }

  private static async buildRequestCardConfirm(
    version: string,
    numAmount: number,
    mm_provider: string,
    recipientPhone: string,
    payerPhone: string,
  ): Promise<FlowDataExchangeResponse> {
    let quote
    try {
      const rates = await fxRateService.getRates()
      quote = calculateCardQuote(numAmount, rates.sendSasaRate, rates.fixerRate)
    } catch (err: any) {
      throw err
    }

    const providerName = PROVIDER_DISPLAY[mm_provider as MobileMoneyProvider]

    return {
      version,
      screen: 'REQUEST_CARD_CONFIRM',
      data: {
        usd_amount: numAmount.toFixed(2),
        card_fee_usd: quote.cardFeeUSD.toFixed(2),
        total_usd_charged: quote.totalUSDCharged.toFixed(2),
        xaf_amount: quote.xafAmount.toString(),
        fee_xaf: quote.feeXAF.toString(),
        rate_display: quote.rateDisplay,
        mm_provider,
        mm_provider_name: providerName,
        recipient_phone: recipientPhone,
        payer_phone: payerPhone,
        fixer_rate: quote.fixerRate.toFixed(4),
        sendsasa_rate: quote.sendSasaRate.toFixed(4),
      },
    }
  }

  // ── Request Card Confirm ──────────────────────────────────────────────────
  // Creates the OnRamp record, generates the hosted Coinbase link,
  // sends the CTA button directly to the payer's WhatsApp,
  // sends a confirmation text to the requester,
  // then navigates to REQUEST_CARD_LINK (terminal screen).

  private static async handleRequestCardConfirm(
    flowData: FlowDataExchangeRequest,
  ): Promise<FlowDataExchangeResponse> {
    const {
      usd_amount,
      card_fee_usd,
      total_usd_charged,
      xaf_amount,
      fee_xaf,
      rate_display,
      mm_provider,
      mm_provider_name,
      recipient_phone,
      payer_phone,
    } = flowData.data

    const whatsappId = FlowDataExchangeService.extractWhatsappIdFromToken(flowData.flow_token)
    const user = await User.findOne({ whatsappId })

    const reqError = (msg: string) => ({
      version: flowData.version,
      screen: flowData.screen,
      data: { ...flowData.data, error_usd_amount: msg },
    })

    if (!user) return reqError('Session expired. Please restart.')

    let adminAddress: string
    try {
      adminAddress = await getAdminEVMAddress()
    } catch {
      return reqError('Service temporarily unavailable. Please try again.')
    }

    let fixerRate = 0
    let sendSasaRate = 0
    try {
      const rates = await fxRateService.getRates()
      fixerRate = rates.fixerRate
      sendSasaRate = rates.sendSasaRate
    } catch { /* non-critical for record keeping */ }

    const numUSD = Number.parseFloat(usd_amount)

    const onRamp = new OnRampTransaction({
      senderPhone: user.whatsappId,
      recipientPhone: recipient_phone,
      mmProvider: mm_provider as MobileMoneyProvider,
      usdAmount: numUSD,
      cardFeePct: CARD_FEE_PCT,
      cardFeeUSD: Number.parseFloat(card_fee_usd),
      totalUSDCharged: Number.parseFloat(total_usd_charged),
      xafAmount: Number.parseInt(xaf_amount, 10),
      feeXAF: Number.parseInt(fee_xaf, 10),
      fixerRate,
      sendSasaRate,
      adminAddress,
      status: 'pending',
    })
    await onRamp.save()

    const refId = (onRamp._id as { toString(): string }).toString()

    let sessionToken: string
    try {
      sessionToken = await createSessionToken(numUSD, adminAddress, refId)
    } catch (err: any) {
      await onRamp.deleteOne().catch(() => {})
      return reqError(err.message || 'Could not create payment session. Please try again.')
    }

    const paymentURL = buildPaymentURL(sessionToken)

    // Normalise payer phone to WhatsApp ID format (no leading +)
    const payerWhatsAppId = payer_phone.replace(/^\+/, '')

    // Send the payment link directly to the payer
    sendCtaUrlButton(
      payerWhatsAppId,
      `💳 *Payment Request from ${user.username}*\n\n` +
        `*Amount:* $${total_usd_charged} (incl. 3.99% card fee)\n` +
        `*Rate:* ${rate_display}\n` +
        `*Ref:* ${refId}\n\n` +
        `Tap the button below to pay with your debit card, Apple Pay or Google Pay.`,
      'Pay Now',
      paymentURL,
    ).catch((err) => console.error('Failed to send card request link to payer:', err))

    return {
      version: flowData.version,
      screen: 'REQUEST_CARD_LINK',
      data: {
        xaf_amount,
        mm_provider_name,
        recipient_phone,
        payer_phone,
        is_card_request: 'true',
      },
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
