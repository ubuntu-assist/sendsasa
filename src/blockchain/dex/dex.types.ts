export interface SwapQuote {
  fromAsset: string
  fromChain: 'xrpl' | 'bsc' | 'base' | 'ethereum' | 'solana' | 'stellar' | 'lisk'
  toAsset: string
  toChain: 'xrpl' | 'bsc' | 'base' | 'ethereum' | 'solana' | 'stellar' | 'lisk'
  fromAmount: string      // human-readable
  fromAmountAtomic: string // wei / lamports / drops / stroops
  toAmount: string        // human-readable, estimated after slippage
  toAmountAtomic: string
  priceImpactPct: string
  routeLabel: string      // "Jupiter", "1inch", "XRPL DEX", "Allbridge", "CCTP"
  fee?: string            // human-readable fee in from-asset
  expiresAt: number       // unix ms
  _raw?: any              // chain-specific raw quote for executeSwap
}

export interface SwapResult {
  txHash: string
  fromAmount: string
  toAmount: string
  fromAsset: string
  toAsset: string
  chain: string
}

// Asset → chain mapping (canonical display names used in menus/flows)
export const ASSET_CHAIN: Record<string, 'xrpl' | 'bsc' | 'solana' | 'stellar' | 'lisk'> = {
  XRP: 'xrpl',
  RLUSD: 'xrpl',
  BNB: 'bsc',
  USDT_BSC: 'bsc',
  USDC_BSC: 'bsc',
  SOL: 'solana',
  USDT_SOL: 'solana',
  USDC_SOL: 'solana',
  USDC_STELLAR: 'stellar',
  LSK: 'lisk',
  USDC_LISK: 'lisk',
  USDT_LISK: 'lisk',
}

export const ASSET_LABELS: Record<string, string> = {
  XRP: 'XRP (XRPL)',
  RLUSD: 'RLUSD (XRPL)',
  BNB: 'BNB (BSC)',
  USDT_BSC: 'USDT (BSC)',
  USDC_BSC: 'USDC (BSC)',
  SOL: 'SOL (Solana)',
  USDT_SOL: 'USDT (Solana)',
  USDC_SOL: 'USDC (Solana)',
  LSK: 'LSK (Lisk)',
  USDC_LISK: 'USDC (Lisk)',
  USDT_LISK: 'USDT (Lisk)',
}

export const SOLANA_MINTS: Record<string, string> = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDT_SOL: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  USDC_SOL: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
}

export const SOLANA_DECIMALS: Record<string, number> = {
  'So11111111111111111111111111111111111111112': 9,
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB': 6,
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v': 6,
}

export const BSC_TOKENS: Record<string, string> = {
  BNB: '0xEeeeEeeeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe',
  USDT_BSC: '0x55d398326f99059fF775485246999027B3197955',
  USDC_BSC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
}

// Native ETH placeholder used by 1inch for gas token on any EVM chain
const NATIVE_ETH = '0xEeeeEeeeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEeEe'

export const LISK_TOKENS: Record<string, string> = {
  // Native ETH on Lisk (gas token)
  ETH_LISK: NATIVE_ETH,
  // LSK ERC-20 on Lisk L2
  LSK: '0xac485391EB2d7D88253a7F1eF18C37f4242D1A24',
  // USDC on Lisk (set via env after contract deployment)
  USDC_LISK: process.env.LISK_USDC_ADDRESS ?? '',
  // USDT on Lisk (set via env after contract deployment)
  USDT_LISK: process.env.LISK_USDT_ADDRESS ?? '',
}

export const XRPL_RLUSD_ISSUER = 'rMxCKbEDwqr76QuheSUMdEGf4B9xJ8m5De'
export const XRPL_RLUSD_HEX = '524C555344000000000000000000000000000000'
