import { Injectable } from '@nestjs/common'
import { WhatsAppService } from './whatsapp.service'
import config from '../utils/config'

export interface MenuBalances {
  xrp: string
  rlusd: string
  usdc: string
  bnb: string
  bscUsdt: string
  bscUsdc: string
  sol: string
  solUsdc: string
  solUsdt: string
  solEurc: string
}

export async function sendMainMenu(
  to: string,
  username: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'SendSasa Wallet' },
      body: {
        text: `*${username}*\n\nWhat would you like to do?`,
      },
      footer: { text: 'Powered by PawaPay' },
      action: {
        button: 'Menu',
        sections: [
          {
            title: 'Navigate',
            rows: [
              {
                id: 'section_money',
                title: '💸 Money & Transfers',
                description: 'Send, receive, buy or cash out',
              },
              {
                id: 'section_account',
                title: '👤 My Account',
                description: 'Wallet, contacts & history',
              },
              {
                id: 'section_momotrust',
                title: '🏦 MoMo Trust',
                description: 'Escrow, savings, payroll & more',
              },
            ],
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendWelcomeMessage(
  to: string,
  userName?: string,
): Promise<void> {
  const greeting = userName
    ? `Welcome to SendSasa, ${userName}! 👋`
    : 'Welcome to SendSasa! 👋'

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      header: {
        type: 'video',
        video: { id: config.WELCOME_VIDEO_ID },
      },
      body: {
        text:
          `*${greeting}*\n\n` +
          `Send money home faster than saying "I love you".\n\n` +
          `· · · · · · · · · ·\n` +
          `_Lands in MTN MoMo, M-Pesa or Orange Money in under 60 seconds · Under 1% fee_`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'get_started', title: 'Get Started 🚀' },
          },
          // {
          //   type: 'reply',
          //   reply: { id: 'import_wallet', title: 'Import Wallet 📥' },
          // },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendFundingMessage(
  to: string,
  xrplAddress: string,
): Promise<void> {
  // Address alone so the user can tap to copy it
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'text',
    text: { preview_url: false, body: xrplAddress },
  })

  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          `*Your wallet has been created!*\n\n` +
          `To activate it, send at least *1 XRP* to the address above.\n\n` +
          `· · · · · · · · · ·\n` +
          `_You can buy XRP on Binance, Coinbase or Kraken and send it to this address._`,
      },
      footer: { text: 'Minimum 1 XRP required' },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'check_activation', title: 'Check Activation' },
          },
        ],
      },
    },
  })
}

export async function sendCurrencySelectionMenu(
  to: string,
  action: 'send' | 'request',
): Promise<void> {
  const actionText = action === 'send' ? 'Send' : 'Request'

  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: `${actionText} Money` },
      body: { text: `Which currency do you want to ${action}?` },
      footer: { text: 'Powered by XRPL' },
      action: {
        button: 'Select Currency',
        sections: [
          {
            title: 'Currencies',
            rows: [
              {
                id: `currency_xrp_${action}`,
                title: 'XRP',
                description: 'Ripple token',
              },
              {
                id: `currency_rlusd_${action}`,
                title: 'RLUSD',
                description: 'Ripple USD stablecoin',
              },
              {
                id: `currency_usdc_${action}`,
                title: 'USDC',
                description: 'USD Coin stablecoin',
              },
            ],
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendRecipientTypeMenu(
  to: string,
  amount: number,
  currency: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'Choose Recipient' },
      body: {
        text:
          `*Sending ${amount} ${currency}*\n\n` +
          `· · · · · · · · · ·\n` +
          `How would you like to identify the recipient?`,
      },
      footer: { text: 'Powered by XRPL' },
      action: {
        button: 'Select Type',
        sections: [
          {
            title: 'Options',
            rows: [
              {
                id: 'recipient_phone',
                title: 'Phone Number',
                description: 'e.g., +237670123456',
              },
              {
                id: 'recipient_username',
                title: 'Username',
                description: 'e.g., @john.sasa',
              },
            ],
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendWalletMenu(
  to: string,
  balances: MenuBalances,
  username: string,
): Promise<void> {
  const {
    xrp,
    rlusd,
    usdc,
    bnb,
    bscUsdt,
    bscUsdc,
    sol,
    solUsdc,
    solUsdt,
    solEurc,
  } = balances
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'My Wallet' },
      body: {
        text:
          `*${username}*\n\n` +
          `*XRPL*\nXRP: ${xrp} | RLUSD: ${rlusd} | USDC: ${usdc}\n\n` +
          `*BSC*\nBNB: ${bnb} | USDT: ${bscUsdt} | USDC: ${bscUsdc}\n\n` +
          `*Solana*\nSOL: ${sol} | USDC: ${solUsdc} | USDT: ${solUsdt} | EURC: ${solEurc}\n\n` +
          `· · · · · · · · · ·\n` +
          `What would you like to do?`,
      },
      footer: { text: 'Powered by XRPL' },
      action: {
        button: 'Choose Action',
        sections: [
          {
            title: 'Options',
            rows: [
              {
                id: 'transaction_history',
                title: 'View History',
                description: 'Recent transactions',
              },
              {
                id: 'pending_requests',
                title: 'View Requests',
                description: 'Pending requests',
              },
              {
                id: 'main_menu',
                title: 'Main Menu',
                description: 'Back to main menu',
              },
            ],
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

export async function sendSaveContactPrompt(
  to: string,
  nickname: string,
  phone: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: `💾 Save *${nickname}* as a contact?\n\n_Tap Save to add them to your contacts for quick access next time._`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: `save_contact:${phone}`, title: 'Save Contact' },
          },
        ],
      },
    },
  }
  await WhatsAppService.sendMessage(payload)
}

export async function sendSendMoneyTypeList(to: string): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: {
        text: '*Send Money*\n\nHow would you like to send?',
      },
      action: {
        button: 'Choose',
        sections: [
          {
            title: 'Payment method',
            rows: [
              {
                id: 'send_crypto',
                title: 'Send Crypto',
                description: 'XRP, RLUSD, USDC and more',
              },
            ],
          },
        ],
      },
    },
  }
  await WhatsAppService.sendMessage(payload)
}

