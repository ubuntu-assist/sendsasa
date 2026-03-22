import { FlowDataExchangeService } from './flow-data-exchange.service'
import { getAllBalances } from './xrpl.service'
import { WhatsAppService } from './whatsapp.service'
import { IUser } from '../types'

/**
 * Flow Launcher Service
 *
 * Handles launching WhatsApp Flows with proper tokens and initial data.
 * Flows are configured in WhatsApp Business Manager with data exchange endpoints.
 */

export class FlowLauncherService {
  /**
   * Launch Send Money Flow
   */
  static async launchSendMoneyFlow(user: IUser): Promise<void> {
    try {
      console.log(`🚀 Launching Send Money flow for user ${user.whatsappId}`)

      // Get real-time balances from XRPL
      const balances = await getAllBalances(user.xrplAddress)

      // Generate flow token for authentication
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
            text: '💸 Send Money',
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
      console.log('✅ Send Money flow launched successfully')
    } catch (error) {
      console.error('Failed to launch Send Money flow:', error)
      throw error
    }
  }

  /**
   * Launch Request Money Flow
   */
  static async launchRequestMoneyFlow(user: IUser): Promise<void> {
    try {
      console.log(`🚀 Launching Request Money flow for user ${user.whatsappId}`)

      // Generate flow token for authentication
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
            text: '💰 Request Money',
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
      console.log('✅ Request Money flow launched successfully')
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
      console.log(`🚀 Launching PIN Setup flow for user ${user.whatsappId}`)

      // Generate flow token for authentication
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
            text: '🔐 Secure Your Account',
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
      console.log('✅ PIN Setup flow launched successfully')
    } catch (error) {
      console.error('Failed to launch PIN Setup flow:', error)
      throw error
    }
  }
}
