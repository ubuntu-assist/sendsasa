# MoMo Trust — New Features Specification

Five features to add to the existing SendSasa WhatsApp platform.
Each is a self-contained NestJS module.

---

## Feature 1 — TrustLock (Marketplace Escrow)

### Module: `src/trustlock/`

```
src/trustlock/
├── trustlock.module.ts
├── trustlock.service.ts
├── trustlock-flow.service.ts
└── deal.schema.ts
```

### Flow: `flows/trustlock-create-flow.json` + `flows/trustlock-dispute-flow.json`

### State machine

```
PENDING_PAYMENT
  → (buyer taps pay) → PAYMENT_PROCESSING
  → (deposit COMPLETED callback) → ACTIVE
  → (buyer confirms) → RELEASING
  → (payout COMPLETED) → COMPLETED
  → (buyer disputes) → DISPUTED
    → (AI REFUND ≥ 0.75) → REFUNDING → REFUNDED
    → (AI RELEASE ≥ 0.75) → RELEASING → COMPLETED
    → (AI MANUAL or < 0.75) → MANUAL_REVIEW
  → (7 days no action) → EXPIRED
```

### Key methods in `trustlock.service.ts`

```typescript
createDeal(buyerPhone: string, data: CreateDealDto): Promise<Deal>
initiatePayment(dealId: string, buyerPhone: string): Promise<void>
onDepositCompleted(pawapayDepositId: string): Promise<void>
onDepositFailed(pawapayDepositId: string, code: string): Promise<void>
confirmDelivery(dealId: string, buyerPhone: string): Promise<void>
onPayoutCompleted(pawapayPayoutId: string): Promise<void>
fileDispute(dealId: string, phone: string, data: FileDisputeDto): Promise<Dispute>
receiveEvidence(disputeId: string, phone: string, mediaId: string): Promise<void>
adjudicateDispute(disputeId: string): Promise<void>
refundBuyer(dealId: string): Promise<void>
onRefundCompleted(pawapayRefundId: string): Promise<void>
handleMessage(phone: string, message: string, contextId: string): Promise<void>
getDealByDepositId(id: string): Promise<Deal | null>
getDealByPayoutId(id: string): Promise<Deal | null>
getDealByRefundId(id: string): Promise<Deal | null>
```

### WhatsApp messages to send (French)

**Deal created:**

```
✅ *Deal créé !*
📦 {{title}}
💰 Montant : {{amount}} XAF
💸 Frais : {{fee}} XAF
👤 Vendeur : {{maskedPhone}}
🔑 Code : *{{shortCode}}*
```

Buttons: [💳 Payer maintenant] [❌ Annuler]

**Funds secured (buyer):**

```
🔒 *Fonds sécurisés !*
{{amount}} XAF sécurisés. Le vendeur a été notifié.
Code : *{{shortCode}}*
```

**Seller notification (template):**

```
🔔 *Nouveau deal MoMo Trust !*
{{amount}} XAF sécurisés pour : {{title}}
Code : *{{shortCode}}*
Livrez pour recevoir votre paiement.
```

**Delivery confirmation prompt:**

```
📦 *Avez-vous reçu votre commande ?*
{{title}} · Code : {{shortCode}}
```

Buttons: [✅ Confirmer la livraison] [⚠️ Signaler un problème]

**Deal completed (buyer):** "🎉 Deal terminé ! Paiement libéré au vendeur."
**Deal completed (seller):** "💸 {{amount}} XAF reçus sur votre compte {{provider}} !"
**Dispute filed:** "⚠️ Litige ouvert. Envoyez des photos comme preuves."
**AI verdict REFUND:** "🤖 Remboursement recommandé ({{pct}}%). {{reasoning}}"
**AI verdict RELEASE:** "🤖 Libération des fonds recommandée ({{pct}}%). {{reasoning}}"
**AI verdict MANUAL:** "🤖 Révision manuelle requise. Notre équipe vous contacte sous 24h."

---

## Feature 2 — NjangiBot (Rotating Savings)

### Module: `src/njangi/`

```
src/njangi/
├── njangi.module.ts
├── njangi.service.ts
├── njangi-flow.service.ts
├── group.schema.ts
└── group-member.schema.ts
```

### Flow: `flows/njangi-create-flow.json`

### State machine

```
SETUP → ACTIVE → COLLECTING → PAYING_OUT
  → CYCLE_COMPLETE → COLLECTING (loop)
  → COMPLETED (all cycles done)
```

### Key methods in `njangi.service.ts`

```typescript
createGroup(adminPhone: string, data: CreateGroupDto): Promise<Group>
joinGroup(phone: string, shortCode: string): Promise<void>
startCycle(groupId: string): Promise<void>
collectContribution(groupId: string, memberPhone: string): Promise<void>
onMemberContributed(pawapayDepositId: string): Promise<void>
onAllContributed(groupId: string): Promise<void>
onPayoutCompleted(pawapayPayoutId: string): Promise<void>
getLedger(groupId: string, phone: string): Promise<void>
handleMessage(phone: string, message: string, contextId: string): Promise<void>
```

