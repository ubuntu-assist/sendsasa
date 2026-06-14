# MoMo Trust — CLAUDE.md

> Read this file completely before writing a single line of code.

---

## What This Codebase Already Is

This is **SendSasa** — a production WhatsApp-native remittance app built on:

- **NestJS** (modular architecture with decorators)
- **MongoDB Atlas** (via Mongoose)
- **Meta WhatsApp Business Cloud API** (messages, flows, webhooks)
- **XRPL** (XRP Ledger for crypto rails)
- **pawaPay** (mobile money — already integrated in `src/services/mobile-money.service.ts`)
- **Web3Auth** (wallet creation)

### What already works — DO NOT TOUCH

- `src/webhook/` — incoming WhatsApp message handler
- `src/whatsapp/` — WhatsApp client, message parser, menu service
- `src/flow/` — Flow launcher, Flow data exchange, Flow controller
- `src/services/mobile-money.service.ts` — pawaPay integration
- `src/services/fx-rate.service.ts` — FX rates
- `src/services/receipt-generator.service.ts` — PDF receipts
- `src/models/` — User, Transaction, PaymentRequest, MessageLog, etc.
- `flows/` — existing Flow JSON files (send-money, offramp, pin-setup, etc.)
- `src/xrpl/`, `src/chains/` — blockchain services
- All existing routes, auth, middleware

---

## What We Are Adding

Five new financial features as **NestJS modules** that plug into the existing WhatsApp menu. Each feature is self-contained. None modifies existing code — they only extend it.

| Module           | Feature                     | pawaPay primitive                |
| ---------------- | --------------------------- | -------------------------------- |
| `src/trustlock/` | Marketplace escrow          | deposit → hold → payout / refund |
| `src/njangi/`    | Rotating savings (tontine)  | bulk deposit → payout            |
| `src/splitchat/` | Group collections           | deposit (multi) → payout         |
| `src/payday/`    | Bulk payroll                | bulk payout                      |
| `src/safipay/`   | SME invoicing + collections | payment page → payout            |

---

## Existing Architecture — Key Files Claude Must Read First

Before implementing anything, Claude Code must read these files to understand existing patterns:

```
src/webhook/message-handler.service.ts   ← how incoming WhatsApp messages are routed
src/whatsapp/whatsapp-menu.service.ts    ← how menus are built and sent
src/whatsapp/whatsapp.service.ts         ← how WhatsApp messages are sent
src/whatsapp/message-parser.service.ts   ← how incoming messages are parsed
src/flow/flow-launcher.service.ts        ← how Flows are triggered
src/flow/flow-data-exchange.service.ts   ← how Flow data exchange works
src/flow/flow.controller.ts              ← Flow endpoint handler
src/services/mobile-money.service.ts     ← existing pawaPay client
src/models/User.ts                       ← User model schema
src/models/Transaction.ts                ← Transaction model schema
src/app.module.ts                        ← module registration pattern
```

**Follow every pattern you see in these files exactly.** Do not invent new patterns.

---

## Existing pawaPay Integration

`src/services/mobile-money.service.ts` already wraps the pawaPay API.
Before building anything, read this file to understand:

- How the pawaPay client is initialized
- What methods already exist (deposit, payout, etc.)
- How errors are handled
- What the callback/webhook handler looks like

**Extend this service** with any missing pawaPay methods (bulkPayout, refund, remittance, paymentPage).
Do NOT create a second pawaPay client.

---

## Existing Flow Infrastructure

`flows/` directory contains existing Flow JSON files.
`src/flow/flow-launcher.service.ts` knows how to send Flows to users.
`src/flow/flow-data-exchange.service.ts` handles dynamic Flow screen data.
`src/flow/flow.controller.ts` is the Flow endpoint.

**Add new Flow JSON files to the `flows/` directory.**
**Add new Flow handling to `flow-data-exchange.service.ts`** following the existing pattern.
Do NOT create a new Flow endpoint or controller.

---

## Existing Menu System

`src/whatsapp/whatsapp-menu.service.ts` builds and sends menus.
`src/webhook/message-handler.service.ts` routes menu selections to handlers.

**Add the 5 new features to the existing main menu as a new section.**
**Add new menu selection handlers in `message-handler.service.ts`.**
Do NOT replace the existing menu — append to it.

---

## New Module Structure to Create

Each new feature follows this NestJS module pattern (same as existing modules):

