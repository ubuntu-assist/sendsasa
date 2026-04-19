import { WhatsAppService } from './whatsapp.service'

export interface MenuBalances {
  xrp: string
  rlusd: string
  usdc: string
  bnb: string
  bscUsdt: string
  baseEth: string
  sol: string
  solUsdc: string
}

export async function sendMainMenu(
  to: string,
  balances: MenuBalances,
  username: string,
): Promise<void> {
  const { xrp, rlusd, usdc, bnb, bscUsdt, baseEth, sol, solUsdc } = balances
  const payload = {
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      header: { type: 'text', text: 'SendSasa Wallet' },
      body: {
        text:
          `*${username}*\n\n` +
          `*XRPL*\nXRP: ${xrp} | RLUSD: ${rlusd} | USDC: ${usdc}\n\n` +
          `*BSC*\nBNB: ${bnb} | USDT: ${bscUsdt}\n\n` +
          `*Base*\nETH: ${baseEth}\n\n` +
          `*Solana*\nSOL: ${sol} | USDC: ${solUsdc}\n\n` +
          `· · · · · · · · · ·\n` +
          `What would you like to do?`,
      },
      footer: { text: 'Powered by XRPL' },
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
                id: 'offramp_money',
                title: 'Cash Out',
                description: 'Send to MTN, Orange or UBA M2U',
              },
              {
                id: 'card_payment',
                title: 'Pay with Card',
                description: 'Apple Pay, Google Pay or Debit Card',
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
        image: { link: 'https://i.ibb.co/kgBsTrcR/welcome-sasa.jpg' },
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
          {
            type: 'reply',
            reply: { id: 'import_wallet', title: 'Import Wallet 📥' },
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
          `To activate it, send at least *1 XRP* to:\n\n` +
          `\`${xrplAddress}\`\n\n` +
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
  balances: MenuBalances,
  username: string,
): Promise<void> {
  const { xrp, rlusd, usdc, bnb, bscUsdt, baseEth, sol, solUsdc } = balances
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
          `*BSC*\nBNB: ${bnb} | USDT: ${bscUsdt}\n\n` +
          `*Base*\nETH: ${baseEth}\n\n` +
          `*Solana*\nSOL: ${sol} | USDC: ${solUsdc}\n\n` +
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
