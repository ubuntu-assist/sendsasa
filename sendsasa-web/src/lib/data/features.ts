export interface Feature {
	slug: string;
	title: string;
	subtitle: string;
	description: string;
	icon: string;
	image: string;
}

export const features: Feature[] = [
	{
		slug: 'send-money',
		title: 'Send Money',
		subtitle: 'Cross-border in 60 seconds',
		description: 'Send money home from Europe or North America to any MTN MoMo or Orange Money wallet in Cameroon. No bank account needed on either end. Settled in under 60 seconds.',
		icon: '/assets/images/feature-icon1.png',
		image: '/assets/images/feature1.png',
	},
	{
		slug: 'trustlock',
		title: 'TrustLock',
		subtitle: 'Marketplace escrow',
		description: 'Buy and sell online with zero risk. Funds are held securely until you confirm delivery. If something goes wrong, our AI arbitration steps in. Both sides are protected.',
		icon: '/assets/images/feature-icon2.png',
		image: '/assets/images/feature2.png',
	},
	{
		slug: 'njangibot',
		title: 'NjangiBot',
		subtitle: 'Rotating savings circles',
		description: 'Run your savings circle with friends and family across different countries. Members contribute via WhatsApp. The cycle recipient receives the full pot in their mobile money wallet.',
		icon: '/assets/images/feature-icon3.png',
		image: '/assets/images/feature3.png',
	},
	{
		slug: 'splitchat',
		title: 'SplitChat',
		subtitle: 'Group expense collection',
		description: 'Collect money from a group for any shared expense — rent, events, gifts, travel. Everyone pays via WhatsApp. The organiser receives the full amount in one shot.',
		icon: '/assets/images/feature-icon4.png',
		image: '/assets/images/feature4.png',
	},
	{
		slug: 'payday',
		title: 'PayDay',
		subtitle: 'Bulk payroll in one message',
		description: 'Pay your entire team with a single WhatsApp message. Just say "pay Jean 15,000, Marie 20,000, Paul 12,000" and our AI handles the rest. 100 employees paid instantly.',
		icon: '/assets/images/feature-icon5.png',
		image: '/assets/images/feature5.png',
	},
	{
		slug: 'safipay',
		title: 'SafiPay',
		subtitle: 'SME invoicing and collections',
		description: 'Invoice a European client in EUR via SEPA. Receive XAF in your mobile money wallet. No bank account, no correspondent, no crypto knowledge required.',
		icon: '/assets/images/feature-icon6.png',
		image: '/assets/images/feature6.png',
	},
];
