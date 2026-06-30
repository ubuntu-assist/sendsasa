/**
 * Admin wallet — managed entirely by Web3Auth.
 *
 * Uses a special internal verifier ID (not a phone number) so the admin
 * wallet keys are derived on-demand from Web3Auth just like user wallets.
 * No private key is ever stored in the database or environment variables.
 *
 *   EVM     → web3auth (CommonPrivateKeyProvider)   → secp256k1 → 0x address
 *   XRPL    → web3authXrpl (XrplPrivateKeyProvider) → native XRPL keypair
 *   Solana  → web3authSolana (SolanaPrivateKeyProvider) → Ed25519 → base58 address
 *
 * Set ADMIN_VERIFIER_ID in .env (e.g. "admin.sendsasa").
 * Keep this value secret — anyone with the JWT signing key + this ID
 * can derive the admin wallet.
 */

import { ethers } from 'ethers'
import { Wallet as XrplWallet } from 'xrpl'
import {
  web3auth,
  web3authXrpl,
  web3authSolana,
  initWeb3Auth,
} from './web3auth'
import { jwtAuthService } from '@shared/jwt-auth.service'
import { keypairFromSeed } from '@blockchain/chains/solana.service'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const VERIFIER = config.WEB3AUTH_VERIFIER!

function getAdminVerifierId(): string {
  const id = config.ADMIN_VERIFIER_ID
  if (!id) throw new Error('ADMIN_VERIFIER_ID is not set in .env')
  return id
}

// ── Raw key getters ───────────────────────────────────────────────────────────

export async function getAdminSecp256k1Key(): Promise<string> {
  const verifierId = getAdminVerifierId()
  await initWeb3Auth()

  const idToken = jwtAuthService.generateToken(verifierId)
  const provider = await web3auth.connect({
    verifier: VERIFIER,
    verifierId,
    idToken,
  })
  if (!provider)
    throw new Error('Web3Auth returned null provider for admin EVM wallet')

  const rawKey = (await provider.request({ method: 'private_key' })) as string
  if (!rawKey)
    throw new Error('Web3Auth returned empty key for admin EVM wallet')

  const hex = rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey
  return hex.padStart(64, '0')
}

async function getAdminXRPLWallet(): Promise<XrplWallet> {
  const verifierId = getAdminVerifierId()
  await initWeb3Auth()

  const idToken = jwtAuthService.generateToken(verifierId)
  const provider = await web3authXrpl.connect({
    verifier: VERIFIER,
    verifierId,
    idToken,
  })
  if (!provider)
    throw new Error('Web3Auth returned null provider for admin XRPL wallet')

  const keypair = (await provider.request({ method: 'xrpl_getKeyPair' })) as {
    privateKey: string
    publicKey: string
  }
  if (!keypair?.privateKey)
    throw new Error('Web3Auth returned empty keypair for admin XRPL wallet')

  return new XrplWallet(keypair.publicKey, keypair.privateKey)
}

async function getAdminSolanaKey(): Promise<string> {
  const verifierId = getAdminVerifierId()
  await initWeb3Auth()

  const idToken = jwtAuthService.generateToken(verifierId)
  const provider = await web3authSolana.connect({
    verifier: VERIFIER,
    verifierId,
    idToken,
  })
  if (!provider)
    throw new Error('Web3Auth returned null provider for admin Solana wallet')

  const rawKey = (await provider.request({
    method: 'solanaPrivateKey',
  })) as string
  if (!rawKey)
    throw new Error('Web3Auth returned empty key for admin Solana wallet')

  return rawKey.startsWith('0x') ? rawKey.slice(2) : rawKey
}

// ── Address cache ─────────────────────────────────────────────────────────────
// Addresses are deterministic — derive once then cache for the process lifetime.

let _evmAddress: string | null = null
let _xrplAddress: string | null = null
let _solanaAddress: string | null = null

export async function getAdminEVMAddress(): Promise<string> {
  if (_evmAddress) return _evmAddress
  const key = await getAdminSecp256k1Key()
  _evmAddress = new ethers.Wallet('0x' + key).address
  logger.info(`Admin EVM address: ${_evmAddress}`)
  return _evmAddress
}

export async function getAdminXRPLAddress(): Promise<string> {
  if (_xrplAddress) return _xrplAddress
  const wallet = await getAdminXRPLWallet()
  _xrplAddress = wallet.classicAddress
  logger.info(`Admin XRPL address: ${_xrplAddress}`)
  return _xrplAddress
}

export async function getAdminSolanaAddress(): Promise<string> {
  if (_solanaAddress) return _solanaAddress
  const key = await getAdminSolanaKey()
  _solanaAddress = keypairFromSeed(key).publicKey.toBase58()
  logger.info(`Admin Solana address: ${_solanaAddress}`)
  return _solanaAddress
}
