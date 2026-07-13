export interface WhatsAppMessage {
  from: string
  id: string
  timestamp: string
  text: {
    body: string
  }
  type: 'text' | 'button' | 'interactive'
}

export interface WhatsAppWebhookPayload {
  object: string
  entry: Array<{
    id: string
    changes: Array<{
      value: {
        messaging_product: string
        metadata: {
          display_phone_number: string
          phone_number_id: string
        }
        contacts?: Array<{
          profile: {
            name: string
          }
          wa_id: string
        }>
        messages?: WhatsAppMessage[]
        statuses?: Array<{
          id: string
          status: string
          timestamp: string
          recipient_id: string
        }>
      }
      field: string
    }>
  }>
}

export interface WhatsAppTextMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'text'
  text: {
    preview_url: boolean
    body: string
  }
}

export interface WhatsAppInteractiveMessage {
  messaging_product: 'whatsapp'
  recipient_type: 'individual'
  to: string
  type: 'interactive'
  interactive: {
    type: 'button'
    body: {
      text: string
    }
    action: {
      buttons: Array<{
        type: 'reply'
        reply: {
          id: string
          title: string
        }
      }>
    }
  }
}

export interface InteractiveMessage {
  type: 'interactive'
  from: string
  id: string
  timestamp: string
  interactive: {
    type: string
    button_reply?: {
      id: string
      title: string
    }
  }
}

export interface ButtonMessage {
  type: 'button'
  from: string
  id: string
  timestamp: string
  button: {
    payload: string
    text: string
  }
}
