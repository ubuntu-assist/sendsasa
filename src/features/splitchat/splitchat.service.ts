import { Injectable } from '@nestjs/common'
import type { Group } from '@features/njangi/group.schema'
import { generateShortCode } from '@common/helpers/short-code'
import { calculateFee } from '@common/helpers/fee'
import { PawapayService } from '@payments/pawapay/pawapay.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { appEmitter, EVENTS } from '@shared/app-emitter'
import { GroupRepository } from '@domain/repositories/group.repository'
import { GroupMemberRepository } from '@domain/repositories/group-member.repository'
import { UserRepository } from '@domain/repositories/user.repository'
import type { CreatePotDto } from '@app/types'
import logger from '@common/utils/logger'

@Injectable()
export class SplitChatService {
  constructor(
    private readonly pawapay: PawapayService,
    private readonly groups: GroupRepository,
    private readonly members: GroupMemberRepository,
    private readonly users: UserRepository,
  ) {}

  async createPot(
    organizerPhone: string,
    data: CreatePotDto,
  ): Promise<typeof Group.prototype | null> {
    const organizer = await this.users.findByPhone(organizerPhone)
    if (
      organizer?.operatingRegion &&
      organizer.operatingRegion !== 'cameroon'
    ) {
      await sendTextMessage(
        organizerPhone,
        '🇨🇲 SplitChat is only available for Cameroon mobile money users.',
      )
      return null
    }

    const shortCode = generateShortCode()
    const fee = calculateFee(data.amountPerPerson)

    const group = await this.groups.create({
      shortCode,
      type: 'SPLITCHAT',
      mode: data.mode ?? 'ORGANIZER',
      adminPhone: organizerPhone,
      name: data.name,
      contributionAmount: data.amountPerPerson,
      fee,
      targetParticipants: data.targetParticipants,
      deadline: data.deadline,
      status: 'SETUP',
    })

    const groupId = String((group as any)._id)

    if (data.mode === 'SPLIT') {
      await this.members.create({ groupId, phone: organizerPhone })
    }

    await this.users.setContextByPhone(organizerPhone, { type: 'SPLITCHAT', groupId: String(groupId) })

    const splitHint =
      data.mode === 'SPLIT'
        ? `\n\nType *pay* to add your own contribution.`
        : ''
    await sendTextMessage(
      organizerPhone,
      `✅ *Group pot created!*\n\n` +
        `🎉 ${data.name}\n` +
        `💰 Contribution: ${data.amountPerPerson.toLocaleString()} XAF / person\n` +
        `👥 Target participants: ${data.targetParticipants}\n` +
        `🔑 Code: *${shortCode}*\n\n` +
        `Share this code with your friends: *JOIN ${shortCode}*` +
        splitHint,
    )

    logger.info(`[SplitChat] Pot created: ${shortCode} by ${organizerPhone}`)
    return group
  }

