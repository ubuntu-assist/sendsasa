export interface FAQ {
  question: string
  answer: string
}

export const faqs: FAQ[] = [
  {
    question: 'How do I start using SendSasa?',
    answer:
      'Just send a WhatsApp message to our number. The bot will guide you through a quick setup — you create a 5-digit PIN and you are ready to send and receive money. No app to download, no account to open at a bank.',
  },
  {
    question: 'Which countries does SendSasa support?',
    answer:
      'We currently support Cameroon as the destination country. Senders can be located anywhere — France, Belgium, Canada, the US, or anywhere else. We are expanding to Nigeria, Senegal and Ivory Coast in 2027.',
  },
  {
    question: 'How much does it cost to send money?',
    answer:
      'SendSasa charges a flat 1% fee per transaction, with a minimum of 100 XAF and a maximum of 2,000 XAF. There are no hidden charges, no subscription fees, and no monthly costs.',
  },
  {
    question: 'How fast does the money arrive?',
    answer:
      'Transfers settle in under 60 seconds. Once the sender completes the payment, the recipient receives a notification and the funds appear in their MTN MoMo or Orange Money wallet almost instantly.',
  },
  {
    question: 'Does the recipient need a bank account?',
    answer:
      'No. The recipient only needs an active MTN MoMo or Orange Money account in Cameroon. No bank account, no smartphone, no app download required.',
  },
  {
    question: 'Is my money safe with SendSasa?',
    answer:
      'Yes. All transactions are settled on Stellar, an open blockchain used by hundreds of financial institutions worldwide. Your funds are never held by us beyond the time needed to route the transfer.',
  },
  {
    question: 'What is TrustLock and how does it work?',
    answer:
      'TrustLock is our marketplace escrow feature. When you buy or sell something online, you can lock the payment with TrustLock. The funds are held securely until the buyer confirms they received what they ordered. If there is a dispute, our AI reviews the evidence and makes a fair decision.',
  },
  {
    question: 'Can I use SendSasa for business payments?',
    answer:
      'Yes. PayDay lets you pay your entire team via a single WhatsApp message. SafiPay lets you send invoices to clients abroad and receive payment in your local currency. Both features are built for small businesses and freelancers.',
  },
  {
    question: 'What is a Njangi and how does NjangiBot work?',
    answer:
      'A Njangi is a traditional rotating savings circle popular in Central and West Africa. Members each contribute a fixed amount regularly, and each cycle one member receives the full pot. NjangiBot digitises this entirely inside WhatsApp, so members in different countries can all participate.',
  },
  {
    question: 'How do I contact support?',
    answer:
      'You can reach us at support@sendsasa.com or via WhatsApp at the same number you use for transfers. Our support team responds within a few hours during business hours in Cameroon time.',
  },
]
