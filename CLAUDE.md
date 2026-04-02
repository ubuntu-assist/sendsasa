# SendSasa - WhatsApp Multi-Chain Wallet (Web3Auth Integration)

## Project Overview

SendSasa is a WhatsApp-based cryptocurrency wallet enabling peer-to-peer payments in Cameroon and across Africa. Users send money via WhatsApp chat commands without needing to understand blockchain technology.

**Current Phase**: Migrating from self-hosted encrypted wallet seeds to Web3Auth-managed wallet infrastructure for enhanced security and simplified key management.

## Tech Stack

- **Backend**: Node.js 20+ with TypeScript, Express.js
- **Database**: MongoDB with Mongoose ODM
- **Wallet Infrastructure**: Web3Auth SFA (Single Factor Auth) Node SDK
- **Blockchain Libraries**:
  - `ethers` v6 for EVM chains (BSC, Base, Ethereum)
  - `xrpl` v4.2.5+ for XRP Ledger
- **Authentication**: Custom JWT signed with RSA keys
- **WhatsApp Integration**: WhatsApp Business API via Meta Cloud API
- **Flows**: WhatsApp Flow JSON for interactive UIs (Send Money, Request Money)

## Supported Chains & Currencies

### XRPL (XRP Ledger)

- XRP (native)
- RLUSD (Ripple USD stablecoin)
- USDC (Circle stablecoin on XRPL)

### EVM Chains

**BNB Smart Chain (BSC)**:

- BNB (native)
- USDT (Tether)
- USDC (Circle)
- BUSD (Binance USD - deprecated but supported)

**Base** (Coinbase L2):

- ETH (native)
- USDC (Circle)

**Ethereum Mainnet**:

- ETH (native)
- USDC (Circle)

## Current Project Structure

```
sendsasa/
├── src/
│   ├── models/                          # MongoDB/Mongoose models
│   │   ├── index.ts                     # Export all models
│   │   ├── MessageLog.ts                # WhatsApp message logs
│   │   ├── PaymentRequest.ts            # Payment request tracking
│   │   ├── Transaction.ts               # Transaction records
│   │   └── User.ts                      # User schema (TO UPDATE)
│   │
│   ├── routes/
│   │   ├── cron.routes.ts
│   │   ├── flow.routes.ts               # WhatsApp Flow JSON endpoints
│   │   └── webhook.routes.ts            # WhatsApp webhooks
│   │
│   ├── services/
│   │   ├── database.service.ts          # MongoDB connection
│   │   ├── flow-data-exchange.service.ts # WhatsApp Flow data handling
│   │   ├── flow-launcher.service.ts     # Launch WhatsApp Flows
│   │   ├── message-handler.service.ts   # WhatsApp message routing
│   │   ├── message-parser.service.ts    # Parse WhatsApp messages
│   │   ├── receipt-generator.service.ts # Generate transaction receipts
│   │   ├── username.service.ts          # Username management
│   │   ├── whatsapp-menu.service.ts     # Interactive menu system
│   │   ├── whatsapp.service.ts          # WhatsApp API client
│   │   └── xrpl.service.ts              # XRPL transaction signing (TO UPDATE)
│   │
│   ├── types/
│   │   └── index.ts                     # TypeScript type definitions
│   │
│   ├── utils/
│   │   ├── config.ts                    # Environment configuration
│   │   ├── encryption.ts                # Legacy encryption utils
│   │   └── logger.ts                    # Logging utility
│   │
│   ├── config/
│   │   ├── database.ts                  # Database connection config
│   │   └── xrpl.ts                      # XRPL configuration
│   │
│   └── middleware/
│       ├── error-handler.ts             # Global error handler
│       ├── rate-limiter.ts              # API rate limiting
│       └── validators.ts                # Input validation
│
├── keys/                                 # TO CREATE
│   ├── privateKey.pem                   # RSA private key for JWT
│   └── publicKey.pem                    # RSA public key
│
├── .env.example
├── package.json
└── tsconfig.json
```

## Files to Create for Web3Auth Integration

### New Services

```
src/services/
├── wallet.service.ts          # Web3Auth wallet service (MAIN)
├── jwt-auth.service.ts        # Custom JWT generation
├── evm.service.ts             # EVM chains (BSC, Base, Ethereum)
└── phone-number.service.ts    # E.164 normalization
```

### New Routes

```
src/routes/
└── jwks.routes.ts             # JWKS endpoint for Web3Auth
```

### New Config

```
src/config/
├── web3auth.ts                # Web3Auth SDK initialization
└── chains.ts                  # Chain RPC URLs (BSC, Base, ETH)
```

### Updated Files

