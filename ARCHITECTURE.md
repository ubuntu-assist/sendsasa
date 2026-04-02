# SendSasa Technical Architecture

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                         WhatsApp User                            │
│                    (Sends: "Send 100 XRP to +237...")           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ WhatsApp Business API (Meta Cloud)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                SendSasa Backend (Node.js + TypeScript)           │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  routes/webhook.routes.ts                                   │ │
│ │  - Receives WhatsApp webhook                                │ │
│ │  - Validates Meta signature                                 │ │
│ │  - Extracts message content                                 │ │
│ └────────────────┬────────────────────────────────────────────┘ │
│                  │                                               │
│                  ▼                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  services/message-parser.service.ts                         │ │
│ │  - Parse: "Send 100 XRP to +237612345678"                   │ │
│ │  - Extract: action, amount, currency, recipient             │ │
│ └────────────────┬────────────────────────────────────────────┘ │
│                  │                                               │
│                  ▼                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  services/message-handler.service.ts                        │ │
│ │  - Route to appropriate service                             │ │
│ │  - Handle: SEND_MONEY, REQUEST_MONEY, BALANCE, etc.        │ │
│ └────────────────┬────────────────────────────────────────────┘ │
│                  │                                               │
│                  ▼                                               │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  services/wallet.service.ts (NEW - WEB3AUTH)                │ │
│ │  1. Normalize phone: "+237..." → E.164                      │ │
│ │  2. Check cache: Get addresses from User model              │ │
│ │  3. If not cached:                                          │ │
│ │     - Generate JWT (services/jwt-auth.service.ts)           │ │
│ │     - Connect to Web3Auth                                   │ │
│ │     - Extract secp256k1 key                                 │ │
│ │     - Derive EVM + XRPL addresses                           │ │
│ │     - Cache in MongoDB                                      │ │
│ └────────────────┬────────────────────────────────────────────┘ │
│                  │                                               │
│    ┌─────────────┴──────────────┐                               │
│    │                              │                               │
│    ▼                              ▼                               │
│ ┌──────────────────┐      ┌──────────────────┐                  │
│ │ services/        │      │ services/        │                  │
│ │ xrpl.service.ts  │      │ evm.service.ts   │                  │
│ │ (UPDATED)        │      │ (NEW)            │                  │
│ │                  │      │                  │                  │
│ │ - XRP payments   │      │ - BSC (BNB)      │                  │
│ │ - RLUSD          │      │ - BSC (USDT)     │                  │
│ │ - USDC on XRPL   │      │ - BSC (USDC)     │                  │
│ │ - Trustlines     │      │ - Base (ETH)     │                  │
│ │                  │      │ - Base (USDC)    │                  │
│ └──────┬───────────┘      └──────┬───────────┘                  │
│        │                         │                               │
│        │ Sign & Submit           │ Sign & Submit                │
│        ▼                         ▼                               │
└────────┼─────────────────────────┼───────────────────────────────┘
         │                         │
         ▼                         ▼