```
src/{feature}/
├── {feature}.module.ts          ← NestJS module
├── {feature}.service.ts         ← business logic
├── {feature}-flow.service.ts    ← Flow handling for this feature
└── {feature}.schema.ts          ← Mongoose schema
```

---

## MongoDB — New Collections

Add these collections alongside existing ones.
Follow the Mongoose schema pattern in `src/models/`.

### deals (TrustLock)

```typescript
{
  shortCode: string           // 6-char unique code
  buyerPhone: string          // E.164 format
  sellerPhone: string
  title: string
  description?: string
  category: string
  amount: number              // XAF integer
  fee: number
  amountToSeller: number
  status: DealStatus          // enum
  pawapayDepositId?: string
  pawapayPayoutId?: string
  pawapayRefundId?: string
  expiresAt: Date
  completedAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

### groups (NjangiBot + SplitChat)

```typescript
{
  shortCode: string
  type: 'NJANGI' | 'SPLITCHAT'
  adminPhone: string
  name: string
  contributionAmount: number
  currency: string            // default 'XAF'
  fee: number

  // NJANGI
  cycleDurationDays?: number
  totalCycles?: number
  currentCycle?: number
  currentRecipientPhone?: string
  payoutOrder?: 'sequential' | 'random' | 'admin_choice'

  // SPLITCHAT
  targetAmount?: number
  targetParticipants?: number
  deadline?: Date

  status: GroupStatus         // enum
  pawapayPayoutId?: string
  createdAt: Date
  updatedAt: Date
}
```

### groupMembers

```typescript
{
  groupId: ObjectId
  phone: string
  displayName?: string
  rotationPosition?: number
  hasPaidCurrentCycle: boolean
  paidAt?: Date
  pawapayDepositId?: string
  totalContributed: number
  totalReceived: number
  cyclesPaid: number
  joinedAt: Date
}
```

### payrolls (PayDay)

```typescript
{
  shortCode: string
  employerPhone: string
  name: string
  totalAmount: number
  fee: number
  recipientCount: number
  paidCount: number
  status: PayrollStatus       // enum
  items: PayrollItem[]        // embedded
  createdAt: Date
  updatedAt: Date
}

// embedded PayrollItem
{
  recipientPhone: string
  recipientName?: string
  amount: number
  provider?: string
  status: 'PENDING' | 'COMPLETED' | 'FAILED'
  pawapayPayoutId?: string
  failureReason?: string
  paidAt?: Date
}
```

### invoices (SafiPay)

```typescript
{
  shortCode: string
  merchantPhone: string
  clientPhone: string
  clientName?: string
  description: string
  total: number
  currency: string
  status: InvoiceStatus       // enum
  paymentPageUrl?: string
  pawapayDepositId?: string
  dueDate: Date
  paidAt?: Date
  reminderCount: number
  lastReminderAt?: Date
  createdAt: Date
  updatedAt: Date
}
```

### disputes (TrustLock)

```typescript
{
  dealId: ObjectId
  filedByPhone: string
  reason: string
  description?: string
  evidenceUrls: string[]
  aiVerdict?: 'RELEASE' | 'REFUND' | 'MANUAL_REVIEW'
  aiReasoning?: string
  aiConfidence?: number
  resolvedAt?: Date
  createdAt: Date
}
```

---

## Status Enums

```typescript
export enum DealStatus {
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  ACTIVE = 'ACTIVE',
  RELEASING = 'RELEASING',
  COMPLETED = 'COMPLETED',
  DISPUTED = 'DISPUTED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
  CANCELLED = 'CANCELLED',
  MANUAL_REVIEW = 'MANUAL_REVIEW',
  EXPIRED = 'EXPIRED',
}

export enum GroupStatus {
  SETUP = 'SETUP',
  ACTIVE = 'ACTIVE',
  COLLECTING = 'COLLECTING',
  PAYING_OUT = 'PAYING_OUT',
  CYCLE_COMPLETE = 'CYCLE_COMPLETE',
  COMPLETED = 'COMPLETED',
  REFUNDING = 'REFUNDING',
  REFUNDED = 'REFUNDED',
  DISSOLVED = 'DISSOLVED',
}

export enum PayrollStatus {
  DRAFT = 'DRAFT',
  APPROVED = 'APPROVED',
  DISBURSING = 'DISBURSING',
  COMPLETED = 'COMPLETED',
  PARTIAL_FAILURE = 'PARTIAL_FAILURE',
  CANCELLED = 'CANCELLED',
}

