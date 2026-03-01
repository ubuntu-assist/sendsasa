interface UserFlowState {
  whatsappId: string
  currentFlow?: 'send_money' | 'request_money' | null
  currentStep?: string
  flowData?: {
    amount?: number
    recipientType?: 'phone' | 'address'
    recipient?: string
    message?: string
  }
  timestamp: Date
}

class FlowManager {
  private userFlows: Map<string, UserFlowState> = new Map()

  startFlow(
    whatsappId: string,
    flowType: 'send_money' | 'request_money',
    initialStep: string = 'amount',
  ): void {
    this.userFlows.set(whatsappId, {
      whatsappId,
      currentFlow: flowType,
      currentStep: initialStep,
      flowData: {},
      timestamp: new Date(),
    })

    setTimeout(
      () => {
        this.clearFlow(whatsappId)
      },
      10 * 60 * 1000,
    )
  }

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

  setStep(whatsappId: string, step: string): void {
    const flow = this.userFlows.get(whatsappId)
    if (flow) {
      flow.currentStep = step
      flow.timestamp = new Date()
    }
  }

  getFlow(whatsappId: string): UserFlowState | undefined {
    return this.userFlows.get(whatsappId)
  }

  isInFlow(whatsappId: string): boolean {
    const flow = this.userFlows.get(whatsappId)
    return flow !== undefined && flow.currentFlow !== null
  }

  getCurrentFlow(whatsappId: string): 'send_money' | 'request_money' | null {
    const flow = this.userFlows.get(whatsappId)
    return flow?.currentFlow || null
  }

  getCurrentStep(whatsappId: string): string | undefined {
    const flow = this.userFlows.get(whatsappId)
    return flow?.currentStep
  }

  getFlowData(whatsappId: string): UserFlowState['flowData'] | undefined {
    const flow = this.userFlows.get(whatsappId)
    return flow?.flowData
  }

  clearFlow(whatsappId: string): void {
    this.userFlows.delete(whatsappId)
  }

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

setInterval(
  () => {
    flowManager.clearExpiredFlows()
  },
  5 * 60 * 1000,
)
