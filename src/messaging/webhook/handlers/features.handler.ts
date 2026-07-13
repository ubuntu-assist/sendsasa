import { trustlockService } from '@features/trustlock/trustlock.service'
import { njangiService } from '@features/njangi/njangi.service'
import { splitchatService } from '@features/splitchat/splitchat.service'
import { paydayService } from '@features/payday/payday.service'
import { kobokallService } from '@features/kobokall/kobokall.service'

export async function handlePinConfirmedAction(
  phoneNumber: string,
  action: string,
  resourceId: string,
): Promise<void> {
  switch (action) {
    case 'kobokall_confirm':
      await kobokallService.confirmTransfer(resourceId, phoneNumber)
      break
    case 'trustlock_pay':
      await trustlockService.initiatePayment(resourceId, phoneNumber)
      break
    case 'trustlock_confirm':
      await trustlockService.confirmDelivery(resourceId, phoneNumber)
      break
    case 'payday_approve':
      await paydayService.approvePayroll(resourceId, phoneNumber)
      break
    case 'njangi_pay':
      await njangiService.collectContribution(resourceId, phoneNumber)
      break
    case 'splitchat_join':
      await splitchatService.joinPot(phoneNumber, resourceId)
      break
  }
}
