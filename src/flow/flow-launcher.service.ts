import { Injectable } from '@nestjs/common'
import { FlowDataExchangeService } from './flow-data-exchange.service'
import { getAllBalances } from '../chains/xrpl.service'
import { evmService } from '../chains/evm.service'
import { getAllBalances as getSolanaBalances } from '../chains/solana.service'
import { WhatsAppService } from '../whatsapp/whatsapp.service'
import { IUser } from '../types'

import config from '../utils/config'
const OFFRAMP_FLOW_ID = config.OFFRAMP_FLOW_ID
const CARD_PAYMENT_FLOW_ID = config.CARD_PAYMENT_FLOW_ID
const REQUEST_MONEY_FLOW_ID = config.REQUEST_MONEY_FLOW_ID
const REQUEST_CARD_FLOW_ID = config.REQUEST_CARD_FLOW_ID
const SEND_MONEY_FLOW_ID = config.SEND_MONEY_FLOW_ID
const PIN_SETUP_FLOW_ID = config.PIN_SETUP_FLOW_ID
const MANAGE_CONTACTS_FLOW_ID = config.MANAGE_CONTACTS_FLOW_ID
const PIN_CONFIRM_FLOW_ID = config.FLOW_ID_PIN_CONFIRM

@Injectable()
export class FlowLauncherService {
  static async launchSendMoneyFlow(user: IUser): Promise<void> {
    try {
      const xrplAddress = user.xrpl_address
      const evmAddress: string | undefined = (user as any).evm_address
      const solanaAddress: string | undefined = (user as any).solana_address

      const safe = (fn: () => Promise<string>) => fn().catch(() => '0')

      const [xrplBals, bnb, bscUsdt, bscUsdc, solanaBals] = await Promise.all([
        getAllBalances(xrplAddress),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc'))
          : Promise.resolve('0'),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDT'))
          : Promise.resolve('0'),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDC'))
          : Promise.resolve('0'),
        solanaAddress
          ? getSolanaBalances(solanaAddress).catch(() => ({
              sol: '0',
              usdc: '0',
              usdt: '0',
              eurc: '0',
            }))
          : Promise.resolve({ sol: '0', usdc: '0', usdt: '0', eurc: '0' }),
      ])

      const xrpl_balances = `XRP: ${xrplBals.xrp} · RLUSD: ${xrplBals.rlusd} · USDC: ${xrplBals.usdc}`
      const bsc_balances = `BNB: ${bnb} · USDT: ${bscUsdt} · USDC: ${bscUsdc}`
      const solana_balances = `SOL: ${solanaBals.sol} · USDC: ${solanaBals.usdc} · USDT: ${solanaBals.usdt} · EURC: ${solanaBals.eurc}`

      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: '💸 Send Money' },
          body: { text: 'Send crypto instantly to anyone on any chain' },
          footer: { text: 'Secure & Fast' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: SEND_MONEY_FLOW_ID,
              flow_cta: 'Continue',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'SEND_MONEY_DETAILS',
                data: {
                  xrpl_balances,
                  bsc_balances,
                  solana_balances,
                  available_balance: 'Select a currency',
                },
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Send Money flow:', error)
      throw error
    }
  }

  static async launchRequestMoneyFlow(user: IUser): Promise<void> {
    try {
      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: '📥 Request Crypto' },
          body: { text: 'Request crypto from anyone on any chain' },
          footer: { text: 'Quick & Easy' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: REQUEST_MONEY_FLOW_ID,
              flow_cta: 'Continue',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'REQUEST_MONEY_DETAILS',
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Request Money flow:', error)
      throw error
    }
  }

  static async launchRequestCardFlow(user: IUser): Promise<void> {
    if (!REQUEST_CARD_FLOW_ID) {
      throw new Error(
        'REQUEST_CARD_FLOW_ID is not configured. Set it in your environment variables.',
      )
    }
    try {
      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: '💳 Request by Card' },
          body: {
            text: 'Get paid via debit card, Apple Pay or Google Pay. A secure link will be sent to you to share.',
          },
          footer: { text: 'Powered by Coinbase' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: REQUEST_CARD_FLOW_ID,
              flow_cta: 'Continue',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'REQUEST_CARD_DETAILS',
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Request Card flow:', error)
      throw error
    }
  }

