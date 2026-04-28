# Web3Auth Integration Roadmap for SendSasa

## Overview

This document provides a step-by-step implementation plan for migrating SendSasa from self-hosted encrypted wallets to Web3Auth-managed wallet infrastructure.

**Estimated Time**: 2-3 weeks for full implementation and testing

---

## Phase 1: Setup & Infrastructure (Days 1-2)

### Step 1.1: Web3Auth Dashboard Configuration

**Time**: 1-2 hours

1. Go to https://dashboard.web3auth.io
2. Create account / Sign in
3. Create Organization: "SendSasa"
4. Create Project: "SendSasa WhatsApp Wallet"
5. Select Network: `sapphire_devnet` (for development)
6. **Copy Client ID** and save securely

### Step 1.2: Generate RSA Key Pair

**Time**: 15 minutes

```bash
# In your sendsasa project root:
mkdir -p keys
cd keys
openssl genrsa -out privateKey.pem 2048
openssl rsa -in privateKey.pem -pubout -out publicKey.pem
chmod 600 privateKey.pem
cd ..
```

Add to `.gitignore`:

```
keys/privateKey.pem
keys/publicKey.pem
```

### Step 1.3: Convert Public Key to JWKS Format

**Time**: 15 minutes

Option A: Use online tool

1. Go to https://pem2jwk.vercel.app
2. Upload `keys/publicKey.pem`
3. Copy the JWK output
4. Save to `keys/jwks.json` for reference

Option B: Use Node.js script (recommended)

```bash
npm install jose
node scripts/generate-jwks.js
```

### Step 1.4: Install Dependencies

**Time**: 10 minutes

```bash
npm install @web3auth/single-factor-auth @web3auth/ethereum-provider @web3auth/xrpl-provider @web3auth/base @web3auth/base-provider ethers@6 xrpl@4 jsonwebtoken libphonenumber-js @noble/secp256k1 @toruslabs/openlogin-ed25519

npm install --save-dev @types/jsonwebtoken
```

### Step 1.5: Add Environment Variables

**Time**: 10 minutes

Add to `.env`:

```env
# Web3Auth
WEB3AUTH_CLIENT_ID=YOUR_CLIENT_ID_HERE
WEB3AUTH_NETWORK=sapphire_devnet
WEB3AUTH_VERIFIER=sendsasa-whatsapp

# JWT
JWT_PRIVATE_KEY_PATH=./keys/privateKey.pem
JWT_PUBLIC_KEY_PATH=./keys/publicKey.pem
JWT_KID=sendsasa-key-1
JWT_ISSUER=https://api.sendsasa.com
JWT_AUDIENCE=urn:sendsasa-wallet

# Chains
BSC_RPC_URL=https://rpc.ankr.com/bsc
BASE_RPC_URL=https://mainnet.base.org
ETHEREUM_RPC_URL=https://rpc.ankr.com/eth
XRPL_WSS_URL=wss://xrplcluster.com
```

**Checkpoint**: ✅ Dependencies installed, keys generated, environment configured

---

## Phase 2: Core Services Implementation (Days 3-5)

### Step 2.1: Create Chain Configuration

**File**: `src/config/chains.ts`

**Implementation**: Configure RPC endpoints for all chains (BSC, Base, Ethereum, XRPL)

**Claude Code Task**: "Create src/config/chains.ts with RPC configurations for BSC, Base, Ethereum, and XRPL using environment variables"

### Step 2.2: Create JWT Authentication Service

**File**: `src/services/jwt-auth.service.ts`

**Implementation**:

- Load RSA private key
- Generate JWT with phone number as `sub` claim
- Include `iat`, `exp`, `iss`, `aud` claims
- Sign with RS256 algorithm

**Claude Code Task**: "Create src/services/jwt-auth.service.ts that generates custom JWTs for Web3Auth using RSA signature with phone number as subject"

### Step 2.3: Create JWKS Endpoint

**File**: `src/routes/jwks.routes.ts`

**Implementation**:

- Load RSA public key
- Convert to JWK format
- Serve at `/.well-known/jwks.json`
- Include `kid`, `use`, `alg` fields

**Claude Code Task**: "Create src/routes/jwks.routes.ts that serves the public key in JWKS format at /.well-known/jwks.json"

### Step 2.4: Create Web3Auth Configuration

**File**: `src/config/web3auth.ts`

**Implementation**:

- Initialize Web3Auth SDK with `SDK_MODE.NODE`
- Configure EthereumPrivateKeyProvider
- Export singleton instance
- Handle initialization errors

**Claude Code Task**: "Create src/config/web3auth.ts that initializes the Web3Auth SFA Node SDK with proper configuration for server-side use"

