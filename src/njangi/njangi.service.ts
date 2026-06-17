import { Injectable } from '@nestjs/common'
import { Group } from './group.schema'
import { GroupMember } from './group-member.schema'
import { generateShortCode } from '../common/short-code'
import { calculateFee } from '../common/fee'
import { pawapayService } from '../pawapay/pawapay.service'
import { sendTextMessage } from '../whatsapp/whatsapp.service'
import {
  createWhatsAppGroup,
  getGroupInviteLink,
  sendGroupMessage,
} from '../whatsapp/whatsapp-group.service'
import { sendMoMoReceipt } from '../services/receipt-generator.service'
import { User } from '../models/User'
import type { CreateGroupDto } from '../types'
import logger from '../utils/logger'

@Injectable()
export class NjangiService {
  async createGroup(
    adminPhone: string,
    data: CreateGroupDto,
  ): Promise<typeof Group.prototype> {
    const shortCode = generateShortCode()
    const fee = calculateFee(data.contributionAmount)

    const group = await Group.create({
      shortCode,
      type: 'NJANGI',
      adminPhone,
      name: data.name,
      contributionAmount: data.contributionAmount,
      fee,
      cycleDurationDays: data.cycleDurationDays,
      totalCycles: data.totalCycles,
      payoutOrder: data.payoutOrder ?? 'sequential',
      status: 'SETUP',
    })

    await GroupMember.create({
      groupId: (group as any)._id,
      phone: adminPhone,
      rotationPosition: 1,
    })

    await User.findOneAndUpdate(
      { phoneNumber: adminPhone },
      {
        momotrustContext: `NJANGI:${(group as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    const { WhatsAppService } = await import('../whatsapp/whatsapp.service')
    const groupId = String((group as any)._id)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: adminPhone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text:
            `✅ *Njangi created!*\n\n` +
            `👥 ${data.name}\n` +
            `💰 Contribution: ${data.contributionAmount.toLocaleString()} XAF\n` +
            `🔄 Cycles: ${data.totalCycles}\n` +
            `🔑 Code: *${shortCode}*\n\n` +
            `Share this code with your members so they can type *JOIN ${shortCode}*. Start the cycle when everyone has joined.`,
        },
        action: {
          button: 'Manage group',
          sections: [
            {
              title: 'Njangi Actions',
              rows: [
                {
                  id: `njangi_start:${groupId}`,
                  title: '▶️ Start cycle',
                  description: 'Begin collecting contributions',
                },
                {
                  id: `njangi_status:${groupId}`,
                  title: '📊 View status',
                  description: 'See contributions and ledger',
                },
              ],
            },
          ],
        },
      },
    })

    createWhatsAppGroup(data.name)
      .then(async (waGroupId) => {
        if (!waGroupId) return
        const inviteLink = await getGroupInviteLink(waGroupId)
        await Group.findByIdAndUpdate((group as any)._id, {
          whatsappGroupId: waGroupId,
          whatsappInviteLink: inviteLink,
        })
      })
      .catch(() => {})

    logger.info(`[Njangi] Group created: ${shortCode} by ${adminPhone}`)
    return group
  }

  async joinGroup(phone: string, shortCode: string): Promise<void> {
    const group = await Group.findOne({ shortCode, type: 'NJANGI' })
    if (!group) {
      await sendTextMessage(
        phone,
        `❌ Code *${shortCode}* not found. Please check and try again.`,
      )
      return
    }
    if ((group as any).status !== 'SETUP') {
      await sendTextMessage(
        phone,
        `⚠️ This njangi has already started. You cannot join now.`,
      )
      return
    }

    const existing = await GroupMember.findOne({
      groupId: (group as any)._id,
      phone,
    })
    if (existing) {
      await sendTextMessage(
        phone,
        `ℹ️ You are already a member of *${(group as any).name}*.`,
      )
      return
    }

    const count = await GroupMember.countDocuments({
      groupId: (group as any)._id,
    })
    await GroupMember.create({
      groupId: (group as any)._id,
      phone,
      rotationPosition: count + 1,
    })

    await User.findOneAndUpdate(
      { phoneNumber: phone },
      {
        momotrustContext: `NJANGI:${(group as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    await sendTextMessage(
      phone,
      `✅ You joined *${(group as any).name}*!\n\n` +
        `💰 Contribution: ${(group as any).contributionAmount.toLocaleString()} XAF\n` +
        `👥 Current members: ${count + 1}`,
    )

    await sendTextMessage(
      (group as any).adminPhone,
      `👤 *${phone}* joined *${(group as any).name}*. Total: ${count + 1} member(s).`,
    )

    if ((group as any).whatsappInviteLink) {
      await sendTextMessage(
        phone,
        `🔗 Join the *${(group as any).name}* WhatsApp group: ${(group as any).whatsappInviteLink}`,
      )
    }

    logger.info(`[Njangi] ${phone} joined group ${shortCode}`)
  }

  async startCycle(groupId: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group) return

    const members = await GroupMember.find({ groupId })
    if (members.length === 0) return
    ;(group as any).currentCycle = ((group as any).currentCycle ?? 0) + 1
    ;(group as any).status = 'COLLECTING'

    const order = (group as any).payoutOrder
    let recipient: any
    if (order === 'random') {
      const unpaid = members.filter((m: any) => m.totalReceived === 0)
      recipient = unpaid[Math.floor(Math.random() * unpaid.length)]
    } else {
      const cycle = (group as any).currentCycle
      recipient =
        members.find((m: any) => m.rotationPosition === cycle) ?? members[0]
    }

    ;(group as any).currentRecipientPhone = (recipient as any).phone
    await (group as any).save()

    await GroupMember.updateMany(
      { groupId },
      { hasPaidCurrentCycle: false, paidAt: null },
    )

    const amount = (group as any).contributionAmount
    for (const member of members) {
      await sendTextMessage(
        (member as any).phone,
        `🔔 *Cycle ${(group as any).currentCycle} — ${(group as any).name}*\n\n` +
          `💰 Contribution: ${amount.toLocaleString()} XAF\n` +
          `👤 Recipient: ****${(group as any).currentRecipientPhone.slice(-4)}\n\n` +
          `Send *PAY* to contribute.`,
      )
    }

    if ((group as any).whatsappGroupId) {
      sendGroupMessage(
        (group as any).whatsappGroupId,
        `🔔 Cycle ${(group as any).currentCycle} started!\n\nContribution: ${amount.toLocaleString()} XAF\nRecipient: ****${(group as any).currentRecipientPhone.slice(-4)}\n\nReply PAY to contribute.`,
      ).catch(() => {})
    }

    logger.info(
      `[Njangi] Cycle ${(group as any).currentCycle} started for ${groupId}`,
    )
  }

  async collectContribution(
    groupId: string,
    memberPhone: string,
  ): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group || (group as any).status !== 'COLLECTING') return

    const member = await GroupMember.findOne({ groupId, phone: memberPhone })
    if (!member || (member as any).hasPaidCurrentCycle) {
      await sendTextMessage(
        memberPhone,
        `ℹ️ You have already contributed for this cycle.`,
      )
      return
    }

    const depositId = pawapayService.generateId()
    ;(member as any).pawapayDepositId = depositId
    await (member as any).save()

    const amount = (group as any).contributionAmount
    await sendTextMessage(
      memberPhone,
      `⏳ *Contribution in progress...*\n\nAccept the USSD prompt.\nAmount: ${amount.toLocaleString()} XAF`,
    )

    const result = await pawapayService.initiateDeposit(
      depositId,
      memberPhone,
      amount,
      `Njangi ${(group as any).shortCode} C${(group as any).currentCycle}`.slice(
        0,
        22,
      ),
      groupId,
    )

    if (result.status === 'REJECTED') {
      ;(member as any).pawapayDepositId = undefined
      await (member as any).save()
      await sendTextMessage(
        memberPhone,
        `❌ Payment rejected. ${result.rejectionReason ?? 'Please try again.'}\n\nSend *PAY* to retry.`,
      )
    }
  }

  async onMemberContributed(pawapayDepositId: string): Promise<void> {
    const member = await GroupMember.findOne({ pawapayDepositId })
    if (!member) return
    if ((member as any).hasPaidCurrentCycle) return

    const group = await Group.findById((member as any).groupId)
    if (!group) return
    ;(member as any).hasPaidCurrentCycle = true
    ;(member as any).paidAt = new Date()
    ;(member as any).totalContributed += (group as any).contributionAmount
    ;(member as any).cyclesPaid += 1
    await (member as any).save()

    await sendTextMessage(
      (member as any).phone,
      `✅ Contribution received! ${(group as any).contributionAmount.toLocaleString()} XAF. Thank you!`,
    )

    const allMembers = await GroupMember.find({
      groupId: (member as any).groupId,
    })
    const allPaid = allMembers.every((m: any) => m.hasPaidCurrentCycle)
    if (allPaid) await this.onAllContributed(String((group as any)._id))

    if ((group as any).whatsappGroupId) {
      const allMembers2 = await GroupMember.find({
        groupId: (member as any).groupId,
      })
      const paidNow = allMembers2.filter(
        (m: any) => m.hasPaidCurrentCycle,
      ).length
      sendGroupMessage(
        (group as any).whatsappGroupId,
        `✅ ****${(member as any).phone.slice(-4)} contributed ${(group as any).contributionAmount.toLocaleString()} XAF (${paidNow}/${allMembers2.length} paid)`,
      ).catch(() => {})
    }

    logger.info(
      `[Njangi] Member ${(member as any).phone} contributed to group ${(group as any).shortCode}`,
    )
  }

  async getMemberByDepositId(
    depositId: string,
  ): Promise<typeof GroupMember.prototype | null> {
    return GroupMember.findOne({ pawapayDepositId: depositId })
  }

  async onAllContributed(groupId: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group) return

    const members = await GroupMember.find({ groupId })
    const total = (group as any).contributionAmount * members.length
    const fee = calculateFee(total)
    const payout = total - fee

    const payoutId = pawapayService.generateId()
    ;(group as any).pawapayPayoutId = payoutId
    ;(group as any).status = 'PAYING_OUT'
    await (group as any).save()

    await sendTextMessage(
      (group as any).currentRecipientPhone,
      `🎊 *All contributed!*\n\n${payout.toLocaleString()} XAF on its way to your MoMo account.\nGroup: *${(group as any).name}*`,
    )

    const result = await pawapayService.initiatePayout(
      payoutId,
      (group as any).currentRecipientPhone,
      payout,
      `Njangi ${(group as any).shortCode} C${(group as any).currentCycle}`.slice(
        0,
        22,
      ),
      groupId,
    )

    if (result.status === 'REJECTED') {
      ;(group as any).status = 'COLLECTING'
      ;(group as any).pawapayPayoutId = undefined
      await (group as any).save()
      await sendTextMessage(
        (group as any).adminPhone,
        `❌ Payout to recipient rejected. ${result.rejectionReason ?? ''}\nPlease contact support.`,
      )
    }

    logger.info(
      `[Njangi] Payout initiated for group ${(group as any).shortCode} cycle ${(group as any).currentCycle}`,
    )
  }