### WhatsApp messages

**Group created:**

```
🎉 *Njangi créé — {{name}}*
💰 Cotisation : {{amount}} XAF / {{cycleDays}} jours
👥 {{memberCount}} membres · {{totalCycles}} cycles
🔑 Code : *{{shortCode}}*
Partagez ce code avec vos membres.
```

**Invite text (send to admin to share):**

```
Rejoignez notre njangi *{{name}}* !
Cotisation : {{amount}} XAF / mois
Envoyez *REJOINDRE {{shortCode}}* à MoMo Trust.
```

**Member joined:** "✅ Vous avez rejoint {{name}} ! Votre tour : Cycle {{position}}/{{total}}"

**Contribution reminder (template):**

```
💳 Rappel njangi — {{name}}
Cotisation de {{amount}} XAF due aujourd'hui.
Ce mois : {{recipientName}} reçoit la cagnotte.
```

Button: [💳 Payer ma cotisation]

**Contribution confirmed:**

```
✅ Cotisation reçue — {{name}}
{{progressBar}} {{paid}}/{{total}} membres ont payé
```

**All paid — paying out:**

```
🎊 Tous ont payé ! {{totalPot}} XAF envoyés à {{recipientName}}.
```

**Payout received:**

```
💰 *C'est votre tour !*
{{amount}} XAF envoyés sur votre compte {{provider}} !
Njangi : {{name}} · Cycle {{current}}/{{total}}
```

**Ledger:**

```
📊 *{{name}} — Cycle {{current}}*
{{#each members}}{{paid ? '✅' : '⏳'}} {{name}}{{/each}}
💰 Collecté : {{collected}} / {{total}} XAF
```

---

## Feature 3 — SplitChat (Group Collections)

### Module: `src/splitchat/`

```
src/splitchat/
├── splitchat.module.ts
├── splitchat.service.ts
├── splitchat-flow.service.ts
└── (reuses group.schema.ts and group-member.schema.ts from njangi)
```

### Flow: `flows/splitchat-create-flow.json`

### State machine

```
COLLECTING → PAYING_OUT → COMPLETED
           → REFUNDING → REFUNDED (if cancelled)
```

### Key methods

```typescript
createPot(organizerPhone: string, data: CreatePotDto): Promise<Group>
joinPot(phone: string, shortCode: string): Promise<void>
onContributionReceived(pawapayDepositId: string): Promise<void>
closePot(groupId: string, organizerPhone: string): Promise<void>
onPayoutCompleted(pawapayPayoutId: string): Promise<void>
cancelPot(groupId: string, organizerPhone: string): Promise<void>
handleMessage(phone: string, message: string, contextId: string): Promise<void>
```

### WhatsApp messages

**Pot created:**

```
🎉 *Collecte lancée — {{name}}*
💰 {{amountPerPerson}} XAF / personne · {{participantCount}} participants
🏆 Objectif : {{targetAmount}} XAF
🔑 Code : *{{shortCode}}*
```

**Progress update (broadcast after each payment):**

```
💰 *{{name}}* — Mise à jour
{{progressBar}}
{{collected}} / {{target}} XAF — {{paid}}/{{total}} payé
```

**Pot completed (organizer):**

```
🎊 Collecte terminée !
{{amount}} XAF envoyés sur votre compte !
{{paid}}/{{total}} participants ont contribué.
```

---

## Feature 4 — PayDay (Bulk Payroll)

### Module: `src/payday/`

```
src/payday/
├── payday.module.ts
├── payday.service.ts
├── payday-flow.service.ts
└── payroll.schema.ts
```

### Flow: `flows/payday-create-flow.json`

### State machine

```
DRAFT → APPROVED → DISBURSING → COMPLETED | PARTIAL_FAILURE
```

### Key methods

```typescript
createPayroll(employerPhone: string, data: CreatePayrollDto): Promise<Payroll>
parsePayrollFromText(text: string): Promise<PayrollItem[]>   // Gemini NLP
approvePayroll(payrollId: string, employerPhone: string): Promise<void>
disburse(payrollId: string): Promise<void>
onItemPaid(pawapayPayoutId: string): Promise<void>
onItemFailed(pawapayPayoutId: string, code: string): Promise<void>
handleMessage(phone: string, message: string, contextId: string): Promise<void>
```

### Natural language parsing (Gemini)

Input: "paye Jean 653456789 15000, Marie 693456789 20000, Paul 654000001 12000"
Output: `[{ name: 'Jean', phone: '237653456789', amount: 15000 }, ...]`

### WhatsApp messages

**Payroll created:**

```
💼 *Paie créée — {{name}}*
👥 {{count}} employés · Total : {{total}} XAF
Vérifiez et approuvez pour envoyer.
```

Buttons: [✅ Approuver et envoyer] [👁 Voir la liste] [❌ Annuler]

**Payroll list:**

```
💼 *{{name}}* — Liste
{{#each items}}{{i}}. {{name || maskedPhone}} — {{amount}} XAF{{/each}}
Total : {{total}} XAF
```