### Step 2.5: Create Phone Number Normalization Service

**File**: `src/services/phone-number.service.ts`

**Implementation**:

- Parse phone numbers using libphonenumber-js
- Normalize to E.164 format
- Handle Cameroon (+237) and other African countries
- Validate format

**Claude Code Task**: "Create src/services/phone-number.service.ts that normalizes phone numbers to E.164 format for use as Web3Auth verifier IDs"

**Checkpoint**: ✅ Core infrastructure services created and tested

---

## Phase 3: Wallet Service Implementation (Days 6-8)

### Step 3.1: Create Main Wallet Service

**File**: `src/services/wallet.service.ts`

**Implementation**:

- Connect to Web3Auth using JWT
- Extract secp256k1 private key
- Derive EVM address (0x...)
- Derive XRPL address (r...)
- Cache addresses in database
- Handle errors gracefully

**Claude Code Task**: "Create src/services/wallet.service.ts that integrates with Web3Auth to derive both EVM and XRPL wallet addresses from a phone number"

**Key Methods**:

```typescript
class WalletService {
  async getOrCreateWallets(phoneNumber: string): Promise<{
    evmAddress: string
    xrplAddress: string
  }>

  async getPrivateKey(phoneNumber: string): Promise<string>

  async deriveXRPLWallet(secp256k1Key: string): Promise<XrplWallet>

  async deriveEVMWallet(secp256k1Key: string): Promise<ethers.Wallet>
}
```

### Step 3.2: Create EVM Service

**File**: `src/services/evm.service.ts`

**Implementation**:

- Support BSC, Base, Ethereum
- ERC-20 token transfers (USDT, USDC, BUSD)
- Native token transfers (BNB, ETH)
- Gas estimation
- Transaction signing
- Error handling

**Claude Code Task**: "Create src/services/evm.service.ts that handles transaction signing for BSC, Base, and Ethereum chains using ethers.js"

**Key Methods**:

```typescript
class EVMService {
  async transferToken(
    privateKey: string,
    chain: 'bsc' | 'base' | 'ethereum',
    tokenAddress: string,
    to: string,
    amount: string,
  ): Promise<TransactionReceipt>

  async transferNative(
    privateKey: string,
    chain: 'bsc' | 'base' | 'ethereum',
    to: string,
    amount: string,
  ): Promise<TransactionReceipt>

  async getBalance(
    address: string,
    chain: string,
    tokenAddress?: string,
  ): Promise<string>
}
```

### Step 3.3: Update XRPL Service

**File**: `src/services/xrpl.service.ts`

**Implementation**:

- Remove encrypted seed logic
- Accept secp256k1 key parameter
- Convert to XRPL format (ed25519)
- Keep existing transaction methods
- Update error messages

**Claude Code Task**: "Update src/services/xrpl.service.ts to use Web3Auth-derived keys instead of encrypted seeds, converting secp256k1 to XRPL format"

**Checkpoint**: ✅ Wallet services created, transaction signing working

---

## Phase 4: Database Schema Update (Day 9)

### Step 4.1: Update User Model

**File**: `src/models/User.ts`

**Changes**:

```typescript
// ADD these fields:
web3auth_verifier: {
  type: String,
  default: 'sendsasa-whatsapp'
},
web3auth_verifier_id: {
  type: String,  // E.164 phone number
  unique: true,
  sparse: true
},
evm_address: {
  type: String,  // 0x...
  index: true
},
xrpl_address: {
  type: String,  // r...
  index: true
},
wallet_created_at: Date,
migration_status: {
  type: String,
  enum: ['pending', 'completed', 'n/a'],
  default: 'n/a'
},
old_wallet_exists: {
  type: Boolean,
  default: false
},

// KEEP these fields for migration:
// encryptedXRPLSeed, etc. (will remove later)
```

**Claude Code Task**: "Update src/models/User.ts to add Web3Auth fields (web3auth_verifier_id, evm_address, xrpl_address) while keeping legacy encrypted seed fields for migration"

### Step 4.2: Create Database Migration Script

**File**: `scripts/migrate-to-web3auth.ts`

**Implementation**:

- Add new Web3Auth fields to all existing users
- Set `migration_status` to 'pending'
- Mark users with encrypted seeds as `old_wallet_exists: true`
- Create indexes on new address fields

**Claude Code Task**: "Create scripts/migrate-to-web3auth.ts that adds Web3Auth fields to existing users in MongoDB and prepares them for migration"

**Checkpoint**: ✅ Database schema updated, migration script ready

---

