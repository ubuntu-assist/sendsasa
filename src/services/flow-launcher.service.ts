import { FlowDataExchangeService } from './flow-data-exchange.service'
import { getAllBalances } from './xrpl.service'
import { WhatsAppService } from './whatsapp.service'
import { IUser } from '../types'

export class FlowLauncherService {
  static async launchSendMoneyFlow(user: IUser): Promise<void> {
    try {
      const balances = await getAllBalances(user.xrplAddress)

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
          header: {
            type: 'text',
            text: 'Send Money',
          },
          body: {
            text: 'Send XRP, RLUSD, or USDC instantly to anyone',
          },
          footer: {
            text: 'Secure & Fast',
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: '1604059694187893',
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
          header: {
            type: 'text',
            text: 'Request Money',
          },
          body: {
            text: 'Request XRP, RLUSD, or USDC from anyone',
          },
          footer: {
            text: 'Quick & Easy',
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: '799973406499088',
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
          header: {
            type: 'text',
            text: 'Secure Your Account',
          },
          body: {
            text: 'Create your transaction PIN and set up security questions to protect your wallet',
          },
          footer: {
            text: 'This will only take a minute',
          },
          action: {
            name: 'flow',
            parameters: {
              flow_message_version: '3',
              flow_token: flowToken,
              flow_id: '978803041536597',
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
}
