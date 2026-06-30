export interface PricingPlan {
	name: string;
	price: string;
	period: string;
	description: string;
	features: string[];
	cta: string;
	highlighted: boolean;
}

export const plans: PricingPlan[] = [
	{
		name: 'Personal',
		price: '1%',
		period: 'per transfer',
		description: 'For individuals sending money home or paying friends.',
		features: [
			'Send money in 60 seconds',
			'MTN MoMo and Orange Money delivery',
			'TrustLock marketplace escrow',
			'NjangiBot savings circles',
			'SplitChat group collections',
			'Min fee: 100 XAF',
			'Max fee: 2,000 XAF',
			'No monthly subscription',
		],
		cta: 'Get Started',
		highlighted: false,
	},
	{
		name: 'Business',
		price: '1%',
		period: 'per transfer',
		description: 'For small businesses paying teams and invoicing clients.',
		features: [
			'Everything in Personal',
			'PayDay bulk payroll',
			'SafiPay SME invoicing',
			'EUR to XAF via SEPA',
			'AI-powered payment parsing',
			'Priority support',
			'Min fee: 100 XAF',
			'Max fee: 2,000 XAF',
		],
		cta: 'Start for Free',
		highlighted: true,
	},
];