## Phase 5: Integration & Testing (Days 10-12)

### Step 5.1: Update Message Handler

**File**: `src/services/message-handler.service.ts`

**Changes**:

- Replace encrypted wallet calls with Web3Auth wallet service
- Update balance check logic
- Update transaction creation logic
- Handle migration cases (users with old wallets)

**Claude Code Task**: "Update src/services/message-handler.service.ts to use the new wallet.service.ts instead of encrypted seed logic"

### Step 5.2: Test Wallet Creation

**Test Script**: `scripts/test-wallet-creation.ts`

```typescript
// Test: Create wallet for new user
const phoneNumber = '+237612345678'
const wallets = await walletService.getOrCreateWallets(phoneNumber)
console.log('EVM Address:', wallets.evmAddress)
console.log('XRPL Address:', wallets.xrplAddress)

// Verify determinism
const wallets2 = await walletService.getOrCreateWallets(phoneNumber)
assert(wallets.evmAddress === wallets2.evmAddress)
assert(wallets.xrplAddress === wallets2.xrplAddress)
```

### Step 5.3: Test Transaction Signing

**BSC Test**:

```typescript
// Test: Sign BSC USDT transfer
const tx = await evmService.transferToken(
  privateKey,
  'bsc',
  '0x55d398326f99059fF775485246999027B3197955', // USDT
  recipientAddress,
  '10',
)
console.log('TX Hash:', tx.hash)
```

**XRPL Test**:

```typescript
// Test: Sign XRPL payment
const result = await xrplService.sendXRP(secp256k1Key, recipientAddress, '10')
console.log('XRPL TX Hash:', result.hash)
```

### Step 5.4: E2E Testing via WhatsApp

1. Send WhatsApp message: "Send 1 USDC to +237612345678"
2. Verify transaction completes
3. Check both sender and recipient receive confirmations
4. Verify transaction saved in database

**Checkpoint**: ✅ All services integrated, E2E tests passing

---

## Phase 6: Web3Auth Dashboard Finalization (Day 13)

### Step 6.1: Create Custom JWT Verifier

1. Go to Web3Auth Dashboard → Custom Connections
2. Click Settings → Create new connection
3. Auth Connection ID: `sendsasa-whatsapp`
4. JWKS Endpoint: `https://api.sendsasa.com/.well-known/jwks.json`
5. JWT Verifier ID: `sub`
6. Add validations:
   - `iss` → `https://api.sendsasa.com`
   - `aud` → `urn:sendsasa-wallet`
7. Paste sample JWT to auto-populate
8. Save and wait 10-20 minutes

### Step 6.2: Test JWT Validation

```bash
# Generate test JWT
npm run generate-jwt "+237612345678"

# Test Web3Auth connection
npm run test:web3auth "+237612345678"
```

### Step 6.3: Enable Key Export (Optional)

- Dashboard → Project Settings → Advanced
- Toggle "Key Export" to ON
- This allows disaster recovery

**Checkpoint**: ✅ Custom verifier deployed, JWT validation working

---

## Phase 7: Production Deployment (Days 14-15)

### Step 7.1: Deploy JWKS Endpoint to Production

```bash
# Deploy to production server
git push production main

# Verify JWKS endpoint
curl https://api.sendsasa.com/.well-known/jwks.json

# Should return:
{
  "keys": [{
    "kty": "RSA",
    "kid": "sendsasa-key-1",
    "use": "sig",
    "alg": "RS256",
    "n": "...",
    "e": "AQAB"
  }]
}
```

### Step 7.2: Update Web3Auth Verifier with Production JWKS

1. Dashboard → Custom Connections → Edit verifier
2. Update JWKS Endpoint: `https://api.sendsasa.com/.well-known/jwks.json`
3. Save and wait for deployment

### Step 7.3: Switch to Production Network

Update `.env`:

```env
WEB3AUTH_NETWORK=sapphire_mainnet  # Changed from sapphire_devnet
```

### Step 7.4: Upgrade to Growth Plan

- Dashboard → Billing
- Upgrade to Growth Plan ($69/month)
- Required for custom JWT verifiers in production

### Step 7.5: Test with Real Users (Beta)

1. Select 5-10 test users
2. Create Web3Auth wallets
3. Send small test transactions
4. Verify everything works smoothly
5. Monitor logs for errors

**Checkpoint**: ✅ Production deployment complete, beta users testing

---

## Phase 8: User Migration (Days 16-21)

### Step 8.1: Migrate Users in Batches

