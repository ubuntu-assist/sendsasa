import {
  Connection,
  PublicKey,
  Keypair,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
} from '@solana/web3.js'
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  getMint,
  getAssociatedTokenAddress,
} from '@solana/spl-token'
import { solanaConfig, solanaTokens } from '../config/chains'
import logger from '../utils/logger'

function getConnection(): Connection {
  return new Connection(solanaConfig.rpcUrl, 'confirmed')
}

export function keypairFromSeed(seedHex: string): Keypair {
  const hex = seedHex.startsWith('0x') ? seedHex.slice(2) : seedHex
  const seed = Buffer.from(hex.padStart(64, '0'), 'hex').subarray(0, 32)
  return Keypair.fromSeed(seed)
}

// ─── Balances ────────────────────────────────────────────────────────────────

export async function getSOLBalance(address: string): Promise<string> {
  const connection = getConnection()
  try {
    const lamports = await connection.getBalance(new PublicKey(address))
    return (lamports / LAMPORTS_PER_SOL).toString()
  } catch (error) {
    logger.error('Error getting SOL balance:', error)
    return '0'
  }
}

export async function getSPLTokenBalance(
  address: string,
  mintAddress: string,
): Promise<string> {
  const connection = getConnection()
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(
      new PublicKey(address),
      { mint: new PublicKey(mintAddress) },
    )
    if (accounts.value.length === 0) return '0'
    return (
      accounts.value[0].account.data.parsed.info.tokenAmount.uiAmountString ??
      '0'
    )
  } catch (error) {
    logger.error('Error getting SPL token balance:', error)
    return '0'
  }
}

export async function getAllBalances(address: string): Promise<{
  sol: string
  usdc: string
  usdt: string
  eurc: string
}> {
  const [sol, usdc, usdt, eurc] = await Promise.all([
    getSOLBalance(address),
    getSPLTokenBalance(address, solanaTokens.USDC),
    getSPLTokenBalance(address, solanaTokens.USDT),
    getSPLTokenBalance(address, solanaTokens.EURC),
  ])
  return { sol, usdc, usdt, eurc }
}

// ─── Payments ────────────────────────────────────────────────────────────────

export async function sendSOL(
  seedHex: string,
  to: string,
  amount: number,
): Promise<{ hash: string }> {
  const connection = getConnection()
  const keypair = keypairFromSeed(seedHex)

  const tx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey: new PublicKey(to),
      lamports: Math.round(amount * LAMPORTS_PER_SOL),
    }),
  )

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair])
  logger.info(`SOL sent: ${signature}`)
  return { hash: signature }
}

async function sendSPLToken(
  seedHex: string,
  to: string,
  amount: number,
  mintAddress: string,
  label: string,
): Promise<{ hash: string }> {
  const connection = getConnection()
  const keypair = keypairFromSeed(seedHex)
  const mint = new PublicKey(mintAddress)
  const recipient = new PublicKey(to)

  const mintInfo = await getMint(connection, mint)
  const atomicAmount = BigInt(Math.round(amount * 10 ** mintInfo.decimals))

  const senderAta = await getAssociatedTokenAddress(mint, keypair.publicKey)
  const recipientAta = await getOrCreateAssociatedTokenAccount(
    connection, keypair, mint, recipient,
  )

  const tx = new Transaction().add(
    createTransferInstruction(senderAta, recipientAta.address, keypair.publicKey, atomicAmount),
  )

  const signature = await sendAndConfirmTransaction(connection, tx, [keypair])
  logger.info(`Solana ${label} sent: ${signature}`)
  return { hash: signature }
}

export function sendUSDC(seedHex: string, to: string, amount: number) {
  return sendSPLToken(seedHex, to, amount, solanaTokens.USDC, 'USDC')
}

export function sendUSDT(seedHex: string, to: string, amount: number) {
  return sendSPLToken(seedHex, to, amount, solanaTokens.USDT, 'USDT')
}

export function sendEURC(seedHex: string, to: string, amount: number) {
  return sendSPLToken(seedHex, to, amount, solanaTokens.EURC, 'EURC')
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isValidSolanaAddress(address: string): boolean {
  try {
    new PublicKey(address)
    return true
  } catch {
    return false
  }
}
