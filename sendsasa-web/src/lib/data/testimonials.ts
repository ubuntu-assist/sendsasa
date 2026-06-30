export interface Testimonial {
	name: string;
	role: string;
	avatar: string;
	rating: number;
	text: string;
}

export const testimonials: Testimonial[] = [
	{
		name: 'Duclair F.',
		role: 'Diaspora member, Paris',
		avatar: '/assets/images/user1.jpg',
		rating: 5,
		text: 'I used to spend 45 minutes at a Western Union branch every month. Now I open WhatsApp, type an amount, and my mother has the money in Douala before I finish my coffee.',
	},
	{
		name: 'Christiane M.',
		role: 'Small business owner, Yaoundé',
		avatar: '/assets/images/user2.jpg',
		rating: 5,
		text: 'PayDay changed how I run my business. I used to visit the bank to pay my staff one by one. Now I send one WhatsApp message and everyone is paid in seconds.',
	},
	{
		name: 'Jean-Pierre N.',
		role: 'Freelancer, Brussels',
		avatar: '/assets/images/user3.jpg',
		rating: 5,
		text: 'I invoice clients in Belgium in euros and receive XAF in my Orange Money. No intermediary, no waiting three days, no surprise fees. SafiPay is exactly what I needed.',
	},
	{
		name: 'Sylvie A.',
		role: 'Njangi organiser, Douala',
		avatar: '/assets/images/user4.jpg',
		rating: 5,
		text: 'Our njangi group has members in France, Canada and Cameroon. Collecting was a nightmare before. NjangiBot made it simple. Everyone pays from wherever they are.',
	},
	{
		name: 'Marc T.',
		role: 'Online seller, Buea',
		avatar: '/assets/images/user5.jpg',
		rating: 5,
		text: 'A buyer from Douala paid me through TrustLock. The funds were held until I shipped the item and he confirmed receipt. Zero risk for both of us. I will never sell without it.',
	},
	{
		name: 'Nadège K.',
		role: 'Student, Montreal',
		avatar: '/assets/images/user6.jpg',
		rating: 5,
		text: 'Sending my share for family expenses used to cost me 8% in fees. SendSasa charges 1% and the money arrives faster than any service I have used before.',
	},
];