┌──────────────────┐      ┌──────────────────┐
│  XRP Ledger      │      │  EVM Chains      │
│  (XRPL Network)  │      │                  │
│                  │      │  - BSC Mainnet   │
│  Mainnet WSS:    │      │  - Base Mainnet  │
│  s1.ripple.com   │      │  - ETH Mainnet   │
└──────────────────┘      └──────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Web3Auth Infrastructure                       │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │         Web3Auth Auth Network (5/9 Threshold)               │ │
│ │  - 9 distributed nodes                                      │ │
│ │  - 5 nodes must agree to release key shares                 │ │
│ │  - No single node has complete private key                  │ │
│ │  - Reconstructs secp256k1 key server-side                   │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  Custom JWT Verifier: "sendsasa-whatsapp"                   │ │
│ │  - Validates JWT signature from JWKS endpoint               │ │
│ │  - Checks: iss, aud, exp, iat claims                        │ │
│ │  - Maps verifier_id (phone) → deterministic wallet          │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     MongoDB Database                             │
│                                                                   │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │  models/User.ts (UPDATED):                                  │ │
│ │  - phoneNumber (E.164)                                      │ │
│ │  - web3auth_verifier_id (E.164)                             │ │
│ │  - evm_address (cached 0x...)                               │ │
│ │  - xrpl_address (cached r...)                               │ │
│ │  - migration_status                                         │ │
│ │                                                              │ │
│ │  models/Transaction.ts:                                     │ │
│ │  - sender, recipient (User refs)                            │ │
│ │  - senderPhone, recipientPhone                              │ │
│ │  - amount, currency, chain                                  │ │
│ │  - txHash, status, timestamp                                │ │
│ │                                                              │ │
│ │  models/PaymentRequest.ts:                                  │ │
│ │  - requester, payer                                         │ │
│ │  - amount, currency, status                                 │ │
│ │                                                              │ │
│ │  models/MessageLog.ts:                                      │ │
│ │  - from, to, message, timestamp                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  JWKS Endpoint (routes/jwks.routes.ts)           │
│                                                                   │
│  GET /.well-known/jwks.json                                      │
│  {                                                                │
│    "keys": [{                                                     │
│      "kty": "RSA",                                                │
│      "kid": "sendsasa-key-1",                                     │
│      "use": "sig",                                                │
│      "alg": "RS256",                                              │
│      "n": "...", "e": "AQAB"                                      │
│    }]                                                             │
│  }                                                                │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Additional Services                           │
│                                                                   │
│  services/whatsapp.service.ts:                                   │
│  - Send messages, templates, interactive messages                │
│  - WhatsApp Business API wrapper                                 │
│                                                                   │
│  services/flow-launcher.service.ts:                              │
│  - Launch WhatsApp Flows (Send Money, Request Money UI)          │
│                                                                   │
│  services/flow-data-exchange.service.ts:                         │
│  - Handle Flow responses and data submission                     │
│                                                                   │
│  services/receipt-generator.service.ts:                          │
│  - Generate transaction receipts                                 │
│                                                                   │
│  services/whatsapp-menu.service.ts:                              │
│  - Interactive menu system                                       │
│                                                                   │
│  services/username.service.ts:                                   │
│  - Manage user display names                                     │
└─────────────────────────────────────────────────────────────────┘
```

## Existing Project Structure (Reference)

```
sendsasa/src/
├── models/
│   ├── index.ts
│   ├── MessageLog.ts
│   ├── PaymentRequest.ts
│   ├── Transaction.ts
│   └── User.ts                     # TO UPDATE
│
├── routes/
│   ├── cron.routes.ts
│   ├── flow.routes.ts
│   ├── webhook.routes.ts
│   └── jwks.routes.ts              # TO CREATE
│
├── services/
│   ├── database.service.ts
│   ├── flow-data-exchange.service.ts
│   ├── flow-launcher.service.ts
│   ├── message-handler.service.ts  # TO UPDATE
│   ├── message-parser.service.ts
│   ├── receipt-generator.service.ts
│   ├── username.service.ts
│   ├── whatsapp-menu.service.ts
│   ├── whatsapp.service.ts
│   ├── xrpl.service.ts             # TO UPDATE
│   ├── wallet.service.ts           # TO CREATE
│   ├── jwt-auth.service.ts         # TO CREATE
│   ├── evm.service.ts              # TO CREATE
│   └── phone-number.service.ts     # TO CREATE
│
├── types/
│   └── index.ts                    # TO UPDATE (add Web3Auth types)
│
├── utils/
│   ├── config.ts
│   ├── encryption.ts               # Legacy (will deprecate)
│   └── logger.ts
│
├── config/
│   ├── database.ts
│   ├── xrpl.ts
│   ├── web3auth.ts                 # TO CREATE
│   └── chains.ts                   # TO CREATE
│
└── middleware/
    ├── error-handler.ts
    ├── rate-limiter.ts
    └── validators.ts