  async onPayoutCompleted(pawapayPayoutId: string): Promise<void> {
    const group = await Group.findOne({ pawapayPayoutId })
    if (!group) return
    if (
      (group as any).status === 'COMPLETED' ||
      (group as any).status === 'CYCLE_COMPLETE'
    )
      return

    const recipient = (group as any).currentRecipientPhone
    const member = await GroupMember.findOne({
      groupId: (group as any)._id,
      phone: recipient,
    })
    if (member) {
      ;(member as any).totalReceived +=
        (group as any).contributionAmount *
        (await GroupMember.countDocuments({ groupId: (group as any)._id }))
      await (member as any).save()
    }

    const isLastCycle =
      (group as any).currentCycle >= (group as any).totalCycles
    ;(group as any).status = isLastCycle ? 'COMPLETED' : 'CYCLE_COMPLETE'
    await (group as any).save()

    const members = await GroupMember.find({ groupId: (group as any)._id })
    for (const m of members) {
      await sendTextMessage(
        (m as any).phone,
        isLastCycle
          ? `🎉 *Njangi completed!*\n\n*${(group as any).name}* has completed all cycles. Thank you everyone!`
          : `✅ *Cycle ${(group as any).currentCycle} complete!*\n\n*${(group as any).name}* — Next cycle coming soon.`,
      )
    }

    const memberCount = members.length
    const total = (group as any).contributionAmount * memberCount
    const cycleFee = calculateFee(total)
    const payout = total - cycleFee
    sendMoMoReceipt((group as any).currentRecipientPhone, {
      type: 'njangi',
      referenceId: (group as any).shortCode,
      dateTime: new Date().toLocaleString('en-US', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
      amount: payout,
      fee: cycleFee,
      title: (group as any).name,
      extraLines: [
        {
          label: 'Cycle',
          value: `${(group as any).currentCycle} / ${(group as any).totalCycles}`,
        },
        { label: 'Contributors', value: String(memberCount) },
      ],
    }).catch(() => {})

    const memberPhones = members.map((m: any) => m.phone)
    await User.updateMany(
      { phoneNumber: { $in: memberPhones } },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )

    if ((group as any).whatsappGroupId) {
      const announcement = isLastCycle
        ? `🎉 Njangi completed! All ${(group as any).totalCycles} cycles done. Thank you everyone!`
        : `✅ Cycle ${(group as any).currentCycle} payout done! ****${recipient.slice(-4)} received ${(group as any).contributionAmount * members.length - calculateFee((group as any).contributionAmount * members.length)} XAF.`
      sendGroupMessage((group as any).whatsappGroupId, announcement).catch(
        () => {},
      )
    }

    logger.info(
      `[Njangi] Payout completed for group ${(group as any).shortCode} cycle ${(group as any).currentCycle}`,
    )
  }

  async getLedger(groupId: string, phone: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group) return

    const members = await GroupMember.find({ groupId })
    const member = members.find((m: any) => m.phone === phone)
    if (!member) return

    const lines = members
      .sort((a: any, b: any) => a.rotationPosition - b.rotationPosition)
      .map(
        (m: any, i) =>
          `${i + 1}. ****${m.phone.slice(-4)} — Contributed: ${m.totalContributed.toLocaleString()} XAF`,
      )

    await sendTextMessage(
      phone,
      `📊 *${(group as any).name}*\n\nCycle ${(group as any).currentCycle}/${(group as any).totalCycles}\n\n${lines.join('\n')}\n\nYour total contributed: ${(member as any).totalContributed.toLocaleString()} XAF`,
    )
  }

