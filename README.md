# SendSasa

**A WhatsApp-native remittance and financial services platform for Africa.**

SendSasa is built entirely inside WhatsApp — no app download, no onboarding friction. Users send money, pay payrolls, run savings circles, secure marketplace deals, and swap crypto through conversational menus and interactive Flows. The backend is a production NestJS service wired to pawaPay mobile money, the Meta WhatsApp Business Cloud API, and five blockchain networks.

---

## Features

### Core Remittance

Send and receive money across mobile money networks (MTN MoMo, Orange Money) with real-time FX rates and PDF receipts. Supports in-country transfers within Cameroon and cross-border remittance via XRPL and Stellar rails.

### 🔒 TrustLock — Marketplace Escrow

Buyer and seller agree on a deal. The buyer's funds are locked in escrow via pawaPay deposit. Once the buyer confirms delivery, funds are released to the seller. If there's a dispute, Gemini AI adjudicates based on submitted evidence and issues a verdict (release, refund, or manual review).

### 💰 NjangiBot — Rotating Savings (Tontine)

Members contribute a fixed amount each cycle. The pot rotates to each member in turn — sequentially, randomly, or by admin choice. All deposits and payouts flow through pawaPay. The system tracks cycles, paid status, and total contributed per member.

### 🎉 SplitChat — Group Collections

An organizer creates a group pot with a target amount and participant count. Members join by sending `JOIN <code>`. Once all members have paid, the full pot is automatically paid out to the organizer (minus the platform fee). The organizer can close early or cancel with automatic refunds.

### 💼 PayDay — Bulk Payroll

An employer creates a payroll — either manually or by sending a voice/text message like *"pay Jean 15000, Marie 20000, Paul 12000"* which Gemini AI parses into a recipient list. After approval, all payments disburse simultaneously: via a single atomic Stellar batch transaction (SEP-31, routed through Onafriq to MoMo) when configured, or via pawaPay bulk payout as fallback.

### 🧾 SafiPay — SME Invoicing

Merchants create invoices for clients with a description, amount, and due date. Clients receive a payment link. SafiPay tracks payment status, sends automated reminders, and notifies the merchant on payment. Invoice details can be parsed from natural language via Gemini AI.

### 💳 KoboKall — Instant Credit

Short-term credit product integrated into the WhatsApp flow. Users can request a credit advance backed by their transaction history.

### 🔄 Crypto Exchange

Users can swap between currencies and blockchain assets — XRP, USDC (Stellar/Solana/EVM), USDT, EURC — with real-time rates. Supports on-ramp (Coinbase card → crypto via headless iframe) and off-ramp (crypto → MoMo via Stellar anchor SEP-24 or direct payout).

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Framework** | NestJS (modular, decorator-driven) |
| **Database** | MongoDB Atlas via Mongoose |
| **Messaging** | Meta WhatsApp Business Cloud API — webhooks, interactive Flows, menus |
| **Mobile Money** | pawaPay (MTN MoMo CM, Orange CMR) — deposit, payout, bulk payout, refund |
| **Blockchain** | XRPL, Stellar (SEP-24/31, Soroban), EVM (BSC/Base/Ethereum), Solana, Lisk L2 |
| **Wallets** | Web3Auth — non-custodial key derivation (secp256k1 + Ed25519) |
| **AI** | Google Gemini — dispute adjudication, payroll/invoice NLP parsing |
| **On-ramp** | Coinbase Onramp — Apple Pay / Google Pay via headless iframe |
| **FX Rates** | Live USD/XAF rates with a Proxy-cached layer |
| **PDF Receipts** | PDFKit — generated and delivered via WhatsApp document message |

---

## Blockchain Support Matrix