  async joinPot(phone: string, shortCode: string): Promise<void> {
    const joiner = await this.users.findByPhone(phone)
    if (joiner?.operatingRegion && joiner.operatingRegion !== 'cameroon') {
      await sendTextMessage(
        phone,
        '🇨🇲 SplitChat is only available for Cameroon mobile money users.',
      )
      return
    }

    const group = await this.groups.findByShortCode(shortCode, 'SPLITCHAT')
    if (!group) {
      await sendTextMessage(phone, `❌ Code *${shortCode}* not found.`)
      return
    }
    if (
      (group as any).status === 'COMPLETED' ||
      (group as any).status === 'REFUNDED'
    ) {
      await sendTextMessage(phone, `⚠️ This pot is already closed.`)
      return
    }

    const existing = await this.members.findByGroupAndPhone(
      String((group as any)._id),
      phone,
    )
    if (existing) {
      if ((existing as any).hasPaidCurrentCycle) {
        await sendTextMessage(
          phone,
          `ℹ️ You have already paid into *${(group as any).name}*.`,
        )
        return
      }
      // Existing unpaid member (e.g. admin) — fall through to initiate payment
    } else {
      const count = await this.members.countByGroup(String((group as any)._id))
      if (
        (group as any).targetParticipants &&
        count >= (group as any).targetParticipants
      ) {
        await sendTextMessage(
          phone,
          `⚠️ The pot *${(group as any).name}* is full.`,
        )
        return
      }
      await this.members.create({ groupId: (group as any)._id, phone })
    }

    await this.users.setContextByPhone(phone, { type: 'SPLITCHAT', groupId: String((group as any)._id) })

    const depositId = this.pawapay.generateId()
    await this.members.updateByGroupAndPhone(
      String((group as any)._id),
      phone,
      { pawapayDepositId: depositId },
    )

    const amount = (group as any).contributionAmount
    const joinMsg = `✅ Joined *${(group as any).name}*!\n\n⏳ Payment of ${amount.toLocaleString()} XAF in progress...\nAccept the USSD prompt.`
    await sendTextMessage(phone, joinMsg)

    const result = await this.pawapay.initiateDeposit(
      depositId,
      phone,
      amount,
      `Pot ${(group as any).shortCode}`.slice(0, 22),
      String((group as any)._id),
    )

    if (result.status === 'REJECTED') {
      await this.members.deleteByGroupAndPhone(
        String((group as any)._id),
        phone,
      )
      await sendTextMessage(
        phone,
        `❌ Payment rejected. ${result.rejectionReason ?? ''}\nPlease try again.`,
      )
    }

    logger.info(`[SplitChat] ${phone} joined pot ${shortCode}`)
  }

  async onContributionReceived(pawapayDepositId: string): Promise<void> {
    const member = await this.members.findByDepositId(pawapayDepositId)
    if (!member) return
    if ((member as any).hasPaidCurrentCycle) return

    const group = await this.groups.findById(String((member as any).groupId))
    if (!group) return
    ;(member as any).hasPaidCurrentCycle = true
    ;(member as any).paidAt = new Date()
    ;(member as any).totalContributed += (group as any).contributionAmount
    await (member as any).save()

    const members = await this.members.findByGroup(String((group as any)._id))
    const paidCount = members.filter((m: any) => m.hasPaidCurrentCycle).length
    const total = (group as any).contributionAmount * paidCount
    const target =
      (group as any).contributionAmount *
      ((group as any).targetParticipants ?? members.length)

    for (const m of members) {
      if ((m as any).hasPaidCurrentCycle) {
        await sendTextMessage(
          (m as any).phone,
          `📊 *${(group as any).name}*\n\n${paidCount}/${(group as any).targetParticipants ?? members.length} paid\n💰 Collected: ${total.toLocaleString()} XAF / ${target.toLocaleString()} XAF`,
        )
      }
    }

    const targetParticipants = (group as any).targetParticipants
    if (targetParticipants && paidCount >= targetParticipants) {
      await this.closePot(String((group as any)._id), (group as any).adminPhone)
    }

    logger.info(
      `[SplitChat] Contribution received from ${(member as any).phone} for pot ${(group as any).shortCode}`,
    )
  }

  async closePot(groupId: string, organizerPhone: string): Promise<void> {
    const group = await this.groups.findById(groupId)
    if (!group) return

    const members = await this.members.findPaid(groupId)
    const total = (group as any).contributionAmount * members.length
    const fee = calculateFee(total)
    const payout = total - fee

    const payoutId = this.pawapay.generateId()
    ;(group as any).pawapayPayoutId = payoutId
    ;(group as any).status = 'PAYING_OUT'
    await (group as any).save()

    await sendTextMessage(
      organizerPhone,
      `🎉 *Pot closed!*\n\n${payout.toLocaleString()} XAF on its way to your MoMo account.\nPot: *${(group as any).name}*`,
    )

    const result = await this.pawapay.initiatePayout(
      payoutId,
      organizerPhone,
      payout,
      `Pot ${(group as any).shortCode}`.slice(0, 22),
      groupId,
    )

    if (result.status === 'REJECTED') {
      ;(group as any).status = 'ACTIVE'
      ;(group as any).pawapayPayoutId = undefined
      await (group as any).save()
      await sendTextMessage(
        organizerPhone,
        `❌ Payout rejected. ${result.rejectionReason ?? ''}\nPlease contact support.`,
      )
    }

    logger.info(
      `[SplitChat] Pot ${(group as any).shortCode} closed, payout initiated`,
    )
  }

