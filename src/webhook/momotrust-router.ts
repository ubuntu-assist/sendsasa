import { trustlockService } from '../trustlock/trustlock.service'
import { njangiService } from '../njangi/njangi.service'
import { splitchatService } from '../splitchat/splitchat.service'
import { paydayService } from '../payday/payday.service'
import { safipayService } from '../safipay/safipay.service'
import { kobokallService } from '../kobokall/kobokall.service'
import { sendTextMessage } from '../whatsapp/whatsapp.service'
import { Group } from '../njangi/group.schema'

export async function handleMomotrustMessage(
  feature: string,
  contextId: string,
  phone: string,
  text: string,
): Promise<void> {
  // Njangi PAY requires PIN — launch flow instead of executing directly
  if (feature === 'NJANGI' && text.trim().toLowerCase() === 'pay') {
    const { FlowLauncherService } = await import('../flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone,
      'njangi_pay',
      contextId,
      'Confirm your Njangi contribution. Accept the USSD prompt after PIN verification.',
    )
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
  }
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
    const { FlowLauncherService } = await import('../flow/flow-launcher.service')
    await FlowLauncherService.launchPinConfirmFlow(
      phone,
      'splitchat_join',
      shortCode,
      `Pay ${(group as any).contributionAmount.toLocaleString()} XAF to join *${(group as any).name}*.`,
    )
  }
}