| Network | Asset(s) | Use Cases |
|---|---|---|
| **XRPL** | XRP | Cross-border remittance, wallet creation |
| **Stellar** | USDC | Payroll batch (SEP-31, Onafriq), off-ramp anchor (SEP-24), TrustLock smart contract (Soroban) |
| **EVM** (BSC / Base / Ethereum) | USDC, USDT, ERC-20 | Crypto send, swap, on-ramp |
| **Solana** | USDC, USDT, EURC (SPL) | Crypto send, swap |
| **Lisk L2** | — | TrustLock smart contract, batch payroll contract |

All wallet keys are derived via Web3Auth from the user's WhatsApp phone number — no seed phrase required.

---

## Architecture

```
WhatsApp Cloud API
        │
        ▼
WebhookController ──► Chain of Responsibility (message handlers)
        │                    ├── AuthHandler        (registration, PIN)
        │                    ├── AccountHandler     (profile, history)
        │                    ├── TransferHandler    (send, receive)
        │                    ├── OfframpHandler     (off-ramp, card)
        │                    ├── CryptoHandler      (swap, crypto send)
        │                    └── FeaturesHandler    (TrustLock, Njangi, …)
        │
FlowController ──────► BaseFlowService (Template Method)
                              ├── TrustLockFlowService
                              ├── NjangiFlowService
                              └── …

Feature Services ────► Repository Layer ──► MongoDB Atlas
        │
        ├──► PawapayService ──► pawaPay API
        ├──► BlockchainFacadeService ──► XRPL / Stellar / EVM / Solana / Lisk
        ├──► GeminiService ──► Google Gemini API
        └──► appEmitter (Observer) ──► ReceiptGeneratorService
```

### Domain Collections

| Collection | Feature |
|---|---|
| `users` | All users; session context, wallet addresses, PIN hash, beneficiaries |
| `transactions` | Remittance and transfer history |
| `deals` | TrustLock escrow deals |
| `groups` | NjangiBot cycles + SplitChat pots |
| `groupmembers` | Per-member contribution tracking |
| `payrolls` | PayDay payroll runs with embedded recipient items |
| `invoices` | SafiPay invoices |
| `disputes` | TrustLock dispute evidence + AI verdict |

---

## Design Patterns