  static async launchPinConfirmFlow(
    phone: string,
    action: string,
    resourceId: string,
    description: string,
  ): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(phone)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '🔐 PIN Required' },
        body: { text: description },
        footer: { text: 'Your PIN is masked and never visible in chat.' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: PIN_CONFIRM_FLOW_ID,
            flow_cta: 'Enter PIN',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: {
              screen: 'PIN_CONFIRM',
              data: {
                pin_confirmed_action: action,
                pin_confirmed_resource_id: resourceId,
                description,
                error_transaction_pin: '',
              },
            },
          },
        },
      },
    })
  }

  /**
   * Launch PIN Setup Flow (for onboarding)
   */
  static async launchPinSetupFlow(user: IUser): Promise<void> {
    try {
      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: 'Secure Your Account' },
          body: {
            text: 'Create your transaction PIN and set up security questions to protect your wallet',
          },
          footer: { text: 'This will only take a minute' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: PIN_SETUP_FLOW_ID,
              flow_cta: 'Get Started',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'PIN_SETUP',
                data: { error_pin: '', error_confirm_pin: '' },
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch PIN Setup flow:', error)
      throw error
    }
  }

  static async launchOffRampFlow(user: IUser): Promise<void> {
    try {
      const evmAddress: string | undefined = (user as any).evm_address
      const solanaAddress: string | undefined = (user as any).solana_address

      const safe = (fn: () => Promise<string>) => fn().catch(() => '0')

      const [xrplBals, bnb, bscUsdt, bscUsdc, solanaBals] = await Promise.all([
        getAllBalances(user.xrpl_address),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc'))
          : Promise.resolve('0'),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDT'))
          : Promise.resolve('0'),
        evmAddress
          ? safe(() => evmService.getBalance(evmAddress, 'bsc', 'USDC'))
          : Promise.resolve('0'),
        solanaAddress
          ? getSolanaBalances(solanaAddress).catch(() => ({
              sol: '0',
              usdc: '0',
              usdt: '0',
              eurc: '0',
            }))
          : Promise.resolve({ sol: '0', usdc: '0', usdt: '0', eurc: '0' }),
      ])

      const xrpl_balances = `XRP: ${xrplBals.xrp} · RLUSD: ${xrplBals.rlusd} · USDC: ${xrplBals.usdc}`
      const bsc_balances = `BNB: ${bnb} · USDT: ${bscUsdt} · USDC: ${bscUsdc}`
      const solana_balances = `SOL: ${solanaBals.sol} · USDC: ${solanaBals.usdc} · USDT: ${solanaBals.usdt} · EURC: ${solanaBals.eurc}`

      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: '💵 Cash Out' },
          body: { text: 'Send crypto to MTN MoMo, Orange Money or UBA M2U' },
          footer: { text: 'Powered by SendSasa' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: OFFRAMP_FLOW_ID,
              flow_cta: 'Continue',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'OFFRAMP_DETAILS',
                data: { xrpl_balances, bsc_balances, solana_balances },
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Off-Ramp flow:', error)
      throw error
    }
  }

  static async launchCardPaymentFlow(
    user: IUser,
    paymentType: 'hosted' | 'headless',
  ): Promise<void> {
    if (!CARD_PAYMENT_FLOW_ID) {
      throw new Error(
        'CARD_PAYMENT_FLOW_ID is not configured. Set it in your environment variables.',
      )
    }
    try {
      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const header =
        paymentType === 'headless'
          ? '📱 Apple / Google Pay'
          : '💳 Pay with Card'
      const bodyText =
        paymentType === 'headless'
          ? 'Pay with Apple Pay or Google Pay. A secure payment page will be sent to you via WhatsApp.'
          : 'Pay with any debit card. No crypto wallet needed.'

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: header },
          body: { text: bodyText },
          footer: { text: 'Powered by Coinbase' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: CARD_PAYMENT_FLOW_ID,
              flow_cta: 'Continue',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'CARD_PAYMENT_DETAILS',
                data: {
                  payment_type: paymentType,
                  is_headless: paymentType === 'headless',
                },
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Card Payment flow:', error)
      throw error
    }
  }

  static async launchManageContactsFlow(user: IUser): Promise<void> {
    if (!MANAGE_CONTACTS_FLOW_ID) {
      throw new Error(
        'MANAGE_CONTACTS_FLOW_ID is not configured. Set it in your environment variables.',
      )
    }
    try {
      const beneficiaries = (user as any).beneficiaries ?? []
      const contactsText =
        beneficiaries.length > 0
          ? beneficiaries
              .map(
                (b: any, i: number) =>
                  `${i + 1}. ${b.nickname} (${b.phoneNumber})`,
              )
              .join('\n')
          : 'No contacts saved yet.\nAdd your first contact below!'

      const flowToken = FlowDataExchangeService.generateFlowToken(
        user.whatsappId,
      )

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: user.whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: '👥 My Contacts' },
          body: {
            text: 'Add and manage your saved contacts for quick payments',
          },
          footer: { text: 'SendSasa Contacts' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: MANAGE_CONTACTS_FLOW_ID,
              flow_cta: 'Manage Contacts',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'BENEFICIARY_LIST',
                data: { contacts_text: contactsText },
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Manage Contacts flow:', error)
      throw error
    }
  }

  static async launchImportWalletFlow(whatsappId: string): Promise<void> {
    try {
      const flowToken = FlowDataExchangeService.generateFlowToken(whatsappId)

      const flowMessage = {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: whatsappId,
        type: 'interactive',
        interactive: {
          type: 'flow',
          header: { type: 'text', text: 'Import Wallet' },
          body: {
            text: 'Import your existing XRPL wallet into SendSasa using your family seed.',
          },
          footer: { text: 'Your seed is encrypted immediately' },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: '1556152005476705',
              flow_cta: 'Import Wallet',
              mode: 'published',
              flow_action: 'navigate',
              flow_action_payload: {
                screen: 'IMPORT_WALLET_SEED',
              },
            },
          },
        },
      }

      await WhatsAppService.sendMessage(flowMessage)
    } catch (error) {
      console.error('Failed to launch Import Wallet flow:', error)
      throw error
    }
  }

  static async launchStatementFlow(user: IUser): Promise<void> {
    const flowToken = FlowDataExchangeService.generateFlowToken(user.whatsappId)
    await WhatsAppService.sendMessage({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: user.whatsappId,
      type: 'interactive',
      interactive: {
        type: 'flow',
        header: { type: 'text', text: '📄 Transaction Statement' },
        body: { text: 'Select a date range to receive a PDF of all your transactions.' },
        footer: { text: 'Powered by SendSasa' },
        action: {
          name: 'flow',
          parameters: {
            flow_message_version: '3',
            flow_token: flowToken,
            flow_id: config.FLOW_ID_STATEMENT,
            flow_cta: 'Select Dates',
            mode: 'published',
            flow_action: 'navigate',
            flow_action_payload: { screen: 'STATEMENT_DATES' },
          },
        },
      },
    })
  }

  launchSendMoneyFlow(user: IUser) {
    return FlowLauncherService.launchSendMoneyFlow(user)
  }
  launchRequestMoneyFlow(user: IUser) {
    return FlowLauncherService.launchRequestMoneyFlow(user)
  }
  launchRequestCardFlow(user: IUser) {
    return FlowLauncherService.launchRequestCardFlow(user)
  }
  launchPinSetupFlow(user: IUser) {
    return FlowLauncherService.launchPinSetupFlow(user)
  }
  launchOffRampFlow(user: IUser) {
    return FlowLauncherService.launchOffRampFlow(user)
  }
  launchCardPaymentFlow(user: IUser, paymentType: 'hosted' | 'headless') {
    return FlowLauncherService.launchCardPaymentFlow(user, paymentType)
  }
  launchManageContactsFlow(user: IUser) {
    return FlowLauncherService.launchManageContactsFlow(user)
  }
  launchImportWalletFlow(whatsappId: string) {
    return FlowLauncherService.launchImportWalletFlow(whatsappId)
  }
  launchStatementFlow(user: IUser) {
    return FlowLauncherService.launchStatementFlow(user)
  }
}
