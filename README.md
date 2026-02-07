# SendSasa MVP - Phase 1: Core XRPL Integration

## Overview

This is Phase 1 of the SendSasa MVP - implementing core XRPL (XRP Ledger) functionality for wallet management and XRP transfers.

## Features Implemented ✅

### Phase 1 Checklist:

- [x] Set up Node.js + TypeScript project
- [x] Install xrpl.js SDK
- [x] Connect to XRPL testnet
- [x] Create wallet generation function
- [x] Implement sendXRP() function
- [x] Implement getBalance() function
- [x] Test all functions via command line

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

This will install:

- `xrpl` - Official XRP Ledger SDK
- `dotenv` - Environment variable management
- `typescript` - TypeScript compiler
- `ts-node` - TypeScript execution

### 2. Configure Environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The default configuration uses testnet. No changes needed for Phase 1.

### 3. Run the Application

**Quick Start (generates a wallet):**

```bash
npm run dev
```

**Run Full Test Suite:**

```bash
npm test
```

### 4. Build for Production

```bash
npm run build
npm start
```

## Core Functions

### 1. Generate Wallet

```typescript
const wallet = await generateWallet()
// Returns: { address, seed, publicKey, privateKey }
// Testnet: automatically funded with 1000 XRP
```

### 2. Send XRP

```typescript
const result = await sendXRP(
  senderSeed, // Your wallet seed
  recipientAddress, // Destination address
  amount, // Amount in XRP (e.g., 10)
)
```

### 3. Check Balance

```typescript
const balance = await getBalance(address)
// Returns: { address, balance, currency }
```

### 4. Get Transaction History

```typescript
const history = await getHistory(address, limit)
// Returns array of transactions with date, amount, etc.
```

## Test Suite

The automated test suite (`npm test`) performs the following:

1. ✅ Generates 2 wallets
2. ✅ Checks initial balances (should be 1000 XRP each)
3. ✅ Sends 13 XRP from Wallet 1 to Wallet 2
4. ✅ Verifies updated balances
5. ✅ Retrieves transaction history for both wallets

### Example Output:

```
═══════════════════════════════════════════════
🚀 SENDSASA MVP - PHASE 1 TEST SUITE
═══════════════════════════════════════════════

📡 Connecting to XRPL...
✅ Connected to testnet

━━━ TEST 1: Generate Wallets ━━━
🔑 Generating new wallet...
✅ Wallet created and funded!
📍 Address: rN7n7otQDd6FczFgLdSqtcsAUxDkw6fzRH
💰 Balance: 1000 XRP

━━━ TEST 3: Send XRP (Wallet 1 → Wallet 2) ━━━
💸 Sending XRP...
Amount: 13 XRP
✅ Transaction successful!
🔗 Hash: 8F7B3D2E1C4A...

✅ ALL TESTS PASSED!
```

## Verifying Transactions

All transactions can be verified on the XRPL Testnet Explorer:

**Explorer URL:** https://testnet.xrpl.org

You can search by:

- Transaction hash
- Wallet address
- Ledger index

## Important Notes

### 🔐 Security

- **NEVER share your wallet seed** - it's like your private key
- Seeds are displayed in console for testing only
- In production, seeds should be encrypted and stored securely
- The `.env` file contains a test encryption key - generate a strong one for production

### 🌐 Network

- Currently configured for **XRPL Testnet**
- Testnet XRP has no real value
- Each wallet is auto-funded with 1000 XRP
- To switch to mainnet, update `.env`: `XRPL_NETWORK=mainnet`

### 💰 XRP Units

- 1 XRP = 1,000,000 drops (smallest unit)
- All amounts are handled in XRP (e.g., 10, 13.5)
- SDK automatically converts to/from drops

## Common Issues

### Error: Client not connected

**Solution:** Make sure to call `await xrplClient.connect()` before using XRPL functions

### Error: Account not found

**Solution:** Account needs to be funded first. On testnet, use `generateWallet()` which auto-funds.

### Error: Insufficient XRP

**Solution:** Check balance with `getBalance()`. Reserve requirement is ~10 XRP.

## Next Steps (Phase 2)

- [ ] WhatsApp Business API integration
- [ ] Webhook for receiving messages
- [ ] Message parsing (send, balance, history commands)
- [ ] Phone number to XRPL address mapping
- [ ] MongoDB integration for user storage

## Resources

- **XRPL Documentation:** https://xrpl.org
- **xrpl.js SDK:** https://js.xrpl.org
- **Testnet Explorer:** https://testnet.xrpl.org
- **Testnet Faucet:** Built into `generateWallet()`

## License

MIT

---

**SendSasa** - Making crypto payments as easy as sending a message 💬💰