```

## Data Flow: Complete Transaction (WhatsApp → Blockchain)

```
┌─ STEP 1: WhatsApp Message Received ─────────────────────────────┐
│                                                                   │
│  User sends: "Send 100 USDC to +237612345678"                   │
│  WhatsApp → POST /webhooks/whatsapp                              │
│  webhook.routes.ts validates Meta signature                      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 2: Parse Message ───────┴──────────────────────────────────┐
│                                                                   │
│  message-parser.service.ts:                                      │
│  {                                                                │
│    action: "SEND_MONEY",                                         │
│    amount: "100",                                                │
│    currency: "USDC",                                             │
│    recipient: "+237612345678",                                   │
│    sender: "+254712345678" (from WhatsApp webhook)               │
│  }                                                                │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 3: Route to Handler ────┴──────────────────────────────────┐
│                                                                   │
│  message-handler.service.ts:                                     │
│  - Check user exists in DB                                       │
│  - Determine chain: USDC → User preference or default            │
│  - For this example: BSC USDC                                    │
│  - Route to EVM service                                          │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 4: Normalize Phones ────┴──────────────────────────────────┐
│                                                                   │
│  phone-number.service.ts:                                        │
│  - "+254712345678" → validated E.164 ✓                           │
│  - "+237612345678" → validated E.164 ✓                           │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 5: Get Sender Wallet ───┴──────────────────────────────────┐
│                                                                   │
│  wallet.service.ts:                                              │
│  1. Check DB cache: User.findOne({ phoneNumber: "+254..." })     │
│     - Found: evm_address = "0xSender..."                         │
│     - Use cached address ✓                                       │
│                                                                   │
│  2. If not cached:                                               │
│     - jwt-auth.service.ts → Generate JWT                         │
│     - Web3Auth connect() → Get secp256k1 key                     │
│     - Derive EVM address: "0xSender..."                          │
│     - Save to DB cache                                           │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 6: Get Recipient Wallet ┴──────────────────────────────────┐
│                                                                   │
│  wallet.service.ts (same process):                               │
│  - Get or derive EVM address for "+237612345678"                 │
│  - Result: "0xRecipient..."                                      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 7: Check Balance ────────┴──────────────────────────────────┐
│                                                                   │
│  evm.service.ts:                                                 │
│  - Connect to BSC RPC: https://rpc.ankr.com/bsc                  │
│  - Contract: 0x8AC76a51... (USDC on BSC)                         │
│  - balanceOf(0xSender...)                                        │
│  - Result: 150 USDC ✓ (sufficient for 100 USDC transfer)        │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 8: Reconstruct Private Key ─────────────────────────────────┐
│                                                                   │
│  wallet.service.ts:                                              │
│  - Generate fresh JWT (new iat timestamp)                        │
│  - Web3Auth connect() for sender phone                           │
│  - Extract secp256k1 private key                                 │
│  - Key exists ONLY in memory for signing                         │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 9: Construct Transaction ┴──────────────────────────────────┐
│                                                                   │
│  evm.service.ts:                                                 │
│  - Token contract: USDC on BSC                                   │
│  - Method: transfer(0xRecipient..., 100 * 10^6) // 6 decimals   │
│  - Estimate gas: ~50,000 gas                                     │
│  - Get gas price: ~3 gwei                                        │
│  - Total fee: ~0.00015 BNB                                       │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 10: Sign Transaction ────┴──────────────────────────────────┐
│                                                                   │
│  evm.service.ts:                                                 │
│  - Create ethers.Wallet from private key                         │
│  - Sign transaction with private key                             │
│  - Broadcast to BSC network                                      │
│  - Result: TX Hash = "0xABC123..."                               │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 11: Save to Database ────┴──────────────────────────────────┐
│                                                                   │
│  Transaction.create({                                            │
│    senderId: "user_id_1",                                        │
│    recipientId: "user_id_2",                                     │
│    senderPhone: "+254712345678",                                 │
│    recipientPhone: "+237612345678",                              │
│    amount: "100",                                                │
│    currency: "USDC",                                             │
│    chain: "BSC",                                                 │
│    txHash: "0xABC123...",                                        │
│    status: "completed",                                          │
│    timestamp: "2026-04-01T10:30:00Z"                             │
│  })                                                               │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ STEP 12: Send WhatsApp Confirmations ────────────────────────────┐
│                                                                   │
│  whatsapp.service.ts:                                            │
│                                                                   │
│  To Sender (+254...):                                            │
│  "✅ Sent 100 USDC to +237612345678                              │
│   Chain: BSC                                                     │
│   TX: 0xABC123...                                                │
│   Fee: 0.00015 BNB                                               │
│   Time: 10:30 AM"                                                │
│                                                                   │
│  To Recipient (+237...):                                         │
│  "💰 Received 100 USDC from +254712345678                        │
│   Chain: BSC                                                     │
│   TX: 0xABC123...                                                │
│   Time: 10:30 AM"                                                │
│                                                                   │
│  Discard private key from memory ✓                               │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Key Derivation Flow (Multi-Chain Wallets)

