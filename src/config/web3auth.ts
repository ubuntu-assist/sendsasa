import { Web3Auth, SDK_MODE } from '@web3auth/single-factor-auth'
import { CHAIN_NAMESPACES, WEB3AUTH_NETWORK, type WEB3AUTH_NETWORK_TYPE } from '@web3auth/base'
import { CommonPrivateKeyProvider } from '@web3auth/base-provider'
import { XrplPrivateKeyProvider } from '@web3auth/xrpl-provider'
import config from '../utils/config'
import logger from '../utils/logger'

function resolveNetwork(networkStr: string | undefined): WEB3AUTH_NETWORK_TYPE {
  if (networkStr === 'sapphire_mainnet') return WEB3AUTH_NETWORK.SAPPHIRE_MAINNET
  return WEB3AUTH_NETWORK.SAPPHIRE_DEVNET
}

const network = resolveNetwork(config.WEB3AUTH_NETWORK)
const isXrplMainnet = config.XRPL_NETWORK === 'mainnet'

// ── EVM provider ─────────────────────────────────────────────────────────────
// Returns raw secp256k1 private key via `private_key` RPC method.
// No chain-specific config needed — we sign EVM transactions manually with ethers.
const commonPrivateKeyProvider = new CommonPrivateKeyProvider({
  config: {
    chainConfig: {
      chainNamespace: CHAIN_NAMESPACES.OTHER,
      chainId: '0x0',
      rpcTarget: 'https://localhost', // not used server-side
    },
    keyExportEnabled: true,
  },
})

// ── XRPL provider ─────────────────────────────────────────────────────────────
// Derives a secp256k1 XRPL keypair via `xrpl_getKeyPair`.
// Uses Web3Auth's official XRPL key derivation algorithm:
//   entropy → ripple-keypairs seed → secp256k1 XRPL wallet
const xrplPrivateKeyProvider = new XrplPrivateKeyProvider({
  config: {
    chainConfig: {
      chainNamespace: CHAIN_NAMESPACES.XRPL,
      chainId: '0x1',
      rpcTarget: isXrplMainnet
        ? 'https://s1.ripple.com:51234'
        : 'https://s.altnet.rippletest.net:51234',
      wsTarget: isXrplMainnet
        ? 'wss://s1.ripple.com'
        : 'wss://s.altnet.rippletest.net:51233',
      ticker: 'XRP',
      tickerName: 'XRPL',
    },
    keyExportEnabled: true,
  },
})

// ── Web3Auth instances ────────────────────────────────────────────────────────

/** Main instance — raw secp256k1 key for EVM chains (BSC, Base, Ethereum) */
export const web3auth = new Web3Auth({
  clientId: config.WEB3AUTH_CLIENT_ID || '',
  web3AuthNetwork: network,
  privateKeyProvider: commonPrivateKeyProvider,
  mode: SDK_MODE.NODE,
})

/** XRPL instance — native XRPL keypair derivation */
export const web3authXrpl = new Web3Auth({
  clientId: config.WEB3AUTH_CLIENT_ID || '',
  web3AuthNetwork: network,
  privateKeyProvider: xrplPrivateKeyProvider,
  mode: SDK_MODE.NODE,
})

// ── Initialisation ────────────────────────────────────────────────────────────
// Both instances are initialised together. The promise is cached so concurrent
// callers all await the same underlying init operation.

let initPromise: Promise<void> | null = null

export async function initWeb3Auth(): Promise<void> {
  initPromise ??= Promise.all([web3auth.init(), web3authXrpl.init()]).then(() => {
    logger.info('Web3Auth SDK initialized (EVM + XRPL)')
  })
  await initPromise
}
