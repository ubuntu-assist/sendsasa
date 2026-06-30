//! TrustLock Soroban escrow contract.
//!
//! Holds USDC between a client (payer) and a provider (payee) until
//! the client confirms delivery or 72 hours elapse (auto-release).
//! Dispute resolution is handled off-chain by Gemini AI; the platform
//! key then calls `refund` if the verdict is REFUND.
//!
//! State machine:
//!   (none) → lock() → LOCKED
//!   LOCKED  → release() / auto_release() → RELEASED
//!   LOCKED  → refund() → REFUNDED

#![no_std]

use soroban_sdk::{
    contract, contractimpl, contracttype, symbol_short,
    token::Client as TokenClient,
    Address, Env, Symbol,
};

// ─── Storage keys ─────────────────────────────────────────────────────────────

const CLIENT_KEY: Symbol    = symbol_short!("CLIENT");
const PROVIDER_KEY: Symbol  = symbol_short!("PROVIDER");
const AMOUNT_KEY: Symbol    = symbol_short!("AMOUNT");
const TOKEN_KEY: Symbol     = symbol_short!("TOKEN");
const STATUS_KEY: Symbol    = symbol_short!("STATUS");
const LOCK_TIME_KEY: Symbol = symbol_short!("LOCK_TIME");

// 72 hours expressed in ledger seconds
const AUTO_RELEASE_DELAY_SECS: u64 = 72 * 60 * 60;

// ─── Status enum ──────────────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, PartialEq)]
pub enum Status {
    Locked,
    Released,
    Refunded,
}

// ─── Contract ─────────────────────────────────────────────────────────────────

#[contract]
pub struct TrustLockContract;

#[contractimpl]
impl TrustLockContract {
    /// Lock `amount` USDC (in stroops: 1 USDC = 10_000_000 stroops) from the
    /// client's account into the contract.
    ///
    /// `client.require_auth()` ensures the caller signed with the client key.
    /// In SendSasa's custodial model the platform key holds this authority and
    /// signs on behalf of the user.
    ///
    /// # Panics
    /// - If a lock is already active (contract storage already has STATUS_KEY)
    pub fn lock(
        env: Env,
        client: Address,
        provider: Address,
        amount: i128,
        token: Address,
    ) {
        client.require_auth();

        // Prevent double-lock
        if env.storage().instance().has(&STATUS_KEY) {
            panic!("already locked");
        }

        // Pull USDC from client into this contract
        let token_client = TokenClient::new(&env, &token);
        token_client.transfer(&client, &env.current_contract_address(), &amount);

        // Persist escrow state
        env.storage().instance().set(&CLIENT_KEY,   &client);
        env.storage().instance().set(&PROVIDER_KEY, &provider);
        env.storage().instance().set(&AMOUNT_KEY,   &amount);
        env.storage().instance().set(&TOKEN_KEY,    &token);
        env.storage().instance().set(&STATUS_KEY,   &Status::Locked);
        env.storage().instance().set(&LOCK_TIME_KEY, &env.ledger().timestamp());

        // Emit lock event for Horizon indexer
        env.events().publish(
            (symbol_short!("trustlock"), symbol_short!("locked")),
            (client, provider, amount),
        );
    }

    /// Release USDC to the provider.
    /// Called when the buyer confirms delivery in WhatsApp.
    ///
    /// `client.require_auth()` — in the custodial model the platform key signs.
    pub fn release(env: Env, client: Address) {
        client.require_auth();

        let status: Status = env.storage().instance().get(&STATUS_KEY).expect("not locked");
        if status != Status::Locked {
            panic!("not in LOCKED state");
        }

        let provider: Address = env.storage().instance().get(&PROVIDER_KEY).unwrap();
        let amount: i128      = env.storage().instance().get(&AMOUNT_KEY).unwrap();
        let token: Address    = env.storage().instance().get(&TOKEN_KEY).unwrap();

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &provider,
            &amount,
        );

        env.storage().instance().set(&STATUS_KEY, &Status::Released);

