import config from '@common/utils/config'

export interface EVMChainConfig {
  rpcUrl: string
  chainId: number
  name: string
  nativeCurrency: string
  blockExplorerUrl: string
}

export interface XRPLConfig {
  wssUrl: string
}

export interface SolanaConfig {
  rpcUrl: string
  network: 'mainnet-beta' | 'devnet'
  chainId: string
}

export type EVMChain = 'bsc' | 'base' | 'ethereum' | 'lisk'

export const evmChains: Record<EVMChain, EVMChainConfig> = {
  bsc: {
    rpcUrl: config.BSC_RPC_URL || 'https://rpc.ankr.com/bsc',
    chainId: 56,
    name: 'BNB Smart Chain',
    nativeCurrency: 'BNB',
    blockExplorerUrl: 'https://bscscan.com',
  },
  base: {
    rpcUrl: config.BASE_RPC_URL || 'https://mainnet.base.org',
    chainId: 8453,
    name: 'Base',
    nativeCurrency: 'ETH',
    blockExplorerUrl: 'https://basescan.org',
  },
  ethereum: {
    rpcUrl: config.ETHEREUM_RPC_URL || 'https://rpc.ankr.com/eth',
    chainId: 1,
    name: 'Ethereum',
    nativeCurrency: 'ETH',
    blockExplorerUrl: 'https://etherscan.io',
  },
  lisk: {
    rpcUrl: config.LISK_RPC_URL || 'https://rpc.api.lisk.com',
    chainId: 1135,
    name: 'Lisk',
    nativeCurrency: 'ETH',
    blockExplorerUrl: 'https://blockscout.lisk.com',
  },
}

export const xrplConfig: XRPLConfig = {
  wssUrl: config.XRPL_WSS_URL || 'wss://xrplcluster.com',
}

const isSolanaDevnet = config.SOLANA_NETWORK === 'devnet'

export const solanaConfig: SolanaConfig = {
  rpcUrl: config.SOLANA_RPC_URL || (isSolanaDevnet
    ? 'https://api.devnet.solana.com'
    : 'https://api.mainnet-beta.solana.com'),
  network: isSolanaDevnet ? 'devnet' : 'mainnet-beta',
  chainId: isSolanaDevnet ? '0x2' : '0x1',
}

// SPL token mint addresses
export const solanaTokens: Record<string, string> = {
  // USDC  — Circle's official mint
  USDC: isSolanaDevnet
    ? '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'
    : 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  // USDT  — Tether's official Solana mint (mainnet only; no official devnet mint)
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  // EURC  — Circle's Euro Coin on Solana
  EURC: 'HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr',
}

// ERC-20 token contract addresses per chain
export const tokenAddresses: Record<EVMChain, Record<string, string>> = {
  bsc: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
  },
  base: {
    USDC: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  },
  ethereum: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
  },
  lisk: {
    // LSK ERC-20 on Lisk L2
    LSK: '0xac485391EB2d7D88253a7F1eF18C37f4242D1A24',
    // USDC on Lisk (Circle CCTP) — set via env after mainnet deployment
    USDC: config.LISK_USDC_ADDRESS || '',
    // USDT on Lisk (Stargate) — set via env after mainnet deployment
    USDT: config.LISK_USDT_ADDRESS || '',
  },
}
