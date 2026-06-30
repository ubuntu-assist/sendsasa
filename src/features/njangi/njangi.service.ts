import { Injectable } from '@nestjs/common'
import { Group } from './group.schema'
import { GroupMember } from './group-member.schema'
import { generateShortCode } from '@common/helpers/short-code'
import { calculateFee } from '@common/helpers/fee'
import { pawapayService } from '@payments/pawapay/pawapay.service'
import { sendTextMessage, sendCtaUrlButton } from '@messaging/whatsapp/whatsapp.service'
import { sendMoMoReceipt } from '@shared/receipt-generator.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { PaymentRailService } from '@shared/payment-rail.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import { User } from '@models/User'
import type { CreateGroupDto } from '@app/types'
import logger from '@common/utils/logger'

@Injectable()
export class NjangiService {
  constructor(
    private readonly stellarAnchor: StellarAnchorService,
    private readonly stellar: StellarService,
    private readonly paymentRailService: PaymentRailService,
    private readonly fxRate: FxRateService,
  ) {}

  async createGroup(
    adminPhone: string,
    data: CreateGroupDto,
  ): Promise<typeof Group.prototype | null> {
    const admin = await User.findOne({ phoneNumber: adminPhone }).select('operatingRegion stellar_public_key')
    const adminRail = admin ? this.paymentRailService.getRail(admin as any) : 'pawapay'

    if (adminRail === 'stellar' && !data.allowDiaspora) {
      await sendTextMessage(
        adminPhone,
        '🇨🇲 Standard Njangi is only for Cameroon MoMo users.\n\nTo create a cross-border group open to diaspora members, enable the *Allow Diaspora* option.',
      )
      return null
    }

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
      allowDiaspora: data.allowDiaspora ?? false,
      localXafPool: 0,
      stellarUsdcPool: 0,
    })

    await GroupMember.create({
      groupId: (group as any)._id,
      phone: adminPhone,
      rotationPosition: 1,
      railType: adminRail,
    })

    await User.findOneAndUpdate(
      { phoneNumber: adminPhone },
      {
        momotrustContext: `NJANGI:${(group as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    const diasporaNote = data.allowDiaspora
      ? `\n🌍 Cross-border enabled — diaspora members pay via Stellar/Circle.`
      : ''

    const { WhatsAppService } = await import('@messaging/whatsapp/whatsapp.service')
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
            `🔑 Code: *${shortCode}*` +
            diasporaNote +
            `\n\nShare this code with members so they can type *JOIN ${shortCode}*. Start the cycle when everyone has joined.`,
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

    logger.info(`[Njangi] Group created: ${shortCode} by ${adminPhone} (allowDiaspora=${data.allowDiaspora ?? false})`)
    return group
  }

  async joinGroup(phone: string, shortCode: string): Promise<void> {
    const group = await Group.findOne({ shortCode, type: 'NJANGI' })
    if (!group) {
      await sendTextMessage(phone, `❌ Code *${shortCode}* not found. Please check and try again.`)
      return
    }
    if ((group as any).status !== 'SETUP') {
      await sendTextMessage(phone, `⚠️ This njangi has already started. You cannot join now.`)
      return
    }

    const joiner = await User.findOne({ phoneNumber: phone }).select('operatingRegion stellar_public_key')
    const joinerRail = joiner ? this.paymentRailService.getRail(joiner as any) : 'pawapay'

    if (joinerRail === 'stellar' && !(group as any).allowDiaspora) {
      await sendTextMessage(phone, '🇨🇲 This njangi is only for Cameroon MoMo users.')
      return
    }

    const existing = await GroupMember.findOne({ groupId: (group as any)._id, phone })
    if (existing) {
      await sendTextMessage(phone, `ℹ️ You are already a member of *${(group as any).name}*.`)
      return
    }

    const count = await GroupMember.countDocuments({ groupId: (group as any)._id })
    await GroupMember.create({
      groupId: (group as any)._id,
      phone,
      rotationPosition: count + 1,
      railType: joinerRail,
    })

    await User.findOneAndUpdate(
      { phoneNumber: phone },
      {
        momotrustContext: `NJANGI:${(group as any)._id}`,
        momotrustContextUpdatedAt: new Date(),
      },
    )

    const railLabel = joinerRail === 'stellar' ? ' · 🌍 Diaspora (Circle)' : ' · 🇨🇲 MoMo'
    await sendTextMessage(
      phone,
      `✅ You joined *${(group as any).name}*!${railLabel}\n\n` +
        `💰 Contribution: ${(group as any).contributionAmount.toLocaleString()} XAF\n` +
        `👥 Current members: ${count + 1}`,
    )

    await sendTextMessage(
      (group as any).adminPhone,
      `👤 *${phone}* joined *${(group as any).name}*${railLabel}. Total: ${count + 1} member(s).`,
    )

    logger.info(`[Njangi] ${phone} (rail=${joinerRail}) joined group ${shortCode}`)
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
      recipient = members.find((m: any) => m.rotationPosition === cycle) ?? members[0]
    }

    ;(group as any).currentRecipientPhone = (recipient as any).phone
    await (group as any).save()

    await GroupMember.updateMany({ groupId }, { hasPaidCurrentCycle: false, paidAt: null })

    const amount = (group as any).contributionAmount
    const fallbackRate = await this.fxRate.getUSDtoXAF()
    const usdEquiv = (amount / fallbackRate).toFixed(2)

    for (const member of members) {
      const isStellarMember = (member as any).railType === 'stellar'
      const paymentLine = isStellarMember
        ? `💵 ~$${usdEquiv} USD via Circle\n\nSend *PAY* to get your payment link.`
        : `💰 Contribution: ${amount.toLocaleString()} XAF\n\nSend *PAY* to contribute.`

      await sendTextMessage(
        (member as any).phone,
        `🔔 *Cycle ${(group as any).currentCycle} — ${(group as any).name}*\n\n` +
          paymentLine +
          `\n👤 Recipient: ****${(group as any).currentRecipientPhone.slice(-4)}`,
      )
    }

    logger.info(`[Njangi] Cycle ${(group as any).currentCycle} started for ${groupId}`)
  }

  async collectContribution(groupId: string, memberPhone: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group || (group as any).status !== 'COLLECTING') return

    const member = await GroupMember.findOne({ groupId, phone: memberPhone })
    if (!member || (member as any).hasPaidCurrentCycle) {
      await sendTextMessage(memberPhone, `ℹ️ You have already contributed for this cycle.`)
      return
    }

    if ((member as any).railType === 'stellar') {
      await this._initiateCircleContribution(group as any, member as any)
    } else {
      await this._initiatePawapayContribution(group as any, member as any)
    }
  }

  private async _initiatePawapayContribution(group: any, member: any): Promise<void> {
    const depositId = pawapayService.generateId()
    member.pawapayDepositId = depositId
    await member.save()

    const amount = group.contributionAmount
    await sendTextMessage(
      member.phone,
      `⏳ *Contribution in progress...*\n\nAccept the USSD prompt.\nAmount: ${amount.toLocaleString()} XAF`,
    )

    const result = await pawapayService.initiateDeposit(
      depositId,
      member.phone,
      amount,
      `Njangi ${group.shortCode} C${group.currentCycle}`.slice(0, 22),
      String(group._id),
    )

    if (result.status === 'REJECTED') {
      member.pawapayDepositId = undefined
      await member.save()
      await sendTextMessage(
        member.phone,
        `❌ Payment rejected. ${result.rejectionReason ?? 'Please try again.'}\n\nSend *PAY* to retry.`,
      )
    }
  }

  private async _initiateCircleContribution(group: any, member: any): Promise<void> {
    const user = await User.findOne({ phoneNumber: member.phone }).select('stellar_public_key')
    if (!user?.stellar_public_key) {
      await sendTextMessage(
        member.phone,
        `⚠️ No Stellar wallet linked. Please complete wallet setup first.`,
      )
      return
    }

    try {
      const fallbackRate = await this.fxRate.getUSDtoXAF()
      const sep38Rate = await this.stellarAnchor.getXafPerUsdc(group.contributionAmount / fallbackRate)
      const xafPerUsdc = sep38Rate ?? fallbackRate
      const usdcAmount = parseFloat((group.contributionAmount / xafPerUsdc).toFixed(7))
      const rateLabel = sep38Rate ? 'live · Stellar' : 'live'

      const { interactiveUrl, sep24Id } = await this.stellarAnchor.initiateCircleDeposit(
        user.stellar_public_key,
        'USD',
        usdcAmount,
      )

      member.sep24TransactionId = sep24Id
      member.sep24UsdcAmount = usdcAmount
      await member.save()

      await sendCtaUrlButton(
        member.phone,
        `💳 *Njangi contribution — ${group.name}*\n\n` +
          `Amount: ${group.contributionAmount.toLocaleString()} XAF\n` +
          `≈ $${usdcAmount.toFixed(2)} USD\n` +
          `Rate: 1 USDC = ${Math.round(xafPerUsdc).toLocaleString()} XAF (${rateLabel})\n` +
          `Cycle: ${group.currentCycle}\n\n` +
          `Complete your payment below. Funds will be applied automatically.`,
        'Pay Now',
        interactiveUrl,
      )

      // Background poll — does not block the reply
      this._pollSep24Contribution(String(group._id), member.phone, sep24Id)

      logger.info(`[Njangi] Circle deposit initiated for ${member.phone} sep24Id=${sep24Id}`)
    } catch (err: any) {
      logger.error(`[Njangi] Circle deposit failed for ${member.phone}: ${err?.message}`)
      await sendTextMessage(
        member.phone,
        `❌ Failed to generate payment link. Please try again or contact support.`,
      )
    }
  }

  private _pollSep24Contribution(groupId: string, memberPhone: string, sep24Id: string): void {
    let attempts = 0
    const MAX_ATTEMPTS = 120 // 120 × 30s = 1 hour

    const interval = setInterval(async () => {
      attempts++
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(interval)
        logger.error(`[Njangi] SEP-24 poll timeout for ${memberPhone} sep24Id=${sep24Id}`)
        sendTextMessage(memberPhone, `⏰ Your contribution payment timed out. Send *PAY* to try again.`).catch(() => {})
        return
      }

      try {
        const jwt = await this.stellarAnchor.getSep10Jwt(this.stellarAnchor.circleAnchorUrl)
        const txStatus = await this.stellarAnchor.getSep24TransactionStatus(
          this.stellarAnchor.circleAnchorUrl,
          jwt,
          sep24Id,
        )

        if (txStatus.status === 'completed') {
          clearInterval(interval)
          await this.onStellarMemberContributed(groupId, memberPhone)
        } else if (['error', 'expired', 'refunded', 'no_market'].includes(txStatus.status)) {
          clearInterval(interval)
          logger.error(`[Njangi] SEP-24 ${txStatus.status} for ${memberPhone} sep24Id=${sep24Id}`)
          sendTextMessage(
            memberPhone,
            `❌ Contribution payment ${txStatus.status}. Send *PAY* to try again.`,
          ).catch(() => {})
        }
      } catch (err: any) {
        logger.error(`[Njangi] SEP-24 poll error for ${sep24Id}: ${err?.message}`)
      }
    }, 30_000)
  }

  async onStellarMemberContributed(groupId: string, memberPhone: string): Promise<void> {
    const member = await GroupMember.findOne({ groupId, phone: memberPhone })
    if (!member || (member as any).hasPaidCurrentCycle) return

    const group = await Group.findById(groupId)
    if (!group || (group as any).status !== 'COLLECTING') return

    const usdcAmount = (member as any).sep24UsdcAmount ?? 0
    ;(member as any).hasPaidCurrentCycle = true
    ;(member as any).paidAt = new Date()
    ;(member as any).cyclesPaid = ((member as any).cyclesPaid ?? 0) + 1
    await (member as any).save()

    ;(group as any).stellarUsdcPool = ((group as any).stellarUsdcPool ?? 0) + usdcAmount
    await (group as any).save()

    await sendTextMessage(memberPhone, `✅ Contribution received! $${usdcAmount.toFixed(2)} USDC. Thank you!`)

    const allMembers = await GroupMember.find({ groupId })
    const allPaid = allMembers.every((m: any) => m.hasPaidCurrentCycle)
    if (allPaid) await this.onAllContributed(groupId)

    logger.info(`[Njangi] Stellar member ${memberPhone} contributed ${usdcAmount} USDC to ${(group as any).shortCode}`)
  }

  async onMemberContributed(pawapayDepositId: string): Promise<void> {
    const member = await GroupMember.findOne({ pawapayDepositId })
    if (!member || (member as any).hasPaidCurrentCycle) return

    const group = await Group.findById((member as any).groupId)
    if (!group) return

    const contributionAmount = (group as any).contributionAmount
    ;(member as any).hasPaidCurrentCycle = true
    ;(member as any).paidAt = new Date()
    ;(member as any).totalContributed = ((member as any).totalContributed ?? 0) + contributionAmount
    ;(member as any).cyclesPaid = ((member as any).cyclesPaid ?? 0) + 1
    await (member as any).save()

    ;(group as any).localXafPool = ((group as any).localXafPool ?? 0) + contributionAmount
    await (group as any).save()

    await sendTextMessage(
      (member as any).phone,
      `✅ Contribution received! ${contributionAmount.toLocaleString()} XAF. Thank you!`,
    )

    const allMembers = await GroupMember.find({ groupId: (member as any).groupId })
    const allPaid = allMembers.every((m: any) => m.hasPaidCurrentCycle)
    if (allPaid) await this.onAllContributed(String((group as any)._id))

    logger.info(`[Njangi] Member ${(member as any).phone} contributed to group ${(group as any).shortCode}`)
  }

  async getMemberByDepositId(depositId: string): Promise<typeof GroupMember.prototype | null> {
    return GroupMember.findOne({ pawapayDepositId: depositId })
  }

  async onAllContributed(groupId: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group) return

    const localXafPool = (group as any).localXafPool as number
    const stellarUsdcPool = (group as any).stellarUsdcPool as number
    if (localXafPool === 0 && stellarUsdcPool === 0) return

    ;(group as any).status = 'PAYING_OUT'
    ;(group as any).localXafPayoutDone = localXafPool === 0
    ;(group as any).stellarUsdcPayoutDone = stellarUsdcPool === 0
    await (group as any).save()

    const recipientPhone = (group as any).currentRecipientPhone as string
    const shortCode = (group as any).shortCode as string
    const cycle = (group as any).currentCycle as number

    // ── 1. pawaPay XAF payout ─────────────────────────────────────────────
    if (localXafPool > 0) {
      const fee = calculateFee(localXafPool)
      const localPayout = Math.max(0, localXafPool - fee)
      const payoutId = pawapayService.generateId()
      ;(group as any).pawapayPayoutId = payoutId
      await (group as any).save()

      await sendTextMessage(
        recipientPhone,
        `🎊 *All contributed!*\n\n${localPayout.toLocaleString()} XAF on its way to your MoMo account.\nGroup: *${(group as any).name}*`,
      )

      const result = await pawapayService.initiatePayout(
        payoutId,
        recipientPhone,
        localPayout,
        `Njangi ${shortCode} C${cycle}`.slice(0, 22),
        groupId,
      )

      if (result.status === 'REJECTED') {
        ;(group as any).pawapayPayoutId = undefined
        ;(group as any).localXafPayoutDone = false
        ;(group as any).status = 'COLLECTING'
        await (group as any).save()
        await sendTextMessage(
          (group as any).adminPhone,
          `❌ XAF payout to recipient rejected. ${result.rejectionReason ?? ''}\nPlease contact support.`,
        )
        return
      }
    }

    // ── 2. Stellar USDC off-ramp (Onafriq → XAF MoMo) ───────────────────
    if (stellarUsdcPool > 0) {
      try {
        const { sep31TransactionId, onafriqStellarAccount, stellarMemo } =
          await this.stellarAnchor.prepareOnafriqOffRamp({
            recipientPhone,
            recipientCountryCode: 'CM',
            usdcAmount: stellarUsdcPool,
            localCurrencyCode: 'XAF',
          })

        ;(group as any).sep31TransactionId = sep31TransactionId
        await (group as any).save()

        await this.stellar.pathPaymentStrictSend(
          onafriqStellarAccount,
          stellarUsdcPool,
          stellarUsdcPool * 0.98, // 2% slippage tolerance
          stellarMemo,
        )

        ;(group as any).stellarUsdcPayoutDone = true
        await (group as any).save()

        logger.info(
          `[Njangi] Onafriq off-ramp complete for ${shortCode} C${cycle}: ${stellarUsdcPool} USDC → ${recipientPhone}`,
        )
      } catch (err: any) {
        logger.error(`[Njangi] Stellar off-ramp failed for ${shortCode}: ${err?.message}`)
        ;(group as any).stellarUsdcPayoutDone = false
        ;(group as any).status = localXafPool > 0 ? 'PAYING_OUT' : 'COLLECTING'
        await (group as any).save()
        await sendTextMessage(
          (group as any).adminPhone,
          `❌ Diaspora USDC payout failed for ${shortCode}. Please contact support.\n${err?.message ?? ''}`,
        )
        if (localXafPool === 0) return
      }
    }

    // Advance cycle if both payouts already resolved (e.g. Stellar-only group)
    await this._tryAdvanceCycle(groupId)

    logger.info(`[Njangi] Payouts initiated for group ${shortCode} cycle ${cycle}`)
  }

  async onPayoutCompleted(pawapayPayoutId: string): Promise<void> {
    const group = await Group.findOne({ pawapayPayoutId })
    if (!group) return
    if ((group as any).status === 'COMPLETED' || (group as any).status === 'CYCLE_COMPLETE') return

    const recipientPhone = (group as any).currentRecipientPhone as string
    const localXafPool = (group as any).localXafPool as number

    const member = await GroupMember.findOne({ groupId: (group as any)._id, phone: recipientPhone })
    if (member) {
      ;(member as any).totalReceived = ((member as any).totalReceived ?? 0) + localXafPool
      await (member as any).save()
    }

    ;(group as any).localXafPayoutDone = true
    await (group as any).save()

    await this._tryAdvanceCycle(String((group as any)._id))

    logger.info(
      `[Njangi] pawaPay payout complete for group ${(group as any).shortCode} cycle ${(group as any).currentCycle}`,
    )
  }

  private async _tryAdvanceCycle(groupId: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group || (group as any).status !== 'PAYING_OUT') return
    if (!(group as any).localXafPayoutDone || !(group as any).stellarUsdcPayoutDone) return

    // Capture pool values for receipt before resetting
    const localXafPool = (group as any).localXafPool as number
    const stellarUsdcPool = (group as any).stellarUsdcPool as number
    const xafRate = await this.fxRate.getUSDtoXAF()
    const stellarPoolXafEquiv = Math.round(stellarUsdcPool * xafRate)
    const cycleFee = calculateFee(localXafPool)
    const xafPaidOut = Math.max(0, localXafPool - cycleFee)

    const isLastCycle = (group as any).currentCycle >= (group as any).totalCycles
    ;(group as any).status = isLastCycle ? 'COMPLETED' : 'CYCLE_COMPLETE'
    ;(group as any).localXafPool = 0
    ;(group as any).stellarUsdcPool = 0
    ;(group as any).localXafPayoutDone = false
    ;(group as any).stellarUsdcPayoutDone = false
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

    const extraLines: { label: string; value: string }[] = [
      { label: 'Cycle', value: `${(group as any).currentCycle} / ${(group as any).totalCycles}` },
      { label: 'Contributors', value: String(members.length) },
    ]
    if (stellarUsdcPool > 0) {
      extraLines.push({
        label: 'Diaspora',
        value: `$${stellarUsdcPool.toFixed(2)} ≈ ${stellarPoolXafEquiv.toLocaleString()} XAF`,
      })
    }

    const recipientPhone = (group as any).currentRecipientPhone as string
    sendMoMoReceipt(recipientPhone, {
      type: 'njangi',
      referenceId: (group as any).shortCode,
      dateTime: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }),
      amount: xafPaidOut + stellarPoolXafEquiv,
      fee: cycleFee,
      title: (group as any).name,
      extraLines,
    }).catch(() => {})

    const memberPhones = members.map((m: any) => m.phone)
    await User.updateMany(
      { phoneNumber: { $in: memberPhones } },
      { $unset: { momotrustContext: 1, momotrustContextUpdatedAt: 1 } },
    )

    logger.info(`[Njangi] Cycle ${(group as any).currentCycle} complete for group ${(group as any).shortCode}`)
  }

  async getLedger(groupId: string, phone: string): Promise<void> {
    const group = await Group.findById(groupId)
    if (!group) return

    const members = await GroupMember.find({ groupId })
    const member = members.find((m: any) => m.phone === phone)
    if (!member) return

    const lines = members
      .sort((a: any, b: any) => a.rotationPosition - b.rotationPosition)
      .map((m: any, i) => {
        const rail = m.railType === 'stellar' ? ' 🌍' : ' 🇨🇲'
        return `${i + 1}. ****${m.phone.slice(-4)}${rail} — Contributed: ${m.totalContributed.toLocaleString()} XAF`
      })

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
        const isStellar = (member as any).railType === 'stellar'
        const prompt = isStellar
          ? `Your diaspora contribution is pending. Send *PAY* to get a new Circle payment link.`
          : `Your contribution of ${(group as any).contributionAmount.toLocaleString()} XAF is pending. Send *PAY* to contribute now.`

        await sendTextMessage(
          (member as any).phone,
          `⏰ *Reminder — ${(group as any).name}*\n\n${prompt}`,
        )
      }
    }
  }

  async handleMessage(phone: string, _message: string, contextId: string): Promise<void> {
    const group = await Group.findById(contextId).catch(() => null)
    if (!group) {
      const { sendMainMenu } = await import('@messaging/whatsapp/whatsapp-menu.service')
      const user = await (await import('@models/User')).User.findOne({ phoneNumber: phone })
      await sendMainMenu(phone, user?.username ?? '')
      return
    }

    await this.sendGroupButtons(phone, group)
  }

  async sendGroupButtons(phone: string, group: any): Promise<void> {
    const { WhatsAppService } = await import('@messaging/whatsapp/whatsapp.service')
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
        description: group.allowDiaspora ? 'MoMo or Circle (auto-detected)' : `${group.contributionAmount?.toLocaleString()} XAF`,
      })
    }
    rows.push({
      id: `njangi_status:${groupId}`,
      title: '📊 View status',
      description: 'See contributions and ledger',
    })

    const diasporaBadge = group.allowDiaspora ? ' · 🌍 Cross-border' : ''
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'list',
        body: {
          text: `*${group.name}* · Code: *${group.shortCode}*${diasporaBadge}\nContribution: ${group.contributionAmount?.toLocaleString()} XAF · ${status}`,
        },
        action: {
          button: 'View options',
          sections: [{ title: 'Njangi Actions', rows }],
        },
      },
    })
  }
}

export const njangiService = new NjangiService(
  new (require('../../blockchain/stellar/stellar-anchor.service').StellarAnchorService)(),
  new (require('../../blockchain/stellar/stellar.service').StellarService)(),
  new (require('../../shared/services/payment-rail.service').PaymentRailService)(),
  fxRateService,
)