**Disbursing:**

```
💸 Paiements en cours...
{{progressBar}} {{paid}}/{{total}} envoyés
```

**Completed:**

```
✅ *Paie terminée — {{name}}*
{{paid}}/{{total}} paiements réussis.
Total envoyé : {{totalSent}} XAF
{{#if failed}}⚠️ {{failed}} échoué(s). Tapez ECHECS {{shortCode}} pour voir.{{/if}}
```

**Payslip (to each employee — template):**

```
💰 Paiement reçu !
{{amount}} XAF de {{employerName}} via MoMo Trust PayDay.
Ref : {{shortCode}}
```

---

## Feature 5 — SafiPay (SME Invoicing + Collections)

### Module: `src/safipay/`

```
src/safipay/
├── safipay.module.ts
├── safipay.service.ts
├── safipay-flow.service.ts
└── invoice.schema.ts
```

### Flow: `flows/safipay-create-flow.json`

### State machine

```
DRAFT → SENT → PAID
             → OVERDUE → REMINDER_SENT → PAID
```

### Key methods

```typescript
createInvoice(merchantPhone: string, data: CreateInvoiceDto): Promise<Invoice>
parseInvoiceFromText(text: string): Promise<Partial<CreateInvoiceDto>>  // Gemini
onInvoicePaid(pawapayDepositId: string): Promise<void>
sendReminder(invoiceId: string): Promise<void>
listInvoices(merchantPhone: string): Promise<Invoice[]>
handleMessage(phone: string, message: string, contextId: string): Promise<void>
```

### WhatsApp messages

**Invoice created (merchant):**

```
🧾 *Facture créée — {{shortCode}}*
👤 {{clientName || maskedPhone}}
📋 {{description}}
💰 {{total}} XAF · Échéance : {{dueDate}}
Facture envoyée au client avec lien de paiement.
```

**Invoice to client (template):**

```
🧾 Facture de {{merchantName}}
{{description}}
💰 Montant dû : {{total}} XAF
Échéance : {{dueDate}} · Réf : {{shortCode}}
👉 Payer : {{paymentPageUrl}}
```

**Reminder (template):**

```
⏰ Rappel de paiement — {{shortCode}}
Facture impayée de {{total}} XAF auprès de {{merchantName}}.
👉 Payer : {{paymentPageUrl}}
```

**Invoice paid (merchant):**

```
✅ *Facture payée !*
{{total}} XAF reçus de {{clientName || maskedPhone}}.
Réf : {{shortCode}} · {{description}}
```

---

## Shared: GeminiService

### `src/services/gemini.service.ts`

```typescript
@Injectable()
export class GeminiService {
  // Dispute adjudication — returns RELEASE | REFUND | MANUAL_REVIEW
  async adjudicateDispute(params: AdjudicationParams): Promise<DisputeVerdict>

  // Parse payroll list from free text / voice
  async parsePayroll(text: string): Promise<PayrollItem[]>

  // Parse invoice from free text / voice
  async parseInvoice(text: string): Promise<Partial<CreateInvoiceDto>>
}
```

Register in `src/shared/shared.module.ts` so all modules can inject it.

---

## Menu Addition

In `src/whatsapp/whatsapp-menu.service.ts`, add a new section to the existing main menu list:

```
Section: "🏦 MoMo Trust"
  🔒 Sécuriser un deal        → trustlock
  💰 Mon njangi               → njangi
  🎉 Collecter pour un groupe → splitchat
  💼 Payer mon équipe         → payday
  🧾 Facturer un client       → safipay
```

In `src/webhook/message-handler.service.ts`, add routing for these 5 new menu selections to their respective service handlers.

---

## pawaPay Callback Extension

In the existing pawaPay callback handler (wherever it lives in the codebase), add routing for new transaction types:

```typescript
// After existing deposit/payout handlers, add:

// TrustLock deposits
const deal = await this.trustlockService.getDealByDepositId(depositId)
if (deal) {
  if (status === 'COMPLETED')
    await this.trustlockService.onDepositCompleted(depositId)
  if (status === 'FAILED')
    await this.trustlockService.onDepositFailed(depositId, failureCode)
  return
}

// NjangiBot / SplitChat member contributions
const member = await this.njangiService.getMemberByDepositId(depositId)
if (member) {
  if (status === 'COMPLETED')
    await this.njangiService.onMemberContributed(depositId)
  return
}

// ... similar for payouts (trustlock, njangi, splitchat, payday)
// ... and refunds (trustlock)
// ... and safipay invoices
```

---

## Cron Jobs (add to existing `src/cron/cron.service.ts`)

```typescript
// Expire deals older than 7 days with no action
@Cron('0 2 * * *')
async expireDeals() { ... }

// Send njangi contribution reminders
@Cron('0 8 * * *')
async njangiReminders() { ... }

// Send SafiPay overdue reminders (max 3 per invoice)
@Cron('0 9 * * *')
async safipayReminders() { ... }

// Reset stale momotrustContext (older than 30 min)
@Cron('*/30 * * * *')
async resetStaleContexts() { ... }
```
