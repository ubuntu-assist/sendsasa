// src/services/flow-manager-WITH-PIN-SETUP.service.ts

/**
 * User conversation flow state management
 * Tracks where the user is in multi-step conversations
 */

interface TempWalletData {
  address: string
  encryptedSeed: string
  username: string
  rlusdTrustLineCreated: boolean
  usdcTrustLineCreated: boolean
  rlusdTrustLineHash?: string
  usdcTrustLineHash?: string
}

interface UserFlowState {
  whatsappId: string
  currentFlow?: 'send_money' | 'request_money' | 'pin_setup' | null
  currentStep?: string
  flowData?: {
    // Multi-currency support
    currency?: 'XRP' | 'RLUSD' | 'USDC'

    // Send/Request money flow
    amount?: number
    recipientType?: 'phone' | 'address'
    recipient?: string
    message?: string

    // PIN setup flow
    tempWalletData?: TempWalletData
    pin?: string
    username?: string // WhatsApp username (optional)
  }
  timestamp: Date
}

class FlowManager {
  private userFlows: Map<string, UserFlowState> = new Map()

  /**
   * Start a new flow for a user
   */
  startFlow(
    whatsappId: string,
    flowType: 'send_money' | 'request_money' | 'pin_setup',
    initialStep: string = 'amount',
  ): void {
    this.userFlows.set(whatsappId, {
      whatsappId,
      currentFlow: flowType,
      currentStep: initialStep,
      flowData: {},
      timestamp: new Date(),
    })

    // Auto-expire after 10 minutes
    setTimeout(
      () => {
        this.clearFlow(whatsappId)
      },
      10 * 60 * 1000,
    )
  }

  /**
   * Update flow data
   */
  updateFlowData(
    whatsappId: string,
    data: Partial<UserFlowState['flowData']>,
  ): void {
    const flow = this.userFlows.get(whatsappId)
    if (flow) {
      flow.flowData = { ...flow.flowData, ...data }
      flow.timestamp = new Date()
    }
  }

  /**
   * Move to next step
   */
  setStep(whatsappId: string, step: string): void {
    const flow = this.userFlows.get(whatsappId)
    if (flow) {
      flow.currentStep = step
      flow.timestamp = new Date()
    }
  }

  /**
   * Get current flow state
   */
  getFlow(whatsappId: string): UserFlowState | undefined {
    return this.userFlows.get(whatsappId)
  }

  /**
   * Check if user is in a flow
   */
  isInFlow(whatsappId: string): boolean {
    const flow = this.userFlows.get(whatsappId)
    return flow !== undefined && flow.currentFlow !== null
  }

  /**
   * Get current flow type
   */
  getCurrentFlow(
    whatsappId: string,
  ): 'send_money' | 'request_money' | 'pin_setup' | null {
    const flow = this.userFlows.get(whatsappId)
    return flow?.currentFlow || null
  }

  /**
   * Get current step
   */
  getCurrentStep(whatsappId: string): string | undefined {
    const flow = this.userFlows.get(whatsappId)
    return flow?.currentStep
  }

  /**
   * Get flow data
   */
  getFlowData(whatsappId: string): UserFlowState['flowData'] | undefined {
    const flow = this.userFlows.get(whatsappId)
    return flow?.flowData
  }

  /**
   * Clear flow
   */
  clearFlow(whatsappId: string): void {
    this.userFlows.delete(whatsappId)
  }

  /**
   * Clear all expired flows (older than 10 minutes)
   */
  clearExpiredFlows(): void {
    const now = new Date()
    const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000)

    for (const [whatsappId, flow] of this.userFlows.entries()) {
      if (flow.timestamp < tenMinutesAgo) {
        this.userFlows.delete(whatsappId)
      }
    }
  }
}

export const flowManager = new FlowManager()

// Clear expired flows every 5 minutes
setInterval(
  () => {
    flowManager.clearExpiredFlows()
  },
  5 * 60 * 1000,
)
