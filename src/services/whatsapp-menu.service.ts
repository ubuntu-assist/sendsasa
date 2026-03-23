import { WhatsAppService } from './whatsapp.service'

export async function sendMainMenu(
  to: string,
  xrpBalance: string,
  rlusdBalance: string,
  usdcBalance: string,
  username: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'SendSasa Wallet',
      },
      body: {
        text: `Username: @${username}\n\nXRP: ${xrpBalance}\nRLUSD: ${rlusdBalance}\nUSDC: ${usdcBalance}\n\nWhat would you like to do?`,
      },
      footer: {
        text: 'Powered by XRPL',
      },
      action: {
        button: 'Menu',
        sections: [
          {
            title: 'Transactions',
            rows: [
              {
                id: 'send_money',
                title: 'Send Money',
                description: 'Send XRP, RLUSD or USDC',
              },
              {
                id: 'request_money',
                title: 'Request Money',
                description: 'Request payment',
              },
            ],
          },
          {
            title: 'Account',
            rows: [
              {
                id: 'my_wallet',
                title: 'My Wallet',
                description: 'View wallet details',
              },
              {
                id: 'transaction_history',
                title: 'History',
                description: 'Transaction history',
              },
              {
                id: 'pending_requests',
                title: 'Requests',
                description: 'Pending requests',
              },
            ],
          },
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
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: {
        text:
          `*Your wallet has been created!*\n\n` +
          `To activate it, you need to send at least *10 XRP* to your wallet address:\n\n` +
          `\`${xrplAddress}\`\n\n` +
          `You can buy XRP on any exchange (Binance, Coinbase, Kraken) and send it to this address.\n\n` +
          `Once funded, tap *Check Activation* and we'll set up your security and stablecoin support.`,
      },
      footer: {
        text: 'Minimum 1 XRP required',
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'check_activation',
              title: 'Check Activation',
            },
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
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
      header: {
        type: 'text',
        text: `${actionText} Money`,
      },
      body: {
        text: `Which currency do you want to ${action}?`,
      },
      footer: {
        text: 'Powered by XRPL',
      },
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
      header: {
        type: 'text',
        text: 'Choose Recipient',
      },
      body: {
        text: `Sending ${amount} ${currency}\n\nHow would you like to identify the recipient?`,
      },
      footer: {
        text: 'Powered by XRPL',
      },
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
              {
                id: 'recipient_address',
                title: 'Wallet Address',
                description: 'e.g., rN7n7otQ...',
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
  xrpBalance: string,
  rlusdBalance: string,
  usdcBalance: string,
  username: string,
): Promise<void> {
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: {
        type: 'text',
        text: 'My Wallet',
      },
      body: {
        text: `@${username}\n\nXRP: ${xrpBalance}\nRLUSD: ${rlusdBalance}\nUSDC: ${usdcBalance}\n\nWhat would you like to do?`,
      },
      footer: {
        text: 'Powered by XRPL',
      },
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
        type: 'image',
        image: {
          link: 'https://i.ibb.co/kgBsTrcR/welcome-sasa.jpg',
        },
      },
      body: {
        text: `${greeting}\n\nSend money home faster than saying "I love you".\n\nSendSasa lets you send cash to Africa via WhatsApp — lands in M-Pesa, MTN MoMo, or Orange Money in under 60 seconds, for under 1% fee.`,
      },
      action: {
        buttons: [
          {
            type: 'reply',
            reply: {
              id: 'get_started',
              title: 'Get Started 🚀',
            },
          },
        ],
      },
    },
  }

  await WhatsAppService.sendMessage(payload)
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
      body: {
        text: message,
      },
      footer: {
        text: 'Powered by XRPL',
      },
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
