import config from '../utils/config'

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

export type EVMChain = 'bsc' | 'base' | 'ethereum'

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
}

export const xrplConfig: XRPLConfig = {
  wssUrl: config.XRPL_WSS_URL || 'wss://s1.ripple.com',
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
}