        env.events().publish(
            (symbol_short!("trustlock"), symbol_short!("released")),
            (client, provider, amount),
        );
    }

    /// Permissionless auto-release triggered after 72 hours of inactivity.
    /// Anyone can call this once the ledger timestamp exceeds lock_time + 72h.
    /// On expiry the USDC is released to the provider (seller-side safety net).
    pub fn auto_release(env: Env) {
        let status: Status = env.storage().instance().get(&STATUS_KEY).expect("not locked");
        if status != Status::Locked {
            panic!("not in LOCKED state");
        }

        let lock_time: u64 = env.storage().instance().get(&LOCK_TIME_KEY).unwrap();
        let elapsed = env.ledger().timestamp().saturating_sub(lock_time);
        if elapsed < AUTO_RELEASE_DELAY_SECS {
            panic!("72h window not elapsed");
        }

        let provider: Address = env.storage().instance().get(&PROVIDER_KEY).unwrap();
        let amount: i128      = env.storage().instance().get(&AMOUNT_KEY).unwrap();
        let token: Address    = env.storage().instance().get(&TOKEN_KEY).unwrap();
        let client: Address   = env.storage().instance().get(&CLIENT_KEY).unwrap();

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &provider,
            &amount,
        );

        env.storage().instance().set(&STATUS_KEY, &Status::Released);

        env.events().publish(
            (symbol_short!("trustlock"), symbol_short!("auto_rel")),
            (client, provider, amount),
        );
    }

    /// Refund USDC back to the client.
    /// Called by the platform key after a Gemini AI dispute verdict of REFUND.
    ///
    /// No `require_auth()` on client here — the platform key is the caller
    /// (stored as the invoker, which already signed this transaction).
    pub fn refund(env: Env, client: Address) {
        client.require_auth();

        let status: Status = env.storage().instance().get(&STATUS_KEY).expect("not locked");
        if status != Status::Locked {
            panic!("not in LOCKED state");
        }

        let amount: i128 = env.storage().instance().get(&AMOUNT_KEY).unwrap();
        let token: Address = env.storage().instance().get(&TOKEN_KEY).unwrap();

        TokenClient::new(&env, &token).transfer(
            &env.current_contract_address(),
            &client,
            &amount,
        );

        env.storage().instance().set(&STATUS_KEY, &Status::Refunded);

        env.events().publish(
            (symbol_short!("trustlock"), symbol_short!("refunded")),
            (client, amount),
        );
    }

    /// Read the current status (LOCKED / RELEASED / REFUNDED).
    pub fn status(env: Env) -> Status {
        env.storage()
            .instance()
            .get(&STATUS_KEY)
            .unwrap_or(Status::Locked)
    }

    /// Return the locked amount in stroops.
    pub fn amount(env: Env) -> i128 {
        env.storage().instance().get(&AMOUNT_KEY).unwrap_or(0)
    }

    /// Return the Unix timestamp at which the lock was created.
    pub fn lock_time(env: Env) -> u64 {
        env.storage().instance().get(&LOCK_TIME_KEY).unwrap_or(0)
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use soroban_sdk::{
        testutils::{Address as _, Ledger, LedgerInfo},
        token::{Client as TokenClient, StellarAssetClient},
        Env,
    };

    fn setup() -> (Env, TrustLockContractClient<'static>, Address, Address, Address) {
        let env = Env::default();
        env.mock_all_auths();

        let contract_id = env.register_contract(None, TrustLockContract);
        let client = TrustLockContractClient::new(&env, &contract_id);

        let buyer    = Address::generate(&env);
        let seller   = Address::generate(&env);

        // Deploy a test USDC SAC and mint 1000 USDC to buyer
        let usdc_id = env.register_stellar_asset_contract_v2(buyer.clone());
        let usdc_admin = StellarAssetClient::new(&env, &usdc_id.address());
        usdc_admin.mint(&buyer, &1_000_000_0000000i128); // 1 000 USDC in stroops

        (env, client, buyer, seller, usdc_id.address())
    }

    #[test]
    fn test_lock_and_release() {
        let (env, contract, buyer, seller, usdc) = setup();

        let amount = 100_0000000i128; // 100 USDC
        contract.lock(&buyer, &seller, &amount, &usdc);
        assert_eq!(contract.status(), Status::Locked);
        assert_eq!(contract.amount(), amount);

        contract.release(&buyer);
        assert_eq!(contract.status(), Status::Released);

        // Verify seller received the funds
        let seller_balance = TokenClient::new(&env, &usdc).balance(&seller);
        assert_eq!(seller_balance, amount);
    }

    #[test]
    fn test_lock_and_refund() {
        let (env, contract, buyer, seller, usdc) = setup();

        let initial_balance = TokenClient::new(&env, &usdc).balance(&buyer);
        let amount = 50_0000000i128; // 50 USDC

        contract.lock(&buyer, &seller, &amount, &usdc);
        contract.refund(&buyer);

        assert_eq!(contract.status(), Status::Refunded);
        // Buyer gets their full amount back
        assert_eq!(
            TokenClient::new(&env, &usdc).balance(&buyer),
            initial_balance,
        );
    }

    #[test]
    fn test_auto_release_after_72h() {
        let (env, contract, buyer, seller, usdc) = setup();

        let amount = 200_0000000i128;
        contract.lock(&buyer, &seller, &amount, &usdc);

        // Advance ledger time by 73 hours
        env.ledger().set(LedgerInfo {
            timestamp: AUTO_RELEASE_DELAY_SECS + 3600,
            ..env.ledger().get()
        });

        contract.auto_release();
        assert_eq!(contract.status(), Status::Released);
        assert_eq!(TokenClient::new(&env, &usdc).balance(&seller), amount);
    }

    #[test]
    #[should_panic(expected = "72h window not elapsed")]
    fn test_auto_release_too_early() {
        let (_, contract, buyer, seller, usdc) = setup();
        let amount = 100_0000000i128;
        contract.lock(&buyer, &seller, &amount, &usdc);
        // 71h elapsed — should panic
        contract.auto_release();
    }

    #[test]
    #[should_panic(expected = "already locked")]
    fn test_double_lock_rejected() {
        let (_, contract, buyer, seller, usdc) = setup();
        let amount = 100_0000000i128;
        contract.lock(&buyer, &seller, &amount, &usdc);
        contract.lock(&buyer, &seller, &amount, &usdc); // should panic
    }
}