```
User Identity: Phone Number "+254712345678"
    │
    │ services/phone-number.service.ts
    │ Normalize to E.164
    ▼
Phone Number (E.164): "+254712345678"
    │
    │ services/jwt-auth.service.ts
    │ Generate JWT with sub="+254712345678"
    │ Sign with RSA private key (RS256)
    ▼
JWT Token (signed, single-use)
    │
    │ config/web3auth.ts
    │ web3auth.connect(verifier, verifierId, idToken)
    ▼
Web3Auth Auth Network
    │
    │ Validates JWT against JWKS endpoint
    │ Reconstructs key from 5/9 nodes
    ▼
secp256k1 Base Private Key (32 bytes)
"4c0883a69102937d6231471b5dbb1aa2624c9a3f..."
    │
    │
    ├─────────────────────────┬──────────────────────┐
    │                         │                       │
    ▼                         ▼                       ▼
┌─────────┐          ┌─────────┐            ┌─────────┐
│   BSC   │          │  Base   │            │  XRPL   │
│         │          │         │            │         │
│  Use    │          │  Use    │            │ Convert │
│ secp256k1│          │ secp256k1│            │secp256k1│
│ directly │          │ directly │            │    ↓    │
│         │          │         │            │ ed25519 │
│         │          │         │            │         │
│ ethers  │          │ ethers  │            │ xrpl.js │
│ Wallet  │          │ Wallet  │            │ Wallet  │
│         │          │         │            │         │
│  0x1234 │          │  0x1234 │            │ rABC123 │
│   ...   │          │   ...   │            │   ...   │
│         │          │         │            │         │
│  SAME   │          │  SAME   │            │ UNIQUE  │
│ ADDRESS │          │ ADDRESS │            │ ADDRESS │
└─────────┘          └─────────┘            └─────────┘

All EVM chains           XRPL has different
(BSC, Base, ETH)        address format
share ONE address       but deterministic
```

## Authentication & Authorization Flow