```typescript
// Process 100 users at a time
for (const batch of userBatches) {
  for (const user of batch) {
    try {
      // 1. Create Web3Auth wallets
      const wallets = await walletService.getOrCreateWallets(user.phoneNumber)

      // 2. Update user document
      await User.updateOne(
        { _id: user._id },
        {
          evm_address: wallets.evmAddress,
          xrpl_address: wallets.xrplAddress,
          web3auth_verifier_id: user.phoneNumber,
          migration_status: 'pending',
        },
      )

      // 3. Transfer assets from old wallet to new wallet
      if (user.old_wallet_exists) {
        await transferAssets(user.oldWallet, wallets)
      }

      // 4. Mark complete
      await User.updateOne({ _id: user._id }, { migration_status: 'completed' })

      console.log(`✅ Migrated user: ${user.phoneNumber}`)
    } catch (error) {
      console.error(`❌ Failed to migrate ${user.phoneNumber}:`, error)
    }
  }

  // Wait 5 seconds between batches
  await new Promise((resolve) => setTimeout(resolve, 5000))
}
```

### Step 8.2: Monitor Migration Progress

```typescript
// Check migration status
const stats = await User.aggregate([
  {
    $group: {
      _id: '$migration_status',
      count: { $sum: 1 },
    },
  },
])

console.log('Migration Status:', stats)
// Output:
// [
//   { _id: 'completed', count: 850 },
//   { _id: 'pending', count: 50 },
//   { _id: 'n/a', count: 100 }
// ]
```

### Step 8.3: Handle Migration Failures

- Log all failed migrations
- Retry with exponential backoff
- Manual intervention for persistent failures
- Keep old wallets accessible during transition

**Checkpoint**: ✅ All users migrated to Web3Auth wallets

---

## Phase 9: Cleanup & Documentation (Days 22-23)

### Step 9.1: Remove Legacy Code

After 100% migration confirmed:

```typescript
// Remove from User model:
// - encryptedXRPLSeed
// - xrplSeedIV
// - xrplSeedAuthTag
// - encryptedBSCPrivateKey
// - bscPrivateKeyIV
// - bscPrivateKeyAuthTag

// Remove files:
// - src/utils/encryption.ts (legacy)
```

### Step 9.2: Update Documentation

- Update README with Web3Auth architecture
- Document wallet creation process
- Document transaction flow
- Add troubleshooting guide

### Step 9.3: Set Up Monitoring

- Web3Auth API latency alerts
- Transaction failure rate alerts
- JWKS endpoint health checks
- Database query performance monitoring

**Checkpoint**: ✅ Legacy code removed, documentation updated

---

## Success Criteria

- [ ] All new users get Web3Auth wallets automatically
- [ ] 100% of existing users migrated successfully
- [ ] Transaction success rate >95%
- [ ] Average wallet creation time <2 seconds
- [ ] No private keys stored in database
- [ ] JWKS endpoint has 99.9% uptime
- [ ] Web3Auth API calls have <500ms p95 latency
- [ ] Zero security incidents during migration

---

## Rollback Plan (Emergency)

If critical issues occur during migration:

1. **Stop new wallet creation**: Feature flag to disable Web3Auth
2. **Revert to old wallets**: Users can still use encrypted seeds
3. **Database rollback**: Restore pre-migration backup
4. **Investigate**: Analyze logs to find root cause
5. **Fix and retry**: Address issues, then resume migration

---

## Timeline Summary

| Phase                     | Duration | Key Deliverables                                     |
| ------------------------- | -------- | ---------------------------------------------------- |
| 1. Setup & Infrastructure | 2 days   | Keys generated, deps installed, dashboard configured |
| 2. Core Services          | 3 days   | JWT auth, JWKS endpoint, Web3Auth config             |
| 3. Wallet Service         | 3 days   | Main wallet service, EVM service, XRPL update        |
| 4. Database Schema        | 1 day    | User model updated, migration script ready           |
| 5. Integration & Testing  | 3 days   | Services integrated, E2E tests passing               |
| 6. Dashboard Finalization | 1 day    | Custom verifier deployed                             |
| 7. Production Deployment  | 2 days   | JWKS live, beta users testing                        |
| 8. User Migration         | 6 days   | All users migrated to Web3Auth                       |
| 9. Cleanup                | 2 days   | Legacy code removed, docs updated                    |

**Total**: ~23 days (3-4 weeks)

---

## Next Immediate Steps

1. ✅ Complete Web3Auth Dashboard setup (Steps 1.1-1.4)
2. ✅ Generate RSA keys locally (Step 1.2)
3. ✅ Install npm dependencies (Step 1.4)
4. ✅ Add environment variables (Step 1.5)
5. ▶️ Start implementing with Claude Code (Phase 2)