The codebase was restructured across six phases applying ten design patterns from [refactoring.guru](https://refactoring.guru/design-patterns).

### 1. Chain of Responsibility — Message Routing

The original 2,400-line god service was decomposed into a handler chain. Each handler declares `canHandle(msg, user)` and either processes the message or passes it to the next handler. The orchestrator (`MessageHandlerService`) assembles the chain and triggers it in ~80 lines.

**Files**: `src/messaging/webhook/handlers/`

### 2. Repository Pattern — Data Access Layer

All Mongoose queries are centralized in typed repository classes. Services never call Mongoose models directly. `BaseRepository` defines the contract; concrete repositories (`UserRepository`, `DealRepository`, etc.) implement it.

**Files**: `src/domain/repositories/`

### 3. Strategy Pattern — Payment Rail Selection

`PaymentRailService` acts as the context. It selects the appropriate payment strategy (pawaPay or Stellar) based on the user's operating region and available configuration. Both strategies implement the same `IMobileMoneyProvider` interface.

**Files**: `src/shared/services/payment-rail.service.ts`, `src/shared/services/mobile-money.service.ts`

### 4. Template Method — Flow Services

All WhatsApp Flow handlers share the same lifecycle: extract token → resolve user → dispatch to screen handler → return response. `BaseFlowService` defines this invariant skeleton. Each feature's flow service extends it and only implements `handleScreen()`.

**Files**: `src/messaging/flow/base-flow.service.ts`, `src/features/*/`

### 5. Facade Pattern — Blockchain Access

Feature services interact with a single `BlockchainFacadeService` instead of importing five individual chain services. The facade routes calls to the correct chain and exposes a clean, chain-agnostic interface (`send`, `getBalance`, `createWallet`).

**Files**: `src/blockchain/blockchain-facade.service.ts`

### 6. Observer Pattern — Event-Driven Side Effects

Receipt generation, WhatsApp notifications, and other side effects are decoupled from business logic via a Node.js `EventEmitter` singleton. Feature services emit events (`EVENTS.RECEIPT_SEND`); `ReceiptGeneratorService` subscribes and reacts independently.

**Files**: `src/shared/services/app-emitter.ts`, `src/shared/services/receipt-generator.service.ts`

### 7. State Pattern — Typed User Session Context

User session state was previously stored as a colon-delimited string (`'NJANGI:groupId'`), parsed with `indexOf(':')`. It is now a typed discriminated union serialized as JSON. The parser handles both formats for backward compatibility with existing database rows.

```typescript
type UserContext =
  | { type: 'KOBOKALL';    id: string }
  | { type: 'NJANGI';      groupId: string }
  | { type: 'SPLITCHAT';   groupId: string }
  | { type: 'PAYDAY';      payrollId: string }
  | { type: 'SAFIPAY';     invoiceId: string }
  | { type: 'DISPUTE';     disputeId: string }
  | { type: 'CRYPTO_SELL'; asset: string; amount?: string }
```

**Files**: `src/types/user.types.ts`, `src/domain/repositories/user.repository.ts`

### 8. Decorator Pattern — Guards, Pipes, Interceptors

NestJS's built-in decorator infrastructure applies cross-cutting concerns at the framework layer:
- `PinVerifyGuard` — bcrypt PIN verification (replaces inline duplication in 5+ handlers)
- `WebhookSignatureGuard` — HMAC signature validation on the webhook endpoint
- `ParsePhonePipe` — E.164 phone normalization at controller boundaries
- `LoggingInterceptor` — structured per-request timing logs

**Files**: `src/core/guards/`, `src/core/pipes/`, `src/core/interceptors/`

### 9. Proxy Pattern — Cached FX Rates

`CachedFxRateService` wraps the real `FxRateService` and adds a 5-minute in-memory TTL cache. Both implement `IFxRateService`, so callers are unaware of the proxy. Registered in `SharedModule` as the canonical `FxRateService` provider.

**Files**: `src/shared/services/fx-rate-cache.proxy.ts`

### 10. Adapter Pattern — Third-Party API Wrappers

`PawapayAdapter` and `GeminiAdapter` translate between stable internal interfaces (`IPaymentGateway`, `IAIService`) and vendor-specific API shapes. Feature services depend on the internal interfaces, not on vendor contracts.

**Files**: `src/payments/pawapay/pawapay-adapter.ts`, `src/shared/services/gemini-adapter.ts`

---

## Project Structure

```
src/
├── app.module.ts
├── main.ts
├── config/
├── core/
│   ├── guards/           PinVerifyGuard, WebhookSignatureGuard
│   ├── pipes/            ParsePhonePipe, ParseAmountPipe
│   ├── interceptors/     LoggingInterceptor
│   ├── cron/
│   ├── health/
│   └── filters/
├── common/
│   ├── helpers/          fee calculator, short-code generator
│   ├── middleware/
│   └── utils/            logger
├── domain/
│   ├── models/           user, transaction, payment-request, …
│   └── repositories/     base, user, transaction, deal, group, payroll, invoice
├── messaging/
│   ├── flow/             BaseFlowService, FlowDataExchangeService, FlowController
│   ├── whatsapp/         WhatsAppService, MenuService, MessageParser
│   └── webhook/
│       ├── handlers/     BaseHandler, Auth, Account, Transfer, Offramp, Crypto, Features
│       ├── webhook.controller.ts
│       └── momotrust-router.ts
├── payments/
│   ├── pawapay/          PawapayService, PawapayAdapter, callback controller
│   └── payment/          PaymentController, templates/
├── blockchain/
│   ├── blockchain-facade.service.ts
│   ├── chains/           EVMService, SolanaService, WalletService, XrplService
│   ├── stellar/          StellarService, StellarAnchorService, SorobanTrustLockService
│   ├── lisk/             LiskTrustLockService, PaydayBatchService
│   ├── bridge/
│   └── dex/
├── shared/
│   └── services/
│       ├── gemini.service.ts
│       ├── gemini-adapter.ts
│       ├── fx-rate.service.ts
│       ├── fx-rate-cache.proxy.ts
│       ├── mobile-money.service.ts
│       ├── payment-rail.service.ts
│       ├── receipt-generator.service.ts
│       └── app-emitter.ts
├── features/
│   ├── trustlock/        TrustLockService, TrustLockFlowService, schemas
│   ├── njangi/           NjangiService, NjangiFlowService, schemas
│   ├── splitchat/        SplitChatService, SplitChatFlowService, schemas
│   ├── payday/           PayDayService, PayDayFlowService, schemas
│   ├── safipay/          SafiPayService, SafiPayFlowService, schemas
│   ├── kobokall/         KoboKallService
│   └── crypto-exchange/  CryptoExchangeService
├── onramp/
└── types/
    ├── index.ts           barrel
    ├── user.types.ts      IUser, UserContext, parseUserContext
    ├── transaction.types.ts
    ├── payment.types.ts   enums (DealStatus, GroupStatus, …)
    └── feature.types.ts   DTOs for all 5 features
```

---

## Setup

### Prerequisites

- Node.js 20+
- pnpm
- MongoDB Atlas cluster
- Meta WhatsApp Business App with Cloud API access
- pawaPay merchant account (sandbox or live)

### Install

```bash
pnpm install
```

### Environment Variables

```env
# MongoDB
MONGODB_URI=mongodb+srv://...

# WhatsApp Cloud API
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=

# pawaPay
PAWAPAY_API_KEY=
PAWAPAY_CALLBACK_URL=https://your-domain/payments/pawapay/callback

# Web3Auth
WEB3AUTH_CLIENT_ID=

# Blockchain
XRPL_SEED=
STELLAR_SECRET=
EVM_PRIVATE_KEY=
SOLANA_SEED_HEX=
ONAFRIQ_DISTRIBUTION_ACCOUNT=

# Gemini AI
GEMINI_API_KEY=

# Coinbase Onramp
COINBASE_APP_ID=

# Platform
MOMOTRUST_FEE_PERCENT=0.01
SUPPORT_WA_NUMBER=237XXXXXXXXX

# WhatsApp Flow IDs (after registering in Meta dashboard)
FLOW_ID_TRUSTLOCK_CREATE=
FLOW_ID_NJANGI_CREATE=
FLOW_ID_SPLITCHAT_CREATE=
FLOW_ID_PAYDAY_CREATE=
FLOW_ID_SAFIPAY_CREATE=
FLOW_ID_DISPUTE_FILE=
```

### Run

```bash
# Development
pnpm start:dev

# Production build
pnpm build
pnpm start:prod
```

---

## pawaPay Sandbox Numbers (Cameroon)

| Phone | Provider | Deposit | Payout |
|---|---|---|---|
| 237653456789 | MTN_MOMO_CMR | COMPLETED | COMPLETED |
| 237693456789 | ORANGE_CMR | COMPLETED | COMPLETED |
| 237650000001 | MTN_MOMO_CMR | FAILED (PAYER_LIMIT_REACHED) | — |
| 237650000002 | MTN_MOMO_CMR | FAILED (INSUFFICIENT_BALANCE) | — |

---

## Business Rules

- Currency: XAF integers only — all amounts are `Math.round()`-ed before any pawaPay call
- Range: 500 XAF minimum, 5,000,000 XAF maximum per transaction
- Platform fee: 1% (min 100 XAF, max 2,000 XAF)
- All pawaPay calls are async — state updates only via signed callback
- pawaPay UUID stored in DB **before** the API call
- Bulk payout: max 20 recipients per call — arrays are chunked automatically
- Callback handler always returns HTTP 200 immediately
- Callback HMAC signature validated before processing