export async function sendRequestTypeButtons(to: string): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text: '*Request Money*\n\nHow would you like to receive?',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: { id: 'request_crypto', title: 'Request Crypto' },
          },
          {
            type: 'reply',
            reply: { id: 'request_card', title: 'Request by Card' },
          },
        ],
      },
    },
  }
  await WhatsAppService.sendMessage(payload)
}

export async function sendMoneySection(to: string): Promise<void> {
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '💸 Money & Transfers' },
      body: { text: 'What would you like to do?' },
      action: {
        button: 'Choose',
        sections: [
          {
            title: 'Options',
            rows: [
              {
                id: 'buy_crypto',
                title: 'Buy Crypto',
                description: 'Card, Apple Pay or Google Pay',
              },
              {
                id: 'send_money',
                title: 'Send Money',
                description: 'Send crypto to anyone',
              },
              {
                id: 'offramp_money',
                title: 'Cash Out',
                description: 'Send to MTN, Orange or UBA M2U',
              },
              {
                id: 'request_money',
                title: 'Request Money',
                description: 'Request crypto from anyone',
              },
            ],
          },
        ],
      },
    },
  })
}

export async function sendAccountSection(to: string): Promise<void> {
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '👤 My Account' },
      body: { text: 'What would you like to do?' },
      action: {
        button: 'Choose',
        sections: [
          {
            title: 'Options',
            rows: [
              {
                id: 'my_wallet',
                title: 'My Wallet',
                description: 'View balances & wallet details',
              },
              {
                id: 'my_contacts',
                title: 'My Contacts',
                description: 'Manage saved contacts',
              },
              {
                id: 'transaction_history',
                title: 'History',
                description: 'Recent transactions',
              },
              {
                id: 'pending_requests',
                title: 'Requests',
                description: 'Pending payment requests',
              },
            ],
          },
        ],
      },
    },
  })
}

export async function sendMomotrustSection(to: string): Promise<void> {
  await WhatsAppService.sendMessage({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: '🏦 MoMo Trust' },
      body: { text: 'What would you like to do?' },
      action: {
        button: 'Choose',
        sections: [
          {
            title: 'Features',
            rows: [
              {
                id: 'trustlock',
                title: '🔒 Secure a Deal',
                description: 'Escrow for peer-to-peer purchases',
              },
              {
                id: 'njangi',
                title: '💰 My Njangi',
                description: 'Rotating savings group',
              },
              {
                id: 'splitchat',
                title: '🎉 Group Collection',
                description: 'Collect money from a group',
              },
              {
                id: 'kobokall',
                title: '📲 MoMo Transfer',
                description: 'Send money via MTN or Orange MoMo',
              },
              {
                id: 'payday',
                title: '💼 Pay My Team',
                description: 'Bulk payroll disbursement',
              },
              {
                id: 'safipay',
                title: '🧾 Invoice a Client',
                description: 'Invoices + collections',
              },
            ],
          },
        ],
      },
    },
  })
}

export async function sendBackToMenuButton(
  to: string,
  message: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      body: { text: message },
      footer: { text: 'Powered by XRPL' },
      action: {
        button: 'Options',
        sections: [
          {
            title: 'Navigation',
            rows: [
              {
                id: 'main_menu',
                title: 'Main Menu',
                description: 'Back to main menu',
              },
            ],
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
}

@Injectable()
export class WhatsAppMenuService {
  sendMainMenu(to: string, username: string) {
    return sendMainMenu(to, username)
  }
  sendWelcomeMessage(to: string, userName?: string) {
    return sendWelcomeMessage(to, userName)
  }
  sendFundingMessage(to: string, xrplAddress: string) {
    return sendFundingMessage(to, xrplAddress)
  }
  sendCurrencySelectionMenu(to: string, action: 'send' | 'request') {
    return sendCurrencySelectionMenu(to, action)
  }
  sendRecipientTypeMenu(to: string, amount: number, currency: string) {
    return sendRecipientTypeMenu(to, amount, currency)
  }
  sendWalletMenu(to: string, balances: MenuBalances, username: string) {
    return sendWalletMenu(to, balances, username)
  }
  sendSaveContactPrompt(to: string, nickname: string, phone: string) {
    return sendSaveContactPrompt(to, nickname, phone)
  }
  sendSendMoneyTypeList(to: string) {
    return sendSendMoneyTypeList(to)
  }
  sendRequestTypeButtons(to: string) {
    return sendRequestTypeButtons(to)
  }
  sendBackToMenuButton(to: string, message: string) {
    return sendBackToMenuButton(to, message)
  }
  sendMoneySection(to: string) {
    return sendMoneySection(to)
  }
  sendAccountSection(to: string) {
    return sendAccountSection(to)
  }
  sendMomotrustSection(to: string) {
    return sendMomotrustSection(to)
  }
}
