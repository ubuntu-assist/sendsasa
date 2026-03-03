import bcrypt from 'bcrypt'
import { User } from '../models/User'
import { ValidationError } from '../middleware/error-handler'

class PINVerificationService {
  private readonly MAX_ATTEMPTS = 3
  private readonly LOCK_DURATION_MS = 30 * 60 * 1000
  private readonly SALT_ROUNDS = 12

  async hashPIN(pin: string): Promise<string> {
    this.validatePINFormat(pin)
    return await bcrypt.hash(pin, this.SALT_ROUNDS)
  }

  validatePINFormat(pin: string): void {
    if (!/^\d{5}$/.test(pin)) {
      throw new ValidationError('PIN must be exactly 5 digits')
    }

    const obviousPatterns = [
      '00000',
      '11111',
      '22222',
      '33333',
      '44444',
      '55555',
      '66666',
      '77777',
      '88888',
      '99999',
      '12345',
      '54321',
      '11223',
      '98765',
      '01234',
    ]

    if (obviousPatterns.includes(pin)) {
      throw new ValidationError('Please choose a less obvious PIN')
    }
  }

  async verifyPIN(whatsappId: string, pin: string): Promise<boolean> {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      throw new ValidationError('User not found')
    }

    if (user.pinLockedUntil && user.pinLockedUntil > new Date()) {
      const minutesLeft = Math.ceil(
        (user.pinLockedUntil.getTime() - Date.now()) / (60 * 1000),
      )
      throw new ValidationError(
        `🚫 Account Temporarily Locked\n\nYour account has been locked for security.\n\nTry again in ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''}.`,
      )
    }

    const isValid = await bcrypt.compare(pin, user.pinHash)

    if (isValid) {
      await User.updateOne(
        { whatsappId },
        {
          pinAttempts: 0,
          pinLockedUntil: null,
        },
      )
      return true
    } else {
      const newAttempts = (user.pinAttempts || 0) + 1

      if (newAttempts >= this.MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + this.LOCK_DURATION_MS)

        await User.updateOne(
          { whatsappId },
          {
            pinAttempts: newAttempts,
            pinLockedUntil: lockUntil,
          },
        )

        throw new ValidationError(
          `🚫 Account Locked\n\nToo many failed PIN attempts.\n\nYour account has been locked for 30 minutes.\n\nType "forgot pin" to reset your PIN.`,
        )
      } else {
        await User.updateOne({ whatsappId }, { pinAttempts: newAttempts })

        const remainingAttempts = this.MAX_ATTEMPTS - newAttempts
        throw new ValidationError(
          `❌ Incorrect PIN\n\nAttempt ${newAttempts} of ${this.MAX_ATTEMPTS}\n\n${remainingAttempts} attempt${remainingAttempts > 1 ? 's' : ''} remaining.`,
        )
      }
    }
  }

  async changePIN(
    whatsappId: string,
    oldPIN: string,
    newPIN: string,
  ): Promise<void> {
    await this.verifyPIN(whatsappId, oldPIN)

    this.validatePINFormat(newPIN)

    const user = await User.findOne({ whatsappId })
    if (user) {
      const isSame = await bcrypt.compare(newPIN, user.pinHash)
      if (isSame) {
        throw new ValidationError('New PIN must be different from current PIN')
      }
    }

    const newPinHash = await this.hashPIN(newPIN)

    await User.updateOne(
      { whatsappId },
      {
        pinHash: newPinHash,
        pinLastChanged: new Date(),
        pinAttempts: 0,
      },
    )
  }

  async generateRecoveryCode(whatsappId: string): Promise<string> {
    const code = Math.floor(100000 + Math.random() * 900000).toString()

    const codeHash = await bcrypt.hash(code, this.SALT_ROUNDS)
    const expiry = new Date(Date.now() + 10 * 60 * 1000) // 10 minutes

    await User.updateOne(
      { whatsappId },
      {
        recoveryCodeHash: codeHash,
        recoveryCodeExpiry: expiry,
      },
    )

    return code
  }

  async verifyRecoveryCode(whatsappId: string, code: string): Promise<boolean> {
    const user = await User.findOne({ whatsappId })

    if (!user || !user.recoveryCodeHash || !user.recoveryCodeExpiry) {
      throw new ValidationError(
        'No recovery code found. Type "forgot pin" to get a new code.',
      )
    }

    if (user.recoveryCodeExpiry < new Date()) {
      throw new ValidationError(
        'Recovery code expired. Type "forgot pin" to get a new code.',
      )
    }

    const isValid = await bcrypt.compare(code, user.recoveryCodeHash)

    if (!isValid) {
      throw new ValidationError(
        'Invalid recovery code. Please check and try again.',
      )
    }

    return true
  }

  async resetPINWithCode(
    whatsappId: string,
    code: string,
    newPIN: string,
  ): Promise<void> {
    await this.verifyRecoveryCode(whatsappId, code)

    this.validatePINFormat(newPIN)

    const newPinHash = await this.hashPIN(newPIN)

    await User.updateOne(
      { whatsappId },
      {
        pinHash: newPinHash,
        pinLastChanged: new Date(),
        pinAttempts: 0,
        pinLockedUntil: null,
        recoveryCodeHash: null,
        recoveryCodeExpiry: null,
      },
    )
  }
}

export const pinVerificationService = new PINVerificationService()
