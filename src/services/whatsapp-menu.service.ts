import axios from 'axios'
import { AppError } from '../middleware/error-handler'
import config from '../utils/config'

const WHATSAPP_API_URL = config.WHATSAPP_API_URL!
const PHONE_NUMBER_ID = config.PHONE_NUMBER_ID!
const ACCESS_TOKEN = config.ACCESS_TOKEN!

export async function sendWelcomeMessage(
  to: string,
  userName?: string,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const greeting = userName
    ? `Welcome to SendSasa, ${userName}! 👋`
    : 'Welcome to SendSasa! 👋'

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `${greeting}\n\nSendSasa lets you send and receive XRP instantly via WhatsApp.\n\nGet started to create your secure XRP wallet.`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'get_started',
              title: '🚀 Get Started',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Welcome message sent to ${to}`)
  } catch (error) {
    console.error('Error sending welcome message:', error)
    throw new AppError('Failed to send welcome message', 503)
  }
}

export async function sendMainMenu(
  to: string,
  balance?: string,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const balanceText = balance ? `\n\nBalance: ${balance} XRP` : ''

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Welcome back! 👋${balanceText}\n\nWhat would you like to do?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'send_money',
              title: 'Send Money',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'request_money',
              title: 'Request Money',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'my_wallet',
              title: 'My Wallet',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Main menu sent to ${to}`)
  } catch (error) {
    console.error('Error sending main menu:', error)
    throw new AppError('Failed to send main menu', 503)
  }
}

export async function sendWalletMenu(to: string): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: 'Your Wallet\n\nWhat would you like to see?',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'transaction_history',
              title: 'History',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'pending_requests',
              title: 'Requests',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'main_menu',
              title: 'Main Menu',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Wallet menu sent to ${to}`)
  } catch (error) {
    console.error('Error sending wallet menu:', error)
    throw new AppError('Failed to send wallet menu', 503)
  }
}

export async function sendBackToMenuButton(
  to: string,
  message: string,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: message,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'main_menu',
              title: 'Main Menu',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Back to menu button sent to ${to}`)
  } catch (error) {
    console.error('Error sending back button:', error)
    throw new AppError('Failed to send back button', 503)
  }
}

export async function sendAmountSelectionMenu(to: string): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: 'How much XRP do you want to send?',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'amount_10',
              title: '10 XRP',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'amount_50',
              title: '50 XRP',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'amount_100',
              title: '100 XRP',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Amount selection menu sent to ${to}`)
  } catch (error) {
    console.error('Error sending amount menu:', error)
    throw new AppError('Failed to send amount menu', 503)
  }
}

export async function sendRecipientTypeMenu(
  to: string,
  amount: number,
): Promise<void> {
  const url = `${WHATSAPP_API_URL}/${PHONE_NUMBER_ID}/messages`

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `Who do you want to send ${amount} XRP to?`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: `recipient_phone_${amount}`,
              title: 'Phone Number',
            },
          },
          {
            type: 'reply',
            reply: {
              id: `recipient_address_${amount}`,
              title: 'XRP Address',
            },
          },
          {
            type: 'reply',
            reply: {
              id: 'main_menu',
              title: 'Cancel',
            },
          },
        ],
      },
    },
  }

  try {
    await axios.post(url, payload, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${ACCESS_TOKEN}`,
      },
      timeout: 10000,
    })

    console.log(`Recipient type menu sent to ${to}`)
  } catch (error) {
    console.error('Error sending recipient menu:', error)
    throw new AppError('Failed to send recipient menu', 503)
  }
}
