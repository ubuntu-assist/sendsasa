import { Injectable } from '@nestjs/common'
import { User } from '@models/User'
import { ValidationError } from '@common/middleware/error-handler'

@Injectable()
export class UsernameService {
  private readonly SUFFIX = '.sasa'
  private readonly MIN_LENGTH = 3
  private readonly MAX_LENGTH = 20
  private readonly CHANGE_COOLDOWN_DAYS = 30

  private readonly RESERVED_USERNAMES = [
    'admin',
    'support',
    'sendsa',
    'sendsasa',
    'system',
    'official',
    'help',
    'info',
    'security',
    'team',
    'payment',
    'wallet',
    'xrp',
    'crypto',
    'money',
    'service',
    'customer',
    'tech',
    'dev',
    'api',
  ]

  async generateUsername(whatsappName: string): Promise<string> {
    let base = whatsappName
      .toLowerCase()
      .replaceAll(/[^a-z0-9]/g, '_')
      .replaceAll(/_+/g, '_')
      .replaceAll(/^_|_$/g, '')
      .substring(0, this.MAX_LENGTH)

    if (!base || base.length < this.MIN_LENGTH) {
      base = 'user' + Math.floor(Math.random() * 1000)
    }

    let username = `${base}${this.SUFFIX}`

    let counter = 1
    while (await this.usernameExists(username)) {
      username = `${base}${counter}${this.SUFFIX}`
      counter++

      if (counter > 999) {
        const random = Math.floor(Math.random() * 10000)
        username = `user${random}${this.SUFFIX}`
        break
      }
    }

    return `@${username}`
  }

  async usernameExists(username: string): Promise<boolean> {
    const normalized = username.toLowerCase().replace('@', '')
    const count = await User.countDocuments({
      username: new RegExp(`^@?${this.escapeRegex(normalized)}$`, 'i'),
    })
    return count > 0
  }

  private escapeRegex(str: string): string {
    return str.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)
  }

  validateUsername(username: string): void {
    const cleaned = username.replace('@', '')

    if (!cleaned.endsWith(this.SUFFIX)) {
      throw new ValidationError(`Username must end with ${this.SUFFIX}`)
    }

    const base = cleaned.replace(this.SUFFIX, '')

    if (base.length < this.MIN_LENGTH) {
      throw new ValidationError(
        `Username must be at least ${this.MIN_LENGTH} characters (before ${this.SUFFIX})`,
      )
    }

    if (base.length > this.MAX_LENGTH) {
      throw new ValidationError(
        `Username must be at most ${this.MAX_LENGTH} characters (before ${this.SUFFIX})`,
      )
    }

    if (!/^[a-z0-9_.]+$/.test(base)) {
      throw new ValidationError(
        'Username can only contain lowercase letters, numbers, underscores, and dots',
      )
    }

    if (/^[._]|[._]$/.test(base)) {
      throw new ValidationError(
        'Username cannot start or end with a dot or underscore',
      )
    }

    if (/[_.]{2,}/.test(base)) {
      throw new ValidationError(
        'Username cannot have consecutive dots or underscores',
      )
    }

    if (this.RESERVED_USERNAMES.includes(base)) {
      throw new ValidationError('This username is reserved')
    }
  }

  async changeUsername(whatsappId: string, newUsername: string): Promise<void> {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      throw new ValidationError('User not found')
    }

    if (user.usernameLastChanged) {
      const daysSinceChange =
        (Date.now() - user.usernameLastChanged.getTime()) /
        (1000 * 60 * 60 * 24)

      if (daysSinceChange < this.CHANGE_COOLDOWN_DAYS) {
        const daysRemaining = Math.ceil(
          this.CHANGE_COOLDOWN_DAYS - daysSinceChange,
        )
        throw new ValidationError(
          `You can change your username again in ${daysRemaining} day${daysRemaining > 1 ? 's' : ''}`,
        )
      }
    }

    this.validateUsername(newUsername)

    const normalized = newUsername.toLowerCase().replace('@', '')

    const currentUsername = user.username.toLowerCase().replace('@', '')
    if (normalized === currentUsername) {
      throw new ValidationError('This is already your username')
    }

    if (await this.usernameExists(normalized)) {
      throw new ValidationError('This username is already taken')
    }

    // Update
    await User.updateOne(
      { whatsappId },
      {
        username: `@${normalized}`,
        usernameLastChanged: new Date(),
      },
    )
  }

  async searchUsername(query: string): Promise<any[]> {
    const cleaned = query.toLowerCase().replace('@', '')

    const users = await User.find({
      username: new RegExp(this.escapeRegex(cleaned), 'i'),
    })
      .limit(10)
      .select('username phoneNumber lastActive')
      .sort({ lastActive: -1 })

    return users
  }

  async getUserByUsername(username: string): Promise<any> {
    const normalized = username.toLowerCase().replace('@', '')

    const user = await User.findOne({
      username: new RegExp(`^@?${this.escapeRegex(normalized)}$`, 'i'),
    })

    return user
  }

  isUsername(recipient: string): boolean {
    return recipient.startsWith('@') || recipient.endsWith(this.SUFFIX)
  }
}

export const usernameService = new UsernameService()
