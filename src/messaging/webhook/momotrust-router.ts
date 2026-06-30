import { trustlockService } from '@features/trustlock/trustlock.service'
import { njangiService } from '@features/njangi/njangi.service'
import { splitchatService } from '@features/splitchat/splitchat.service'
import { paydayService } from '@features/payday/payday.service'
import { safipayService } from '@features/safipay/safipay.service'
import { kobokallService } from '@features/kobokall/kobokall.service'
import { sendTextMessage } from '@messaging/whatsapp/whatsapp.service'
import { Group } from '@features/njangi/group.schema'

export async function handleMomotrustMessage(
  feature: string,
  contextId: string,
  phone: string,
  text: string,
): Promise<void> {
  // Njangi PAY requires PIN — launch flow instead of executing directly
  if (feature === 'NJANGI' && text.trim().toLowerCase() === 'pay') {
    const { FlowLauncherService } = await import('@messaging/flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone.replace(/^\+/, ''),
      'njangi_pay',
      contextId,
      'Confirm your Njangi contribution. Accept the USSD prompt after PIN verification.',
    )
    return
  }

  if (feature === 'SPLITCHAT' && text.trim().toLowerCase() === 'pay') {
    const group = await Group.findById(contextId)
    if (group && (group as any).mode === 'SPLIT') {
      const { FlowLauncherService } = await import('@messaging/flow/flow-launcher.service')
      await FlowLauncherService.launchPinConfirmFlow(
        phone.replace(/^\+/, ''),
        'splitchat_join',
        (group as any).shortCode,
        `Pay ${(group as any).contributionAmount.toLocaleString()} XAF to contribute to *${(group as any).name}*.`,
      )
    } else if (group) {
      await sendTextMessage(phone, `ℹ️ As the organizer, you receive the pot — you don't need to contribute.`)
    }
    return
  }

  switch (feature) {
    case 'TRUSTLOCK':
      return trustlockService.handleMessage(phone, text, contextId)
    case 'NJANGI':
      return njangiService.handleMessage(phone, text, contextId)
    case 'SPLITCHAT':
      return splitchatService.handleMessage(phone, text, contextId)
    case 'PAYDAY':
      return paydayService.handleMessage(phone, text, contextId)
    case 'SAFIPAY':
      return safipayService.handleMessage(phone, text, contextId)
    case 'DISPUTE':
      return trustlockService.receiveEvidence(contextId, phone, text)
    case 'KOBOKALL':
      return kobokallService.handleMessage(phone, text, contextId)
    case 'CRYPTO_SELL':
      return handleCryptoSellMessage(phone, text, contextId)
  }
}

async function handleCryptoSellMessage(
  phone: string,
  text: string,
  contextId: string,
): Promise<void> {
  // contextId = "BNB" or "BNB:50" (after amount entered)
  const parts = contextId.split(':')
  const asset = parts[0]

  // If we already have an amount, this message is the MoMo provider choice
  // But since provider is asked via interactive button, we just wait for the amount first
  const amount = parseFloat(text.trim())
  if (Number.isNaN(amount) || amount <= 0) {
    await sendTextMessage(phone, `❌ Invalid amount. Please reply with a number (e.g. 50).`)
    return
  }

  // Ask which MoMo provider to receive the payment
  const { WhatsAppService } = await import('@messaging/whatsapp/whatsapp.service')
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: phone,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: `Send ${amount} ${asset} XAF equivalent to which account?` },
      action: {
        buttons: [
          { type: 'reply', reply: { id: `sell_confirm:${asset}:${amount}:mtn`, title: '📱 MTN MoMo' } },
          { type: 'reply', reply: { id: `sell_confirm:${asset}:${amount}:orange`, title: '🟠 Orange Money' } },
        ],
      },
    },
  })

  // Update context with amount so next step knows
  const { User } = await import('@models/User')
  await User.updateOne(
    { phoneNumber: phone },
    { momotrustContext: `CRYPTO_SELL:${asset}:${amount}`, momotrustContextUpdatedAt: new Date() },
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
    const { FlowLauncherService } = await import('@messaging/flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone.replace(/^\+/, ''),
      'splitchat_join',
      shortCode,
      `Pay ${(group as any).contributionAmount.toLocaleString()} XAF to join *${(group as any).name}*.`,
    )
  }
}