export enum InvoiceStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PAID = 'PAID',
  OVERDUE = 'OVERDUE',
  REMINDER_SENT = 'REMINDER_SENT',
  CANCELLED = 'CANCELLED',
}
```

---

## User Context / Session

The existing `User` model manages session state.
**Add a `momotrustContext` field to the existing User model:**

```typescript
momotrustContext?: string  // e.g. 'TRUSTLOCK:dealId', 'NJANGI:groupId', etc.
momotrustContextUpdatedAt?: Date
```

Do NOT replace the existing context/session mechanism — add alongside it.

Context values:

```
'TRUSTLOCK:{id}'    → active deal
'NJANGI:{id}'       → active group
'SPLITCHAT:{id}'    → active pot
'PAYDAY:{id}'       → active payroll
'SAFIPAY:{id}'      → active invoice
'DISPUTE:{id}'      → collecting dispute evidence
```

---

## pawaPay Business Rules

- XAF integers only — always `Math.round()` before any pawaPay call
- Minimum: 500 XAF. Maximum: 5,000,000 XAF
- MoMo Trust fee: 1% per transaction (min 100 XAF, max 2,000 XAF)
- All pawaPay calls are async — state updates only via callback
- Store pawaPay UUID in DB BEFORE calling the API
- Bulk payout: max 20 per call — chunk arrays before calling
- Always return HTTP 200 immediately from callback handler
- Validate callback signature before processing

---

## Gemini AI (NEW — not in existing codebase)

Install: `npm install @google/generative-ai`
Add `GEMINI_API_KEY` to `.env`

Used for:

1. Dispute adjudication in TrustLock
2. Natural language parsing for PayDay and SafiPay

Create `src/services/gemini.service.ts` as a shared NestJS service.
Register in `src/shared/shared.module.ts`.

---

## Environment Variables to Add

```env
# Gemini (new)
GEMINI_API_KEY=your_gemini_api_key

# MoMo Trust fees
MOMOTRUST_FEE_PERCENT=0.01

# Support number
SUPPORT_WA_NUMBER=237XXXXXXXXX

# Flow IDs (add after registering new Flows in Meta dashboard)
FLOW_ID_TRUSTLOCK_CREATE=
FLOW_ID_NJANGI_CREATE=
FLOW_ID_SPLITCHAT_CREATE=
FLOW_ID_PAYDAY_CREATE=
FLOW_ID_SAFIPAY_CREATE=
FLOW_ID_DISPUTE_FILE=
```

---

## Sandbox Test Numbers (Cameroon)

| Phone        | Provider     | Deposit                       | Payout    |
| ------------ | ------------ | ----------------------------- | --------- |
| 237653456789 | MTN_MOMO_CMR | COMPLETED                     | COMPLETED |
| 237693456789 | ORANGE_CMR   | COMPLETED                     | COMPLETED |
| 237650000001 | MTN_MOMO_CMR | FAILED (PAYER_LIMIT_REACHED)  | —         |
| 237650000002 | MTN_MOMO_CMR | FAILED (INSUFFICIENT_BALANCE) | —         |

---

## Demo Script (Hackathon Day 3 — 4 minutes)

### Act 1 — TrustLock (1:00)

1. User texts → main menu → selects "🔒 Sécuriser un deal"
2. TrustLock Flow opens → fills title, amount 150 000 XAF, seller phone
3. Taps "Payer maintenant" → MTN sandbox deposit fires
4. Status: "🔒 Fonds sécurisés. Le vendeur a été notifié."
5. Seller receives notification
6. Buyer taps "Confirmer la livraison" → payout fires → "✅ Deal terminé!"

### Act 2 — NjangiBot (1:00)

1. Selects "💰 Mon njangi" → create group: 3 members, 5 000 XAF
2. Members join via "REJOINDRE NJ-XXXX"
3. All 3 pay → "🎊 14 850 XAF envoyés à Duclair!"

### Act 3 — PayDay (0:45)

1. Selects "💼 Payer mon équipe"
2. Voice: "paye Jean 15000, Marie 20000, Paul 12000"
3. Gemini parses → shows list → approve → 3 payouts fire simultaneously

### Act 4 — Platform vision (0:45)

1. Show full main menu with all features including existing remittance
2. "Ce n'est pas un chatbot. C'est une banque dans WhatsApp."
