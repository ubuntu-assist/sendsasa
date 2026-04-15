import { FlowDataExchangeService } from './flow-data-exchange.service'
import { getAllBalances } from './xrpl.service'
import { WhatsAppService } from './whatsapp.service'
import { IUser } from '../types'

import config from '../utils/config'
const OFFRAMP_FLOW_ID = config.OFFRAMP_FLOW_ID
const CARD_PAYMENT_FLOW_ID = config.CARD_PAYMENT_FLOW_ID
const REQUEST_MONEY_FLOW_ID = config.REQUEST_MONEY_FLOW_ID
const SEND_MONEY_FLOW_ID = config.SEND_MONEY_FLOW_ID
const PIN_SETUP_FLOW_ID = config.PIN_SETUP_FLOW_ID

export class FlowLauncherService {
  static async launchSendMoneyFlow(user: IUser): Promise<void> {
    try {
      const xrplAddress = (user as any).xrpl_address || user.xrplAddress
      const balances = await getAllBalances(xrplAddress)
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
          body: { text: 'Send XRP, RLUSD, or USDC instantly to anyone' },
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
                  available_balance_xrp: balances.xrp,
                  available_balance_rlusd: balances.rlusd,
                  available_balance_usdc: balances.usdc,
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
          header: { type: 'text', text: 'Request Money' },
          body: { text: 'Request XRP, RLUSD, or USDC from anyone' },
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
      const xrplAddress = (user as any).xrpl_address || user.xrplAddress
      const balances = await getAllBalances(xrplAddress)
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
                data: {
                  available_balance_xrp: balances.xrp,
                  available_balance_rlusd: balances.rlusd,
                  available_balance_usdc: balances.usdc,
                },
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

  static async launchCardPaymentFlow(user: IUser): Promise<void> {
    if (!CARD_PAYMENT_FLOW_ID) {
      throw new Error('CARD_PAYMENT_FLOW_ID is not configured. Set it in your environment variables.')
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
          header: { type: 'text', text: '💳 Pay with Card' },
          body: {
            text: 'Send money to Africa using your debit card, Apple Pay, or Google Pay. No crypto wallet needed.',
          },
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
}
