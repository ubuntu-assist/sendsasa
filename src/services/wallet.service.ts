import { ethers } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'
import { web3auth, web3authXrpl, initWeb3Auth } from '../config/web3auth'
import { jwtAuthService } from './jwt-auth.service'
import { normalizeToE164, maskPhone } from './phone-number.service'
import { User } from '../models'
import config from '../utils/config'
import logger from '../utils/logger'

const VERIFIER = config.WEB3AUTH_VERIFIER || 'sendsasa-whatsapp'
const MAX_RETRIES = 3

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export interface WalletAddresses {
  evmAddress: string
  xrplAddress: string
}

class WalletService {
  /**
   * Return cached wallet addresses for a phone number, deriving them from
   * Web3Auth and caching in the User document if not yet stored.
   *
   * EVM key: derived via CommonPrivateKeyProvider (raw secp256k1 key).
   * XRPL key: derived via XrplPrivateKeyProvider (secp256k1 XRPL wallet).
   * Both are fetched in parallel on a cache miss.
   */
  async getOrCreateWallets(phoneNumber: string): Promise<WalletAddresses> {
    const e164Phone = normalizeToE164(phoneNumber)

    // Check DB cache first — avoids Web3Auth round-trips on every call
    const user = await User.findOne({ phoneNumber: e164Phone }).select(
      'evm_address xrpl_address',
    )

    if (user?.evm_address && user?.xrpl_address) {
      logger.info(
        `Wallet cache hit for ${maskPhone(e164Phone)}: EVM=${user.evm_address.slice(0, 8)}...`,
      )
      return { evmAddress: user.evm_address, xrplAddress: user.xrpl_address }
    }

    // Derive both in parallel — one connect per provider
    const [secp256k1Key, xrplWallet] = await Promise.all([
      this.getPrivateKey(e164Phone),
      this.getXRPLWallet(e164Phone),
    ])

    const evmWallet = this.deriveEVMWallet(secp256k1Key)
    const evmAddress = evmWallet.address
    const xrplAddress = xrplWallet.classicAddress

    // Persist addresses if user exists (no-op if user not yet registered)
    if (user) {
      await User.updateOne(
        { phoneNumber: e164Phone },
        {
          $set: {
            evm_address: evmAddress,
            xrpl_address: xrplAddress,
            web3auth_verifier: VERIFIER,
            web3auth_verifier_id: e164Phone,
            wallet_created_at: new Date(),
          },
        },
      )
      logger.info(`Wallet addresses cached for ${maskPhone(e164Phone)}`)
    }

    return { evmAddress, xrplAddress }
  }

  /**
   * Retrieve the raw secp256k1 private key from Web3Auth via CommonPrivateKeyProvider.
   * Used for EVM transaction signing (BSC, Base, Ethereum).
   *
   * Returns a 64-char hex string with NO "0x" prefix.
   * Discard from memory immediately after use.
   */
  async getPrivateKey(phoneNumber: string): Promise<string> {
    const e164Phone = normalizeToE164(phoneNumber)
    await initWeb3Auth()

    let lastError: Error = new Error('Unknown error')

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const idToken = jwtAuthService.generateToken(e164Phone)

        const provider = await web3auth.connect({
          verifier: VERIFIER,
          verifierId: e164Phone,
          idToken,
        })

        if (!provider) throw new Error('Web3Auth returned a null provider')

        // CommonPrivateKeyProvider exposes the raw secp256k1 key via 'private_key'
        const rawKey = (await provider.request({ method: 'private_key' })) as string

        if (!rawKey) throw new Error('Web3Auth returned an empty private key')

        const hex = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey
        return hex.padStart(64, '0')
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.error(
          `Web3Auth (EVM) connect attempt ${attempt}/${MAX_RETRIES} failed` +
            ` for ${maskPhone(e164Phone)}: ${lastError.message}`,
        )
        if (attempt < MAX_RETRIES) await sleep(Math.pow(2, attempt - 1) * 1000)
      }
    }

    throw new Error(
      `Failed to retrieve EVM private key after ${MAX_RETRIES} attempts: ${lastError.message}`,
    )
  }

  /**
   * Retrieve the XRPL wallet from Web3Auth via XrplPrivateKeyProvider.
   * Uses Web3Auth's official secp256k1 XRPL key derivation:
   *   secp256k1 seed → ripple-keypairs entropy → secp256k1 XRPL keypair
   *
   * The returned Wallet's classicAddress is the canonical XRPL address for this user.
   */
  async getXRPLWallet(phoneNumber: string): Promise<XrplWallet> {
    const e164Phone = normalizeToE164(phoneNumber)
    await initWeb3Auth()

    let lastError: Error = new Error('Unknown error')

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const idToken = jwtAuthService.generateToken(e164Phone)

        const provider = await web3authXrpl.connect({
          verifier: VERIFIER,
          verifierId: e164Phone,
          idToken,
        })

        if (!provider) throw new Error('web3authXrpl returned a null provider')

        // XrplPrivateKeyProvider exposes the native XRPL keypair via 'xrpl_getKeyPair'
        const keypair = (await provider.request({
          method: 'xrpl_getKeyPair',
        })) as { privateKey: string; publicKey: string }

        if (!keypair?.privateKey || !keypair?.publicKey) {
          throw new Error('web3authXrpl returned an empty keypair')
        }

        return new XrplWallet(keypair.publicKey, keypair.privateKey)
      } catch (error: any) {
        lastError = error instanceof Error ? error : new Error(String(error))
        logger.error(
          `Web3Auth (XRPL) connect attempt ${attempt}/${MAX_RETRIES} failed` +
            ` for ${maskPhone(e164Phone)}: ${lastError.message}`,
        )
        if (attempt < MAX_RETRIES) await sleep(Math.pow(2, attempt - 1) * 1000)
      }
    }

    throw new Error(
      `Failed to retrieve XRPL wallet after ${MAX_RETRIES} attempts: ${lastError.message}`,
    )
  }

  /**
   * Derive an ethers.Wallet (EVM) from the secp256k1 private key.
   * Works for BSC, Base, and Ethereum — all share the same address.
   */
  deriveEVMWallet(secp256k1Key: string): ethers.Wallet {
    const key = secp256k1Key.startsWith('0x')
      ? secp256k1Key
      : '0x' + secp256k1Key
    return new ethers.Wallet(key)
  }
}

export const walletService = new WalletService()