```
┌─ Layer 1: WhatsApp Verification ──────────────────────────────────┐
│                                                                   │
│  Meta Cloud API validates webhook signature                      │
│  User's phone number verified by WhatsApp registration           │
│  SendSasa trusts phone number from WhatsApp                      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ Layer 2: JWT Generation ─────┴───────────────────────────────────┐
│                                                                   │
│  services/jwt-auth.service.ts:                                   │
│  - Load RSA private key from keys/privateKey.pem                 │
│  - Create JWT payload:                                           │
│    {                                                              │
│      "sub": "+254712345678",     // Phone from WhatsApp          │
│      "iss": "https://api.sendsasa.com",                          │
│      "aud": "urn:sendsasa-wallet",                               │
│      "iat": 1711234567,          // Current timestamp            │
│      "exp": 1711238167           // 1 hour expiry                │
│    }                                                              │
│  - Sign with RS256 algorithm                                     │
│  - Add kid header: "sendsasa-key-1"                              │
│  - Result: Signed JWT token                                      │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ Layer 3: Web3Auth Validation ┴───────────────────────────────────┐
│                                                                   │
│  Web3Auth Auth Network:                                          │
│  1. Receives JWT from SendSasa backend                           │
│  2. Fetches JWKS from:                                           │
│     https://api.sendsasa.com/.well-known/jwks.json               │
│  3. Extracts public key matching kid="sendsasa-key-1"            │
│  4. Verifies JWT signature using public key                      │
│  5. Validates claims:                                            │
│     - iss == "https://api.sendsasa.com" ✓                        │
│     - aud == "urn:sendsasa-wallet" ✓                             │
│     - exp > current_time ✓                                       │
│     - iat exists ✓                                               │
│  6. If valid: Returns key shares from 5/9 nodes                  │
│  7. If invalid: Throws "Invalid JWT" error                       │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ Layer 4: Key Reconstruction ─┴───────────────────────────────────┐
│                                                                   │
│  Web3Auth combines key shares into secp256k1 private key         │
│  Key deterministic from: (verifier, verifier_id) pair            │
│  Same phone number ALWAYS yields same private key                │
│                                                                   │
└───────────────────────────────┬───────────────────────────────────┘
                                │
┌─ Layer 5: Backend Usage ──────┴───────────────────────────────────┐
│                                                                   │
│  services/wallet.service.ts:                                     │
│  - Receives secp256k1 key from Web3Auth                          │
│  - Derives wallet addresses (EVM, XRPL)                          │
│  - Signs transactions                                            │
│  - Discards key after use                                        │
│  - NEVER stores key in database or logs                          │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Security Layers

### Layer 1: Network Security

- HTTPS/TLS 1.3 for all API communication
- WhatsApp webhook signature validation (Meta secret)
- Web3Auth API calls over encrypted channels
- JWKS endpoint served over HTTPS only
- RPC endpoints use WSS (WebSocket Secure) for XRPL

### Layer 2: Authentication

- Phone number verified by WhatsApp (cannot be spoofed)
- Custom JWT signed with RSA-2048 private key
- JWT validated by Web3Auth against public JWKS endpoint
- JWT single-use enforcement (duplicate tokens rejected)
- JWT expiry: 1 hour maximum

### Layer 3: Key Management

- Private keys NEVER stored anywhere
- Web3Auth uses 5/9 threshold network (distributed key shares)
- Keys reconstructed server-side only during signing
- Keys exist in memory for <2 seconds
- Addresses cached in database (deterministic, safe to store)

### Layer 4: Authorization

- Phone number → User ID mapping in database
- Transaction limits: Max 10,000 XAF per transaction
- Daily limits: Max 100,000 XAF per user per day
- Admin actions require separate authentication

### Layer 5: Data Protection

- MongoDB encryption at rest
- Private keys scrubbed from all logs
- JWT tokens never logged
- Transaction audit trail for all operations
- Regular security audits

## Error Handling Strategy

### Level 1: User Input Validation (Handled in services)

```typescript
// message-parser.service.ts
if (!phoneNumber.match(/^\+\d{10,15}$/)) {
  throw new ValidationError('Invalid phone number format')
}

if (amount <= 0 || amount > 1000000) {
  throw new ValidationError('Amount must be between 0 and 1,000,000')
}
```

### Level 2: External Service Errors (Retry + Fallback)

```typescript
// wallet.service.ts - Web3Auth connection
try {
  const provider = await web3auth.connect({
    verifier,
    verifierId,
    idToken,
  })
} catch (error) {
  if (error.message.includes('Duplicate token')) {
    // Regenerate JWT and retry
    const newToken = await jwtAuthService.generateToken(phone)
    return await this.retryConnect(verifier, verifierId, newToken)
  }
  throw new Web3AuthError('Wallet service unavailable')
}
```

### Level 3: Blockchain Errors (User-Friendly Messages)

```typescript
// evm.service.ts - Transaction failures
catch (error) {
  if (error.code === "INSUFFICIENT_FUNDS") {
    return {
      success: false,
      message: "Insufficient balance for transaction + gas fees"
    };
  }
  if (error.code === "NONCE_EXPIRED") {
    // Retry with updated nonce
    return await this.retryTransaction(tx, { nonce: await this.getNonce() });
  }
}
```

### Retry Configuration

- **Web3Auth connect()**: 3 retries, exponential backoff (1s, 2s, 4s)
- **XRPL submit**: 2 retries, 5s delay
- **BSC/EVM submit**: 2 retries, 10s delay
- **WhatsApp message send**: 5 retries, exponential backoff

## Performance Optimizations

### Database Indexing

```javascript
// models/User.ts
phoneNumber: { type: String, unique: true, index: true }
evm_address: { type: String, index: true }
xrpl_address: { type: String, index: true }
web3auth_verifier_id: { type: String, unique: true, sparse: true, index: true }

