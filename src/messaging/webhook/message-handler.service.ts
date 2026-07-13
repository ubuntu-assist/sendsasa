import { Injectable } from '@nestjs/common'
import { parseUserContext } from '@app/types'
import { User } from '@models/User'
import { FlowLauncherService } from '@messaging/flow/flow-launcher.service'
import {
  sendTextMessage,
  sendSupportContact,
} from '@messaging/whatsapp/whatsapp.service'
import {
  sendWelcomeMessage,
  sendMainMenu,
  sendFundingMessage,
  sendRequestTypeButtons,
  sendMoneySection,
  sendAccountSection,
  sendMomotrustSection,
  sendSellCryptoAssetMenu,
} from '@messaging/whatsapp/whatsapp-menu.service'
import { isAccountActivated } from '@blockchain/chains/xrpl.service'
import { parseButtonInteraction } from '@messaging/whatsapp/message-parser.service'
import { handleMomotrustMessage, tryJoinGroup } from './momotrust-router'
import { trustlockService } from '@features/trustlock/trustlock.service'
import { TrustLockFlowService } from '@features/trustlock/trustlock-flow.service'
import { NjangiFlowService } from '@features/njangi/njangi-flow.service'
import { SplitChatFlowService } from '@features/splitchat/splitchat-flow.service'
import { PayDayFlowService } from '@features/payday/payday-flow.service'
import { SafiPayFlowService } from '@features/safipay/safipay-flow.service'
import { njangiService } from '@features/njangi/njangi.service'
import { splitchatService } from '@features/splitchat/splitchat.service'
import { paydayService } from '@features/payday/payday.service'
import { safipayService } from '@features/safipay/safipay.service'
import { KoboKallFlowService } from '@features/kobokall/kobokall-flow.service'
import { kobokallService } from '@features/kobokall/kobokall.service'
import { generateAndSendStatement } from '@shared/statement-generator.service'

// ── Domain handler imports ────────────────────────────────────────────────────
import {
  handleGetStarted,
  handleImportWallet,
  handleWalletImportComplete,
  handleCheckActivation,
  handleForgotPin,
  handlePinRecoveryAnswer,
  handlePinSetupComplete,
} from './handlers/auth.handler'
import {
  handleBuyCrypto,
  handleSellCryptoConfirm,
  handleCryptoSwapComplete,
} from './handlers/crypto.handler'
import {
  handleSendMoney,
  handleSendMoneyComplete,
  handleRequestMoneyComplete,
  handleRequestCrypto,
  handleRequestByCard,
} from './handlers/transfer.handler'
import {
  handleMyWallet,
  handleTransactionHistory,
  handlePendingRequests,
  handleApproveRequest,
  handleRejectRequest,
  handleMyContacts,
  handleSaveContact,
} from './handlers/account.handler'
import {
  handleOffRamp,
  handleLaunchCardPaymentFlow,
  handleOffRampComplete,
} from './handlers/offramp.handler'
import { handlePinConfirmedAction } from './handlers/features.handler'

// ── Entry points ──────────────────────────────────────────────────────────────

