import { trustlockService } from '@features/trustlock/trustlock.service'
import { njangiService } from '@features/njangi/njangi.service'
import { splitchatService } from '@features/splitchat/splitchat.service'
import { paydayService } from '@features/payday/payday.service'
import { safipayService } from '@features/safipay/safipay.service'
import { kobokallService } from '@features/kobokall/kobokall.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { Group } from '@features/njangi/group.schema'
import type { UserContext } from '@app/types'

export async function handleMomotrustMessage(
  ctx: UserContext,
  phone: string,
  text: string,
): Promise<void> {
  const normalizedText = text.trim().toLowerCase()

  if (ctx.type === 'NJANGI' && normalizedText === 'pay') {
    const { FlowLauncherService } =
      await import('@messaging/flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone.replace(/^\+/, ''),
      'njangi_pay',
      ctx.groupId,
      'Confirm your Njangi contribution. Accept the USSD prompt after PIN verification.',
    )
    return
  }

  if (ctx.type === 'SPLITCHAT' && normalizedText === 'pay') {
    const group = await Group.findById(ctx.groupId)
    if (group && (group as any).mode === 'SPLIT') {
      const { FlowLauncherService } =
        await import('@messaging/flow/flow-launcher.service')
      await FlowLauncherService.launchPinConfirmFlow(
        phone.replace(/^\+/, ''),
        'splitchat_join',
        (group as any).shortCode,
        `Pay ${(group as any).contributionAmount.toLocaleString()} XAF to contribute to *${(group as any).name}*.`,
      )
    } else if (group) {
      await sendTextMessage(
        phone,
        `ℹ️ As the organizer, you receive the pot — you don't need to contribute.`,
      )
    }
    return
  }

  switch (ctx.type) {
    case 'NJANGI':
      return njangiService.handleMessage(phone, text, ctx.groupId)
    case 'SPLITCHAT':
      return splitchatService.handleMessage(phone, text, ctx.groupId)
    case 'PAYDAY':
      return paydayService.handleMessage(phone, text, ctx.payrollId)
    case 'SAFIPAY':
      return safipayService.handleMessage(phone, text, ctx.invoiceId)
    case 'DISPUTE':
      return trustlockService.receiveEvidence(ctx.disputeId, phone, text)
    case 'KOBOKALL':
      return kobokallService.handleMessage(phone, text, ctx.id)
    case 'CRYPTO_SELL':
      return handleCryptoSellMessage(phone, text, ctx)
  }
}

async function handleCryptoSellMessage(
  phone: string,
  text: string,
  ctx: { type: 'CRYPTO_SELL'; asset: string; amount?: string },
): Promise<void> {
  const { asset } = ctx

  const amount = parseFloat(text.trim())
  if (Number.isNaN(amount) || amount <= 0) {
    await sendTextMessage(
      phone,
      `❌ Invalid amount. Please reply with a number (e.g. 50).`,
    )
    return
  }

  const { sendMessage } = await import('@messaging/whatsapp/whatsapp.service')
  await sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Send ${amount} ${asset} XAF equivalent to which account?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `sell_confirm:${asset}:${amount}:mtn`,
              title: '📱 MTN MoMo',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `sell_confirm:${asset}:${amount}:orange`,
              title: '🟠 Orange Money',
            },
          },
        ],
      },
    },
  })

  // Persist amount into context so the next step knows
  const { User } = await import('@models/User')
  await User.updateOne(
    { phoneNumber: phone },
    {
      momotrustContext: JSON.stringify({ type: 'CRYPTO_SELL', asset, amount: String(amount) }),
      momotrustContextUpdatedAt: new Date(),
    },
  )
}

export async function tryJoinGroup(
  phone: string,
  shortCode: string,
): Promise<void> {
  const group = await Group.findOne({ shortCode })
  if (!group) {
    await sendTextMessage(
      phone,
      `❌ Code *${shortCode}* not found. Please check the code and try again.`,
    )
    return
  }
  if ((group as any).type === 'NJANGI')
    return njangiService.joinGroup(phone, shortCode)
  if ((group as any).type === 'SPLITCHAT') {
    // Payment is triggered on join — require PIN first via flow
    const { FlowLauncherService } =
      await import('@messaging/flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone.replace(/^\+/, ''),
      'splitchat_join',
      shortCode,
      `Pay ${(group as any).contributionAmount.toLocaleString()} XAF to join *${(group as any).name}*.`,
    )
  }
}