// models/Transaction.ts
senderId: { type: ObjectId, ref: 'User', index: true }
recipientId: { type: ObjectId, ref: 'User', index: true }
createdAt: { type: Date, index: true }
// Compound index for user transaction history
{ senderId: 1, createdAt: -1 }
```

### Caching Strategy

- **Wallet addresses**: Cache indefinitely in User model (deterministic)
- **RPC providers**: Connection pooling, reuse instances
- **Web3Auth SDK**: Singleton pattern, initialize once at startup
- **JWT generation**: No caching (must be fresh for each use)

### Expected Latencies

- **Address lookup (cached)**: <10ms (MongoDB query)
- **Address derivation (uncached)**: ~500ms (Web3Auth API call)
- **Transaction signing**: 50-200ms (local computation)
- **Transaction broadcast**: 1-3 seconds (network dependent)
- **End-to-end flow**: 3-5 seconds (WhatsApp → confirmation)

## Monitoring & Observability

### Key Metrics to Track

```typescript
// Business Metrics
- Transactions per hour/day
- Success rate by chain (XRPL vs BSC vs Base)
- Average transaction value
- Active users (DAU, MAU)
- User growth rate

// Technical Metrics
- Web3Auth API latency (p50, p95, p99)
- Web3Auth connection failures
- Database query time
- Transaction confirmation time
- Error rate by error type
- JWKS endpoint uptime

// Infrastructure
- CPU/Memory usage
- Network I/O
- MongoDB connections active
- RPC provider health
```

### Logging Format (Structured JSON)

```json
{
  "timestamp": "2026-04-01T10:30:00Z",
  "level": "info",
  "service": "wallet-service",
  "event": "transaction_completed",
  "userId": "user_123",
  "phone": "+254712***678",
  "txHash": "0xABC123...",
  "chain": "BSC",
  "currency": "USDC",
  "amount": "100",
  "duration_ms": 2340,
  "traceId": "trace-xyz"
}
```

**Log Scrubbing Rules**:

- ❌ Never log: Private keys, full JWT tokens, full phone numbers
- ✅ Always log: Transaction hashes, amounts, chains, errors, latencies
- ⚠️ Mask sensitive data: Phone numbers → "+254712\*\*\*678"

## Disaster Recovery

### Backup Strategy

- **MongoDB**: Daily full backup + hourly incremental (automated)
- **RSA Keys**: Encrypted backup in offline vault
- **Configuration**: Version controlled in Git
- **Web3Auth**: Keys are deterministic (phone number is recovery mechanism)

### Recovery Scenarios

**Scenario 1: Web3Auth API Down**

- **Impact**: Cannot derive new wallets or sign transactions
- **Action**: Wait for service restoration (99.9% uptime SLA)
- **Mitigation**: None immediate (keys are not stored locally)
- **User Communication**: "Wallet service temporarily unavailable"

**Scenario 2: Database Corruption**

- **Impact**: Lost cached addresses, transaction history
- **Recovery**: Restore from latest backup (max 1 hour data loss)
- **Re-derivation**: Cached addresses can be re-derived from Web3Auth

**Scenario 3: Lost RSA Private Key**

- **Impact**: Cannot generate new JWTs for Web3Auth
- **Recovery**:
  1. Generate new RSA key pair
  2. Update JWKS endpoint with new public key
  3. Update Web3Auth verifier configuration
  4. Users unaffected (existing wallets still accessible)

**Scenario 4: Complete System Failure**

- **RTO** (Recovery Time Objective): 4 hours
- **RPO** (Recovery Point Objective): 1 hour
- **Steps**:
  1. Deploy new instance from backup
  2. Restore database from latest backup
  3. Restore RSA keys from encrypted vault
  4. Verify JWKS endpoint accessible
  5. Test Web3Auth connection
  6. Resume operations

### Business Continuity

- **High Availability**: Plan for load balancer + multiple instances (future)
- **Failover**: Manual for now, automatic in future
- **Data Replication**: MongoDB replica set (3 nodes minimum)
- **Monitoring**: 24/7 uptime monitoring with PagerDuty alerts

---

## Next Steps

This architecture document should be used alongside:

- **claude.md** - Main project documentation for Claude Code
- **IMPLEMENTATION-ROADMAP.md** - Step-by-step implementation guide

All three documents together provide a complete picture of the Web3Auth integration for SendSasa.