export async function handleMessage(
  whatsappId: string,
  phoneNumber: string,
  profileName?: string,
  messageText?: string,
): Promise<void> {
  try {
    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber, profileName || 'there')
      return
    }

    // PIN recovery — intercept before anything else
    if (
      user.pendingPinRecovery &&
      user.pendingPinRecovery.expiresAt > new Date()
    ) {
      await handlePinRecoveryAnswer(phoneNumber, user, messageText ?? '')
      return
    }

    // Block all features until PIN setup is complete
    if (user.pinSetupComplete === false) {
      await FlowLauncherService.launchPinSetupFlow(user)
      return
    }

    // Route messages to active MoMo Trust feature session
    const ctx = parseUserContext((user as any).momotrustContext)
    if (ctx && (user as any).momotrustContextUpdatedAt) {
      const ageMs =
        Date.now() - (user as any).momotrustContextUpdatedAt.getTime()
      if (ageMs < 30 * 60_000) {
        await handleMomotrustMessage(ctx, phoneNumber, messageText ?? '')
        return
      }
      ;(user as any).momotrustContext = undefined
      ;(user as any).momotrustContextUpdatedAt = undefined
      await user.save()
    }

    const normalizedText = messageText?.trim().toLowerCase() ?? ''
    if (normalizedText === 'forgot pin' || normalizedText === 'reset pin') {
      await handleForgotPin(phoneNumber, user)
      return
    }

    if (
      ['rates', 'rate', 'compare', 'exchange rate'].includes(normalizedText)
    ) {
      const { formatRatesMessage } = await import('@shared/rates.service')
      await sendTextMessage(phoneNumber, await formatRatesMessage())
      return
    }

    const joinMatch = normalizedText.match(
      /^(?:join|rejoindre)\s+([a-f0-9]{6})$/i,
    )
    if (joinMatch) {
      await tryJoinGroup(phoneNumber, joinMatch[1].toUpperCase())
      return
    }

    // "buy", "buy 100", "buy usdc", "buy crypto"
    if (/^buy(\s+\d+(\.\d+)?)?(\s+\w+)?$/.test(normalizedText)) {
      await handleBuyCrypto(phoneNumber, user, normalizedText)
      return
    }

    // If account was created on mainnet but never funded, remind user to fund it
    if (
      user.xrpl_address &&
      !user.rlusdTrustLineCreated &&
      !user.usdcTrustLineCreated
    ) {
      const activated = await isAccountActivated(user.xrpl_address)
      if (!activated) {
        await sendFundingMessage(phoneNumber, user.xrpl_address)
        return
      }
    }

    await sendMainMenu(phoneNumber, user.username)
  } catch (error) {
    console.error('❌ Error handling message:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

export async function handleInteraction(
  whatsappId: string,
  phoneNumber: string,
  interactionId: string,
  profileName?: string,
): Promise<void> {
  try {
    console.log(`🔘 Interaction: ${interactionId} by ${whatsappId}`)

    const interaction = parseButtonInteraction(interactionId)

    // These actions don't require an existing user record
    if (interaction.action === 'get_started') {
      await handleGetStarted(whatsappId, phoneNumber, profileName)
      return
    }

    if (interaction.action === 'import_wallet') {
      await handleImportWallet(whatsappId, phoneNumber)
      return
    }

    if (interaction.action === 'check_activation') {
      await handleCheckActivation(whatsappId, phoneNumber)
      return
    }

    const user = await User.findOne({ whatsappId })

    if (!user) {
      await sendWelcomeMessage(phoneNumber, profileName)
      return
    }

    // Block all interactions until PIN setup is complete
    if (user.pinSetupComplete === false) {
      await FlowLauncherService.launchPinSetupFlow(user)
      return
    }

    switch (interaction.action) {
      case 'main_menu':
        await sendMainMenu(phoneNumber, user.username)
        break

      case 'section_money':
        await sendMoneySection(phoneNumber)
        break

      case 'section_account':
        await sendAccountSection(phoneNumber)
        break

      case 'section_momotrust':
        await sendMomotrustSection(phoneNumber)
        break

      case 'buy_crypto':
        await handleBuyCrypto(phoneNumber, user, '')
        break

      case 'swap_crypto':
        await FlowLauncherService.launchCryptoSwapFlow(user)
        break

      case 'sell_crypto':
        await sendSellCryptoAssetMenu(phoneNumber)
        break

      case 'send_money':
      case 'send_crypto':
        await handleSendMoney(whatsappId, phoneNumber)
        break

      case 'offramp_money':
        await handleOffRamp(whatsappId, phoneNumber, user)
        break

      case 'card_pay_hosted':
        await handleLaunchCardPaymentFlow(phoneNumber, user, 'hosted')
        break

      case 'card_pay_headless':
        await handleLaunchCardPaymentFlow(phoneNumber, user, 'headless')
        break

      case 'request_money':
        await sendRequestTypeButtons(phoneNumber)
        break

      case 'request_crypto':
        await handleRequestCrypto(whatsappId, phoneNumber)
        break

      case 'request_card':
        await handleRequestByCard(whatsappId, phoneNumber)
        break

      case 'my_wallet':
        await handleMyWallet(phoneNumber, user)
        break

      case 'my_contacts':
        await handleMyContacts(phoneNumber, user)
        break

      case 'save_contact':
        if (interaction.phone) {
          await handleSaveContact(phoneNumber, user, interaction.phone)
        }
        break

      case 'transaction_history':
        await handleTransactionHistory(whatsappId, phoneNumber)
        break

      case 'pending_requests':
        await handlePendingRequests(whatsappId, phoneNumber)
        break

      case 'approve':
        if (interaction.requestId) {
          await handleApproveRequest(phoneNumber, user, interaction.requestId)
        }
        break

      case 'reject':
        if (interaction.requestId) {
          await handleRejectRequest(phoneNumber, interaction.requestId)
        }
        break

      case 'trustlock':
        await TrustLockFlowService.launchTrustLockCreateFlow(user)
        break
      case 'njangi':
        await NjangiFlowService.launchNjangiCreateFlow(user)
        break
      case 'splitchat':
        await SplitChatFlowService.launchSplitChatCreateFlow(user)
        break
      case 'payday':
        await PayDayFlowService.launchPayDayCreateFlow(user)
        break
      case 'safipay':
        await SafiPayFlowService.launchSafiPayCreateFlow(user)
        break
      case 'statement':
        await FlowLauncherService.launchStatementFlow(user)
        break
      case 'contact_support':
        await sendSupportContact(phoneNumber)
        break
      case 'kobokall':
        await KoboKallFlowService.sendKoboKallFlow(whatsappId)
        break
      case 'kobokall_confirm': {
        const transferId = interaction.phone
        if (transferId)
          await FlowLauncherService.launchPinConfirmFlow(
            whatsappId,
            'kobokall_confirm',
            transferId,
            'Confirm and send your MoMo transfer.',
          )
        break
      }
      case 'kobokall_cancel': {
        const transferId = interaction.phone
        if (transferId)
          await kobokallService.cancelTransfer(transferId, phoneNumber)
        break
      }
      case 'trustlock_pay': {
        const dealId = interaction.phone
        if (dealId)
          await FlowLauncherService.launchPinConfirmFlow(
            whatsappId,
            'trustlock_pay',
            dealId,
            'Pay and lock funds in escrow. You can release them once you confirm delivery.',
          )
        break
      }
      case 'trustlock_confirm': {
        const dealId = interaction.phone
        if (dealId)
          await FlowLauncherService.launchPinConfirmFlow(
            whatsappId,
            'trustlock_confirm',
            dealId,
            'Confirm delivery and release funds to the seller. This cannot be undone.',
          )
        break
      }
      case 'trustlock_dispute': {
        const dealId = interaction.phone
        if (dealId) await TrustLockFlowService.launchDisputeFlow(user, dealId)
        break
      }
      case 'trustlock_cancel':
        await sendTextMessage(
          phoneNumber,
          `ℹ️ Deal cancelled. No funds were charged.`,
        )
        break
      case 'payday_approve': {
        const payrollId = interaction.phone
        if (payrollId)
          await FlowLauncherService.launchPinConfirmFlow(
            whatsappId,
            'payday_approve',
            payrollId,
            'Approve this payroll and disburse payments to all employees.',
          )
        break
      }
      case 'njangi_pay': {
        const groupId = interaction.phone
        if (groupId)
          await FlowLauncherService.launchPinConfirmFlow(
            whatsappId,
            'njangi_pay',
            groupId,
            'Confirm your Njangi contribution. Accept the USSD prompt after PIN verification.',
          )
        break
      }
      case 'njangi_status': {
        const groupId = interaction.phone
        if (groupId) await njangiService.getLedger(groupId, phoneNumber)
        break
      }
      case 'njangi_start': {
        const groupId = interaction.phone
        if (groupId) await njangiService.startCycle(groupId)
        break
      }

      case 'sell_asset': {
        const asset = interaction.phone
        if (asset) {
          await User.updateOne(
            { whatsappId },
            {
              momotrustContext: JSON.stringify({ type: 'CRYPTO_SELL', asset }),
              momotrustContextUpdatedAt: new Date(),
            },
          )
          await sendTextMessage(
            phoneNumber,
            `💱 *Sell ${asset} → MoMo*\n\nHow much *${asset}* do you want to sell?\n\n_Reply with the amount (e.g. 50)_`,
          )
        }
        break
      }

      case 'sell_confirm': {
        // Format: sell_confirm:ASSET:AMOUNT:PROVIDER
        const payload = interaction.phone ?? ''
        const [asset, amountStr, provider] = payload.split(':')
        if (asset && amountStr && provider) {
          await handleSellCryptoConfirm(phoneNumber, asset, amountStr, provider)
        }
        break
      }

      default:
        await sendMainMenu(phoneNumber, user.username)
    }
  } catch (error) {
    console.error('❌ Error handling interaction:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ An error occurred. Please try again.',
    )
  }
}

export async function handleFlowResponse(
  whatsappId: string,
  phoneNumber: string,
  nfmReply: any,
): Promise<void> {
  try {
    const responseJson = JSON.parse(nfmReply.response_json)

    console.log('📋 Flow response received:', {
      whatsappId,
      response: responseJson,
    })

    const hasPinConfirmedAction =
      responseJson.pin_confirmed_action !== undefined &&
      responseJson.pin_confirmed_resource_id !== undefined

    const hasPinSetupData =
      responseJson.pin !== undefined &&
      responseJson.pin !== null &&
      responseJson.confirm_pin !== undefined &&
      responseJson.confirm_pin !== null

    const hasImportData =
      responseJson.seed !== undefined && responseJson.xrpl_address !== undefined

    const isSendMoney =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.currency !== undefined &&
      responseJson.amount !== undefined &&
      responseJson.recipient !== undefined &&
      responseJson.recipient_type !== undefined &&
      responseJson.total !== undefined

    const isRequestMoney =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.currency !== undefined &&
      responseJson.amount !== undefined &&
      responseJson.recipient !== undefined &&
      responseJson.recipient_type !== undefined &&
      responseJson.total === undefined

    const isOffRamp =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.mm_provider !== undefined &&
      responseJson.recipient_phone !== undefined &&
      responseJson.xaf_amount !== undefined

    const isCardPaymentDone =
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.total_usd_charged !== undefined &&
      responseJson.mm_provider_name !== undefined &&
      responseJson.recipient_phone !== undefined

    const isContactsUpdate =
      !hasPinSetupData &&
      !hasImportData &&
      Object.keys(responseJson).length === 0

    if (hasPinConfirmedAction) {
      await handlePinConfirmedAction(
        phoneNumber,
        responseJson.pin_confirmed_action,
        responseJson.pin_confirmed_resource_id,
      )
    } else if (hasPinSetupData) {
      await handlePinSetupComplete(whatsappId, phoneNumber, responseJson)
    } else if (hasImportData) {
      await handleWalletImportComplete(whatsappId, phoneNumber, responseJson)
    } else if (isOffRamp) {
      await handleOffRampComplete(whatsappId, phoneNumber, responseJson)
    } else if (isSendMoney) {
      await handleSendMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else if (isRequestMoney) {
      await handleRequestMoneyComplete(whatsappId, phoneNumber, responseJson)
    } else if (isCardPaymentDone) {
      if (responseJson.is_card_request === 'true') {
        await sendTextMessage(
          phoneNumber,
          `✅ *Payment request sent!*\n\n` +
            `A payment link has been sent to *${responseJson.payer_phone}* on WhatsApp.\n\n` +
            `Once they pay, *${responseJson.xaf_amount} XAF* will arrive in your ` +
            `${responseJson.mm_provider_name} account (${responseJson.recipient_phone}).`,
        )
      } else {
        await sendTextMessage(
          phoneNumber,
          `✅ *Payment link ready!*\n\n` +
            `Once your card payment is confirmed, *${responseJson.xaf_amount} XAF* will be sent to ` +
            `${responseJson.recipient_phone} via ${responseJson.mm_provider_name}.\n\n` +
            `You'll receive a confirmation message here when the payout is complete.`,
        )
      }
    } else if (isContactsUpdate) {
      await sendTextMessage(phoneNumber, '✅ Your contacts have been updated.')
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.seller_phone !== undefined &&
      responseJson.title !== undefined
    ) {
      await trustlockService.createDeal(phoneNumber, {
        title: responseJson.title,
        description: responseJson.description,
        category: responseJson.category,
        amount: Number(responseJson.amount),
        sellerPhone: responseJson.seller_phone,
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.deal_short_code !== undefined &&
      responseJson.reason !== undefined
    ) {
      const { Deal } = await import('@features/trustlock/deal.schema')
      const deal = await Deal.findOne({
        shortCode: responseJson.deal_short_code,
      })
      if (deal)
        await trustlockService.fileDispute(
          String((deal as any)._id),
          phoneNumber,
          responseJson,
        )
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.contribution_amount !== undefined &&
      responseJson.cycle_days !== undefined
    ) {
      await njangiService.createGroup(phoneNumber, {
        name: responseJson.name,
        contributionAmount: Number(responseJson.contribution_amount),
        cycleDurationDays: Number(responseJson.cycle_days),
        totalCycles: Number(responseJson.total_cycles),
        payoutOrder: responseJson.payout_order,
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.amount_per_person !== undefined
    ) {
      await splitchatService.createPot(phoneNumber, {
        name: responseJson.name,
        mode: responseJson.mode ?? 'ORGANIZER',
        amountPerPerson: Number(responseJson.amount_per_person),
        targetParticipants: Number(responseJson.target_participants),
        deadline: responseJson.deadline
          ? new Date(responseJson.deadline)
          : undefined,
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.payroll_name !== undefined
    ) {
      const items = JSON.parse(responseJson.parsed_items ?? '[]')
      await paydayService.createPayroll(phoneNumber, {
        name: responseJson.payroll_name,
        items,
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.client_phone !== undefined &&
      responseJson.due_date !== undefined &&
      responseJson.currency === undefined
    ) {
      await safipayService.createInvoice(phoneNumber, {
        clientPhone: responseJson.client_phone,
        clientName: responseJson.client_name,
        description: responseJson.description,
        total: Number(responseJson.total),
        dueDate: new Date(responseJson.due_date),
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.recipient_phone !== undefined &&
      responseJson.send_amount !== undefined
    ) {
      await kobokallService.initiateTransfer(phoneNumber, {
        recipientPhone: responseJson.recipient_phone,
        amount: Number(responseJson.send_amount),
      })
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.from_date !== undefined &&
      responseJson.to_date !== undefined
    ) {
      await generateAndSendStatement(
        phoneNumber,
        new Date(responseJson.from_date),
        new Date(responseJson.to_date),
      )
    } else if (
      !hasPinSetupData &&
      !hasImportData &&
      responseJson.swap_from_asset !== undefined &&
      responseJson.swap_order_id !== undefined
    ) {
      await handleCryptoSwapComplete(phoneNumber, responseJson)
    } else {
      console.log('⚠️ Unknown flow response format:', responseJson)
      await sendTextMessage(phoneNumber, '✅ Done!')
    }
  } catch (error) {
    console.error('❌ Error handling flow response:', error)
    await sendTextMessage(
      phoneNumber,
      '❌ Error processing flow. Please try again.',
    )
  }
}

@Injectable()
export class MessageHandlerService {
  handleMessage(
    whatsappId: string,
    phoneNumber: string,
    profileName?: string,
    messageText?: string,
  ) {
    return handleMessage(whatsappId, phoneNumber, profileName, messageText)
  }
  handleInteraction(
    whatsappId: string,
    phoneNumber: string,
    interactionId: string,
    profileName?: string,
  ) {
    return handleInteraction(
      whatsappId,
      phoneNumber,
      interactionId,
      profileName,
    )
  }
  handleFlowResponse(whatsappId: string, phoneNumber: string, nfmReply: any) {
    return handleFlowResponse(whatsappId, phoneNumber, nfmReply)
  }
}