```
src/models/User.ts             # Add Web3Auth fields, remove encrypted seeds
src/services/xrpl.service.ts   # Update to use Web3Auth keys
```

## Implementation Status

### ✅ Already Implemented (Existing System)

- WhatsApp webhook handling (`webhook.routes.ts`)
- WhatsApp message parsing (`message-parser.service.ts`)
- WhatsApp message routing (`message-handler.service.ts`)
- WhatsApp Flows (interactive UIs) (`flow.routes.ts`, `flow-launcher.service.ts`)
- User management with MongoDB (`User.ts`)
- Transaction tracking (`Transaction.ts`)
- XRPL service with encrypted seeds (`xrpl.service.ts`)
- Receipt generation (`receipt-generator.service.ts`)
- Database service (`database.service.ts`)
- Error handling middleware (`error-handler.ts`)
- Rate limiting (`rate-limiter.ts`)

### 🔨 To Implement (Web3Auth Migration)

#### Priority 1: Core Infrastructure

- [ ] `src/config/web3auth.ts` - Web3Auth SDK initialization
- [ ] `src/config/chains.ts` - Chain configurations (BSC, Base, ETH, XRPL)
- [ ] `src/services/jwt-auth.service.ts` - Custom JWT generation
- [ ] `src/routes/jwks.routes.ts` - JWKS endpoint
- [ ] `keys/privateKey.pem` & `keys/publicKey.pem` - RSA key pair

#### Priority 2: Wallet Management

- [ ] `src/services/wallet.service.ts` - Main Web3Auth integration
- [ ] `src/services/phone-number.service.ts` - E.164 normalization
- [ ] `src/services/evm.service.ts` - EVM transaction signing
- [ ] Update `src/services/xrpl.service.ts` - Use Web3Auth keys

#### Priority 3: Data Layer

- [ ] Update `src/models/User.ts` - Add Web3Auth fields
- [ ] Database migration script - Add new fields to existing users
- [ ] Update `src/services/database.service.ts` if needed

#### Priority 4: Integration

- [ ] Update `src/services/message-handler.service.ts` - Use new wallet service
- [ ] Update transaction flows to use Web3Auth wallets
- [ ] Testing and validation

## Web3Auth Dashboard Setup Checklist

Before writing any code, complete these steps at https://dashboard.web3auth.io:

### 1. Create Project ✓

- [ ] Sign up / Log in to Web3Auth Dashboard
- [ ] Create Organization: "SendSasa"
- [ ] Create Project: "SendSasa WhatsApp Wallet"
- [ ] Network: `sapphire_devnet` (development) or `sapphire_mainnet` (production)
- [ ] Copy **Client ID** → Save to `.env` as `WEB3AUTH_CLIENT_ID`

### 2. Create Custom JWT Verifier ✓

- [ ] Navigate to **Custom Connections** → **Settings**
- [ ] Auth Connection ID: `sendsasa-whatsapp`
- [ ] JWKS Endpoint: `https://api.sendsasa.com/.well-known/jwks.json`
- [ ] JWT Verifier ID: `sub` (phone number in sub claim)
- [ ] Validation Rules:
  - `iss`: `https://api.sendsasa.com`
  - `aud`: `urn:sendsasa-wallet`
- [ ] Paste sample JWT to auto-populate
- [ ] Save and wait 10-20 minutes for deployment

### 3. Generate RSA Keys ✓

```bash
mkdir -p keys
openssl genrsa -out keys/privateKey.pem 2048
openssl rsa -in keys/privateKey.pem -pubout -out keys/publicKey.pem
chmod 600 keys/privateKey.pem
```

### 4. Configure JWKS Endpoint ✓

- [ ] Convert public key to JWKS format (use pem2jwk.vercel.app)
- [ ] Implement `src/routes/jwks.routes.ts`
- [ ] Deploy JWKS endpoint to production
- [ ] Test: `curl https://api.sendsasa.com/.well-known/jwks.json`

### 5. Enable Features ✓

- [ ] Project Settings → Advanced → **Key Export**: ON (recommended)
- [ ] Whitelist server domain: `api.sendsasa.com`

### 6. Upgrade Plan (Production) ✓

- [ ] Free tier: 1,000 MAW on `sapphire_devnet`
- [ ] Production requires **Growth Plan**: $69/month
- [ ] Custom JWT verifiers need Growth Plan
- [ ] Billing → Upgrade when ready for production

## Environment Variables (.env)

Add these to your existing `.env` file:

