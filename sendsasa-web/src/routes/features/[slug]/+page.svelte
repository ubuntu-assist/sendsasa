<script lang="ts">
  import { page } from '$app/stores'
  import PageBanner from '$lib/components/PageBanner.svelte'

  const allFeatures = [
    { slug: 'send-money', title: 'Send Money' },
    { slug: 'trustlock', title: 'TrustLock' },
    { slug: 'njangibot', title: 'NjangiBot' },
    { slug: 'splitchat', title: 'SplitChat' },
    { slug: 'payday', title: 'PayDay' },
    { slug: 'safipay', title: 'SafiPay' },
  ]

  const featureMap: Record<
    string,
    {
      title: string
      subtitle: string
      description: string
      descriptionTwo: string
      descriptionThree: string
      quote: string
      points: string[]
      faqs: { q: string; a: string }[]
      img: string
    }
  > = {
    'send-money': {
      title: 'Send Money',
      subtitle: 'Remittance in 60 seconds',
      description:
        'Send money to any mobile money wallet across Africa in under 60 seconds. Works with MTN MoMo, Orange Money, M-Pesa, Wave, Airtel Money and more. Available 24 hours a day, 7 days a week, including weekends and public holidays. Only 1% fee — no hidden charges, no surprises.',
      descriptionTwo:
        'Traditional remittance services charge anywhere from 5% to 15% in fees, and transfers can take 1 to 5 business days. SendSasa cuts that to 1% and 60 seconds — the same WhatsApp message you use to chat with family becomes the tool you use to send them money.',
      quote:
        '"Our goal is simple: every franc your family sends should reach the recipient in full. The 10% the old services take is a tax on people who can least afford it. We built SendSasa to end that."',
      points: [
        'Works with MTN MoMo, Orange Money, Wave, M-Pesa',
        'Transfers arrive in under 60 seconds',
        '10+ African countries supported',
        '1% flat fee, min 100 XAF, max 2,000 XAF',
        'Available 24/7 including public holidays',
        'No bank account or app required',
      ],
      descriptionThree:
        'All you need is a phone number registered on a supported mobile money network. SendSasa handles the rest — currency conversion, routing, confirmation — and delivers a WhatsApp receipt to both sender and recipient.',
      faqs: [
        {
          q: 'How long does a transfer actually take?',
          a: "Most transfers complete in under 60 seconds. In rare cases of network congestion on the recipient's mobile money operator, it can take up to 5 minutes. You and the recipient both receive a WhatsApp notification the moment the money lands.",
        },
        {
          q: 'What countries are supported?',
          a: "SendSasa currently supports Cameroon (MTN MoMo, Orange Money), Kenya (M-Pesa), Senegal (Wave), Côte d'Ivoire (Orange Money, Wave), and more. We are adding new corridors every quarter.",
        },
        {
          q: 'Is there a minimum or maximum transfer amount?',
          a: 'The minimum is 500 XAF and the maximum is 5,000,000 XAF per transaction. The fee is 1% of the transfer amount, with a minimum fee of 100 XAF and a maximum of 2,000 XAF.',
        },
        {
          q: 'What happens if the transfer fails?',
          a: 'If the transfer is not delivered within 10 minutes, SendSasa automatically initiates a full refund to your mobile money wallet. You will receive a WhatsApp notification at each step.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
    trustlock: {
      title: 'TrustLock',
      subtitle: 'Escrow for online marketplace deals',
      description:
        'TrustLock holds your payment safely in escrow until you confirm you received exactly what you paid for. Perfect for Facebook Marketplace deals, WhatsApp group sales, and any transaction where you need to send money before inspecting the goods. Money only moves when both parties agree.',
      descriptionTwo:
        'Online scams cost African users billions each year. The "send first, trust me" model is broken. TrustLock replaces it with a simple escrow system that works in WhatsApp: the buyer pays into a locked holding account, the seller ships knowing funds are secured, and the buyer releases payment only after confirming delivery.',
      quote:
        '"TrustLock turns a WhatsApp chat into a legally structured deal. The buyer is protected from scams. The seller is protected from chargebacks. Both sides can transact with strangers the same way they transact with friends."',
      points: [
        'Lock payment before item ships or service starts',
        'Seller notified when funds are secured',
        'Release funds only when you are satisfied',
        'AI-assisted dispute resolution if things go wrong',
        'Automatic full refund if deal falls through',
        'Works for amounts between 500 and 5,000,000 XAF',
      ],
      descriptionThree:
        'If a dispute arises, our AI reviews the evidence submitted by both sides and issues a verdict — typically within 2 hours. For high-stakes disputes, our human review team takes over. Both parties receive the reasoning behind every decision.',
      faqs: [
        {
          q: 'What happens after I lock my payment?',
          a: "The seller immediately receives a WhatsApp notification that funds are secured. This is their signal to ship the goods or start the service. You receive a confirmation code to release funds when you're satisfied.",
        },
        {
          q: 'Can I get a refund if the deal goes wrong?',
          a: 'Yes. If the seller does not fulfill the deal, you can file a dispute directly in WhatsApp. Our AI reviews the evidence from both sides and issues a decision within 2 hours.',
        },
        {
          q: 'How long are funds held in escrow?',
          a: 'The deal creator sets an expiry date (max 30 days). If the buyer does not release or dispute within that window, the deal administrator reviews and resolves manually.',
        },
        {
          q: 'What is the fee for TrustLock?',
          a: 'The same 1% flat fee applies, charged to the buyer at the time of locking funds. The seller receives the full agreed amount minus 1%, which is clearly shown before any payment is made.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
    njangibot: {
      title: 'NjangiBot',
      subtitle: 'Digital rotating savings circles',
      description:
        "Run your traditional tontine or njangi savings circle entirely through WhatsApp. Members contribute each round automatically via mobile money. The full pot goes to one member per cycle. NjangiBot tracks every payment, sends reminders to those who haven't paid, and handles the payout — completely automated.",
      descriptionTwo:
        'The njangi is one of the most powerful financial tools in Cameroon and across West Africa. The problem is coordination: chasing members for payments, tracking who has received, handling disputes about rotation order. NjangiBot eliminates all of that friction while keeping the human trust that makes the njangi work.',
      quote:
        '"A njangi is built on trust between people who know each other. NjangiBot does not replace that trust — it digitizes the paperwork so the trust can focus on the relationships, not the receipts."',
      points: [
        'Create a group in under 2 minutes',
        'Members join by sending a short code in WhatsApp',
        'Automatic payment collection via MTN MoMo or Orange Money',
        "WhatsApp reminders sent to members who haven't paid",
        'Full pot automatically paid out when all members contribute',
        'Admin can view full payment history at any time',
      ],
      descriptionThree:
        'NjangiBot supports groups of 3 to 50 members with contribution amounts from 500 XAF to 500,000 XAF per cycle. The rotation order can be set as sequential, random, or admin-chosen. Every transaction is logged and visible to all group members for full transparency.',
      faqs: [
        {
          q: 'How do members join a NjangiBot group?',
          a: 'The admin creates the group and receives a short join code (e.g. NJ-4821). Any member can join by sending that code to the SendSasa WhatsApp number. They are automatically added to the rotation.',
        },
        {
          q: 'What happens if a member does not pay on time?',
          a: 'NjangiBot sends up to 3 WhatsApp reminders before the payment deadline. If a member still has not paid, the admin receives a notification and can choose to extend the deadline, skip that member, or remove them from the group.',
        },
        {
          q: 'How is the payout order decided?',
          a: 'The admin chooses at group creation: sequential (in order of joining), random (NjangiBot draws randomly each cycle), or admin-choice (admin selects the recipient each cycle manually).',
        },
        {
          q: 'What is the fee?',
          a: '1% is charged on the payout amount, deducted when the pot is released to the cycle recipient. Contributors pay no fee — only the recipient pays 1% of what they receive.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
    splitchat: {
      title: 'SplitChat',
      subtitle: 'Group money collections',
      description:
        "Collecting money from a group for a birthday gift, a trip, a shared meal, or a community project? SplitChat tracks who has paid, sends automated reminders to those who haven't, and releases the full amount to the organizer once you hit your target — or your deadline.",
      descriptionTwo:
        "Group collections in Africa have historically relied on one person manually chasing everyone for money — a role that strains friendships and takes time. SplitChat makes the organizer's job invisible: set a target, share a link or code, and let the platform handle the rest.",
      quote:
        '"Whether it\'s 3 friends splitting dinner or 200 colleagues contributing to a farewell gift, SplitChat handles the logistics so the organizer can focus on the occasion, not the money."',
      points: [
        'Set a target amount, a deadline, or both',
        'Members contribute individually via mobile money',
        'Automatic WhatsApp reminders to non-contributors',
        'Track who paid and how much — visible to the organizer',
        'Full refund to all contributors if target is not reached',
        'No limit on group size or number of contributors',
      ],
      descriptionThree:
        'SplitChat works for one-time collections and recurring ones. Amounts as small as 500 XAF per person are supported, making it ideal for school parent committees, church collections, and team lunch pools where every franc counts.',
      faqs: [
        {
          q: 'How do contributors pay into a SplitChat collection?',
          a: 'The organizer creates a collection and receives a short code (e.g. SC-7712). Contributors send that code to the SendSasa WhatsApp number and are prompted to enter their contribution amount. Payment goes directly via their mobile money wallet.',
        },
        {
          q: "What if we don't reach the target?",
          a: 'If the deadline passes without reaching the target, all contributors receive a full refund to their mobile money wallets within 24 hours. The organizer receives a notification explaining the outcome.',
        },
        {
          q: 'Can the organizer withdraw before the target is reached?',
          a: 'No — this is by design. Funds are held securely until the target is reached or the deadline passes. This protects contributors and ensures the collection is used for its stated purpose.',
        },
        {
          q: 'Is there a fee for SplitChat?',
          a: '1% is charged on the total amount released to the organizer. Contributors pay no fee. The fee is clearly shown to the organizer before they launch the collection.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
    payday: {
      title: 'PayDay',
      subtitle: 'Bulk payroll for teams',
      description:
        'Pay your entire team in a single WhatsApp message using plain language. Just tell SendSasa who to pay and how much: "Pay Jean 15,000, Marie 20,000, Paul 12,000." Our AI parses your message, shows you a payment summary, and sends all payments simultaneously after your approval.',
      descriptionTwo:
        'For most small business owners in Cameroon, payroll means going to an MTN or Orange point-of-sale and paying each employee one by one in cash. This takes hours and introduces risk. PayDay collapses the entire process into a single WhatsApp conversation that takes under 2 minutes.',
      quote:
        '"I used to spend every Friday afternoon paying my workers one by one at the agency. With PayDay I send one message from the office, approve the list, and everyone gets paid before lunch. It changed how I run my business."',
      points: [
        'Natural language input — no spreadsheets or forms',
        'Pay up to 100 recipients in a single transaction',
        'AI parses names, amounts, and phone numbers automatically',
        'Review and approve the full payment list before anything moves',
        'Each recipient gets a WhatsApp payment confirmation',
        'Full payroll history stored and accessible in WhatsApp',
      ],
      descriptionThree:
        'PayDay supports MTN MoMo and Orange Money recipients. Payments to all recipients are dispatched simultaneously — not sequentially — so your team of 50 gets paid at the same moment, not over 50 minutes.',
      faqs: [
        {
          q: 'How does the AI parse my payroll message?',
          a: 'You can write naturally: "Pay Marie Nguema 25000, Jean Fopa 18000" or paste from a list. The AI extracts names, phone numbers, and amounts. If anything is ambiguous, it asks you to clarify before processing.',
        },
        {
          q: 'What is the maximum number of recipients?',
          a: 'Up to 100 recipients per PayDay batch. For teams larger than 100, you can run multiple batches — the second batch can start immediately after the first is approved.',
        },
        {
          q: 'What if one payment fails?',
          a: "If a payment fails (e.g. the recipient's wallet is full or their number is inactive), you receive a notification for that specific recipient. All other payments in the batch proceed normally. You can retry the failed ones with one message.",
        },
        {
          q: 'Can I schedule PayDay for a specific date and time?',
          a: 'Scheduled payroll is coming soon. Currently PayDay executes immediately after your approval. If you need deferred payroll, send us a message at support@sendsasa.com and we will add you to the early access list.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
    safipay: {
      title: 'SafiPay',
      subtitle: 'Professional invoicing and collections',
      description:
        'Create a professional invoice in WhatsApp and share a payment link with your client. When they pay, the money lands directly in your mobile money wallet — the same day. Automatic reminders chase clients who have not paid yet. No accounting software, no bank account, no laptop required.',
      descriptionTwo:
        'Independent professionals, freelancers, and small business owners in Africa lose significant revenue each year to late payments and unpaid invoices. SafiPay professionalizes the billing process and puts automated follow-up on autopilot — so you focus on the work, not the chasing.',
      quote:
        '"Before SafiPay I was sending WhatsApp voice notes asking clients to pay. Now I send a professional invoice link and 80% of my clients pay within the hour. The reminders handle the rest automatically."',
      points: [
        'Create a professional invoice in under 60 seconds',
        'Share payment link via WhatsApp, SMS, or any channel',
        'Client pays via mobile money — no bank account needed',
        'Money lands on your MoMo the same day payment is made',
        'Automatic payment reminders for overdue invoices',
        'Professional PDF receipt sent to both parties automatically',
      ],
      descriptionThree:
        'SafiPay invoices include your business name, the service or product description, amount, currency, and a secure payment link. Clients can pay from any mobile money wallet — they do not need a SendSasa account. You receive a WhatsApp notification the instant payment is confirmed.',
      faqs: [
        {
          q: 'Does my client need to have SendSasa to pay an invoice?',
          a: 'No. Your client receives a payment link. They click it, enter their mobile money number, and approve the payment on their phone. They do not need to download anything or create an account.',
        },
        {
          q: 'How many reminders are sent for unpaid invoices?',
          a: 'SafiPay sends 3 automatic reminders: 24 hours after the invoice is sent, on the due date, and 48 hours after the due date. You can also send a manual reminder at any time from WhatsApp.',
        },
        {
          q: 'Can I create invoices in different currencies?',
          a: 'Currently XAF is supported for Cameroon-based invoices. EUR and USD invoices with Stellar-based settlement are in beta for diaspora merchants. Contact support@sendsasa.com for early access.',
        },
        {
          q: 'What is the fee for SafiPay?',
          a: '1% of the invoice amount is charged when the client pays. The fee is deducted before the money reaches your wallet. If an invoice is not paid, no fee is charged.',
        },
      ],
      img: '/assets/images/services-details-img.jpg',
    },
  }

  $: slug = $page.params.slug
  $: feature = featureMap[slug]
</script>

<svelte:head>
  <title>{feature?.title ?? 'Feature'} — SendSasa</title>
  <meta name="description" content={feature?.description ?? ''} />
</svelte:head>

{#if feature}
  <PageBanner title={feature.title} breadcrumb={feature.title} />

  <div class="services-details-area ptb-120">
    <div class="container mw-1690">
      <div class="row g-4">
        <!-- Main Content -->
        <div class="col-xl-8">
          <div
            class="services-details-content details-content"
            data-cues="slideInUp"
            data-duration="900"
          >
            <!-- Hero image with WhatsApp CTA -->
            <div class="position-relative mb-4">
              <img src={feature.img} alt={feature.title} class="w-100" />
              <div class="position-absolute top-50 start-50 translate-middle">
                <a
                  href="https://youtu.be/78GehqOuq-A?si=WSjyu8eJ-TPiQ5QP"
                  class="video-btn bg-primary mx-auto"
                  style="width: 100px; height: 100px;"
                  data-fslightbox="2"
                >
                  <i
                    class="ti ti-player-play-filled text-secondary"
                    style="font-size: 50px;"
                  ></i>
                </a>
              </div>
            </div>

            <h2>{feature.title}</h2>
            <p>{feature.description}</p>
            <p>{feature.descriptionTwo}</p>

            <blockquote class="mt-4">
              <p>{feature.quote}</p>
            </blockquote>

            <p>{feature.descriptionThree}</p>

            <h2>How {feature.title} Works</h2>

            <div class="row g-4">
              <div class="col-md-6">
                <ul class="p-0 m-0 list-unstyled">
                  {#each feature.points.slice(0, 3) as point}
                    <li class="d-flex align-items-center gap-15">
                      <img src="/assets/images/check2.svg" alt="check" />
                      <span>{point}</span>
                    </li>
                  {/each}
                </ul>
              </div>
              <div class="col-md-6">
                <ul class="p-0 m-0 list-unstyled">
                  {#each feature.points.slice(3) as point}
                    <li class="d-flex align-items-center gap-15">
                      <img src="/assets/images/check2.svg" alt="check" />
                      <span>{point}</span>
                    </li>
                  {/each}
                </ul>
              </div>
            </div>

            <div class="row g-4 my-4">
              <div class="col-md-6">
                <img
                  src="/assets/images/services-img1.jpg"
                  alt="services"
                  class="w-100"
                />
              </div>
              <div class="col-md-6">
                <img
                  src="/assets/images/services-img2.jpg"
                  alt="services"
                  class="w-100"
                />
              </div>
            </div>

            <p>
              SendSasa works entirely inside WhatsApp — no app to download, no
              website to log in to, no bank account required. Everything happens
              in the chat you already use every day, powered by mobile money
              networks already on your phone.
            </p>

            <h2>Common Questions</h2>
            <div
              class="accordion faq-wrapper style-three"
              id="accordion-{slug}"
            >
              {#each feature.faqs as faq, i}
                <div class="accordion-item">
                  <h2 class="accordion-header">
                    <button
                      class="accordion-button text-secondary {i > 0
                        ? 'collapsed'
                        : ''}"
                      type="button"
                      data-bs-toggle="collapse"
                      data-bs-target="#faq-{slug}-{i}"
                      aria-expanded={i === 0 ? 'true' : 'false'}
                      aria-controls="faq-{slug}-{i}"
                    >
                      {faq.q}
                    </button>
                  </h2>
                  <div
                    id="faq-{slug}-{i}"
                    class="accordion-collapse collapse {i === 0 ? 'show' : ''}"
                    data-bs-parent="#accordion-{slug}"
                  >
                    <div class="accordion-body">
                      <p>{faq.a}</p>
                    </div>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        </div>

        <!-- Sidebar -->
        <div class="col-xl-4">
          <div class="sidebar" data-cues="slideInUp" data-duration="900">
            <!-- Try on WhatsApp CTA -->
            <div class="sidebar-widget widget-search bg-eff6ff">
              <a
                href="https://api.whatsapp.com/send/?phone=14694079616&text=Hello&type=phone_number&app_absent=0"
                target="_blank"
                rel="noopener noreferrer"
                class="default-btn d-block text-center w-100"
              >
                Try {feature.title} on WhatsApp
              </a>
            </div>

            <!-- All Features list -->
            <div class="sidebar-widget bg-eff6ff">
              <h3>All Features</h3>
              <ul class="category-list p-0 m-0 list-unstyled">
                {#each allFeatures as f}
                  <li>
                    <a
                      href="/features/{f.slug}"
                      class="d-flex justify-content-between align-items-center text-decoration-none {slug ===
                      f.slug
                        ? 'active'
                        : ''}"
                    >
                      <span>{f.title}</span>
                      <i class="ti ti-arrow-right"></i>
                    </a>
                  </li>
                {/each}
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
{:else}
  <div class="ptb-120 text-center">
    <h2>Feature not found</h2>
    <a href="/features" class="default-btn mt-4">All Features</a>
  </div>
{/if}