  async onPayoutCompleted(pawapayPayoutId: string): Promise<void> {
    const group = await this.groups.findByPayoutId(pawapayPayoutId)
    if (!group) return
    if ((group as any).status === 'COMPLETED') return
    ;(group as any).status = 'COMPLETED'
    await (group as any).save()

    const members = await this.members.findByGroup(String((group as any)._id))
    for (const m of members) {
      await sendTextMessage(
        (m as any).phone,
        `🎉 *${(group as any).name} complete!*\n\nFunds have been transferred to the organizer. Thank you everyone!`,
      )
    }

    const paidCount = members.filter((m: any) => m.hasPaidCurrentCycle).length
    const potTotal = (group as any).contributionAmount * Math.max(paidCount, 1)
    const potFee = calculateFee(potTotal)
    const potPayout = potTotal - potFee
    appEmitter.emit(EVENTS.RECEIPT_SEND, {
      phone: (group as any).adminPhone,
      data: {
        type: 'splitchat',
        referenceId: (group as any).shortCode,
        dateTime: new Date().toLocaleString('en-US', {
          dateStyle: 'medium',
          timeStyle: 'short',
        }),
        amount: potPayout,
        fee: potFee,
        title: (group as any).name,
        extraLines: [
          {
            label: 'Contributors',
            value: `${paidCount} / ${(group as any).targetParticipants ?? members.length}`,
          },
        ],
      },
    })

    const memberPhones = members.map((m: any) => m.phone)
    await this.users.clearContextByPhones(memberPhones)

    logger.info(`[SplitChat] Pot ${(group as any).shortCode} completed`)
  }

  async cancelPot(groupId: string, organizerPhone: string): Promise<void> {
    const group = await this.groups.findById(groupId)
    if (!group || String((group as any).adminPhone) !== organizerPhone) return

    const members = await this.members.findPaid(groupId)
    ;(group as any).status = 'REFUNDING'
    await (group as any).save()

    for (const member of members) {
      if ((member as any).pawapayDepositId) {
        const refundId = this.pawapay.generateId()
        await this.pawapay.initiateRefund(
          refundId,
          (member as any).pawapayDepositId,
          (group as any).contributionAmount,
          `Cancel ${(group as any).shortCode}`.slice(0, 22),
        )
      }
    }

    await sendTextMessage(
      organizerPhone,
      `↩️ Pot *${(group as any).name}* cancelled. Refunds in progress.`,
    )
    logger.info(
      `[SplitChat] Pot ${(group as any).shortCode} cancelled, refunds initiated`,
    )
  }

  async handleMessage(
    phone: string,
    message: string,
    contextId: string,
  ): Promise<void> {
    const text = message.trim().toLowerCase()
    const group = await this.groups.findById(contextId).catch(() => null)
    if (!group || (group as any).type !== 'SPLITCHAT') return

    if (text === 'cancel' && String((group as any).adminPhone) === phone) {
      await this.cancelPot(contextId, phone)
    } else if (
      text === 'close' &&
      String((group as any).adminPhone) === phone
    ) {
      await this.closePot(contextId, phone)
    }
  }
}

export const splitchatService = new SplitChatService(
  new (require('../../payments/pawapay/pawapay.service').PawapayService)(),
  new (require('../../domain/repositories/group.repository').GroupRepository)(),
  new (require('../../domain/repositories/group-member.repository').GroupMemberRepository)(),
  new (require('../../domain/repositories/user.repository').UserRepository)(),
)