  async sendAllPendingReminders(): Promise<void> {
    const groups = await Group.find({ status: 'COLLECTING' })
    for (const group of groups) {
      const unpaidMembers = await GroupMember.find({
        groupId: (group as any)._id,
        hasPaidCurrentCycle: false,
      })
      for (const member of unpaidMembers) {
        await sendTextMessage(
          (member as any).phone,
          `⏰ *Reminder — ${(group as any).name}*\n\nYour contribution of ${(group as any).contributionAmount.toLocaleString()} XAF is pending.\nSend *PAY* to contribute now.`,
        )
      }
    }
  }

  async handleMessage(
    phone: string,
    _message: string,
    contextId: string,
  ): Promise<void> {
    const group = await Group.findById(contextId).catch(() => null)
    if (!group) {
      const { sendMainMenu } = await import('../whatsapp/whatsapp-menu.service')
      const user = await (
        await import('../models/User')
      ).User.findOne({ phoneNumber: phone })
      await sendMainMenu(phone, user?.username ?? '')
      return
    }

    await this.sendGroupButtons(phone, group)
  }

  async sendGroupButtons(phone: string, group: any): Promise<void> {
    const { WhatsAppService } = await import('../whatsapp/whatsapp.service')
    const groupId = String(group._id)
    const status = group.status
    const rows: any[] = []

    if (status === 'SETUP') {
      rows.push({
        id: `njangi_start:${groupId}`,
        title: '▶️ Start cycle',
        description: 'Begin collecting contributions',
      })
    }
    if (status === 'COLLECTING') {
      rows.push({
        id: `njangi_pay:${groupId}`,
        title: '💰 Pay contribution',
        description: `${group.contributionAmount?.toLocaleString()} XAF`,
      })
    }
    rows.push({
      id: `njangi_status:${groupId}`,
      title: '📊 View status',
      description: 'See contributions and ledger',
    })

    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: `*${group.name}* · Code: *${group.shortCode}*\nContribution: ${group.contributionAmount?.toLocaleString()} XAF · ${status}`,
        },
        action: {
          button: 'View options',
          sections: [{ title: 'Njangi Actions', rows }],
        },
      },
    })
  }
}

export const njangiService = new NjangiService()