```env
# ============= WEB3AUTH CONFIGURATION =============
WEB3AUTH_CLIENT_ID=BPi5PB_UiI...                    # From dashboard.web3auth.io
WEB3AUTH_NETWORK=sapphire_devnet                    # or sapphire_mainnet
WEB3AUTH_VERIFIER=sendsasa-whatsapp                 # Custom verifier name

# ============= JWT CONFIGURATION =============
JWT_PRIVATE_KEY_PATH=./keys/privateKey.pem          # RSA private key
JWT_PUBLIC_KEY_PATH=./keys/publicKey.pem            # RSA public key
JWT_KID=sendsasa-key-1                              # Key ID (must match JWKS)
JWT_ISSUER=https://api.sendsasa.com                 # Your API domain
JWT_AUDIENCE=urn:sendsasa-wallet                    # Custom audience

# ============= CHAIN RPC URLS =============
BSC_RPC_URL=https://rpc.ankr.com/bsc
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://rpc.ankr.com/eth
XRPL_WSS_URL=wss://s1.ripple.com                   # XRPL Mainnet

# ============= EXISTING VARIABLES (Keep) =============
# MongoDB, WhatsApp, etc. - already in your .env
```

## Package Dependencies to Install

```bash
# Web3Auth packages
npm install @web3auth/single-factor-auth
npm install @web3auth/ethereum-provider
npm install @web3auth/xrpl-provider
npm install @web3auth/base
npm install @web3auth/base-provider

# Blockchain libraries
npm install ethers@6  # EVM chains
npm install xrpl@4    # XRP Ledger

# JWT & Crypto
npm install jsonwebtoken
npm install @types/jsonwebtoken --save-dev

# Utilities
npm install libphonenumber-js  # E.164 phone normalization
npm install @noble/secp256k1   # For XRPL key derivation
npm install @toruslabs/openlogin-ed25519  # secp256k1 → ed25519
```

## Database Schema Changes

### Current User Model (src/models/User.ts)

```typescript
// Fields to REMOVE (legacy encrypted seeds):
encryptedXRPLSeed: string
xrplSeedIV: string
xrplSeedAuthTag: string
encryptedBSCPrivateKey: string
bscPrivateKeyIV: string
bscPrivateKeyAuthTag: string
// ... all encryption-related fields
```

### New User Model (Web3Auth)

```typescript
// Fields to ADD:
web3auth_verifier: string;           // "sendsasa-whatsapp"
web3auth_verifier_id: string;        // E.164 phone number
evm_address: string;                  // Cached 0x... (same for BSC/Base/ETH)
xrpl_address: string;                 // Cached r...
wallet_created_at: Date;
migration_status: enum;               // "pending" | "completed" | "n/a"
old_wallet_exists: boolean;
```

## Critical Implementation Rules

### 1. Phone Number Normalization

**ALWAYS** normalize to E.164 before using as `verifier_id`:

```typescript
import { parsePhoneNumber } from 'libphonenumber-js'

function normalizePhone(phone: string, country: string = 'CM'): string {
  const parsed = parsePhoneNumber(phone, country)
  return parsed.number // Returns "+237612345678"
}
```

❌ Wrong: `"237612345678"`, `"0612345678"`  
✅ Correct: `"+237612345678"`

### 2. JWT Token Generation

Generate **fresh JWT** for every Web3Auth `connect()` call:

```typescript
// Include iat (issued at) - REQUIRED
// Tokens are single-use - Web3Auth rejects duplicates
```

### 3. Private Key Handling

```typescript
// ✅ DO:
- Derive keys on-demand when signing transactions
- Cache wallet addresses in database
- Discard keys immediately after signing

// ❌ DON'T:
- Store private keys in database
- Log private keys
- Keep keys in memory longer than needed
```

### 4. EVM Multi-Chain

All EVM chains share the **same address**:

```typescript
// User has ONE 0x... address for:
// - BSC (BNB, USDT, USDC, BUSD)
// - Base (ETH, USDC)
// - Ethereum (ETH, USDC)

// Store ONCE in database as evm_address
```

## Next Steps for Claude Code Implementation

1. **Read existing codebase**: Understand current services and models
2. **Create Web3Auth config**: `src/config/web3auth.ts`
3. **Implement JWT service**: `src/services/jwt-auth.service.ts`
4. **Create JWKS endpoint**: `src/routes/jwks.routes.ts`
5. **Build wallet service**: `src/services/wallet.service.ts`
6. **Update User model**: Add Web3Auth fields
7. **Test integration**: Verify wallet creation works

## Resources

- **Web3Auth Docs**: https://web3auth.io/docs/sdk/core-kit/sfa-node
- **Dashboard**: https://dashboard.web3auth.io
- **XRPL Docs**: https://js.xrpl.org
- **Ethers Docs**: https://docs.ethers.org/v6
- **Your Production API**: https://api.sendsasa.com

---

**Last Updated**: 2026-04-01  
**Phase**: Web3Auth Migration Implementation  
**Status**: Ready for Claude Code development
