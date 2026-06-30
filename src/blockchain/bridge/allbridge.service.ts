import { Injectable } from '@nestjs/common'
import { ethers } from 'ethers'
import {
  Keypair as StellarKeypair,
  rpc as SorobanRpc,
} from '@stellar/stellar-sdk'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

// Allbridge Core SDK: wraps cross-chain liquidity pools across Stellar, BSC, Solana, etc.
let AllbridgeCoreSdk: any
let ChainSymbol: any
let Messenger: any
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const sdk = require('@allbridge/bridge-core-sdk')
  AllbridgeCoreSdk = sdk.AllbridgeCoreSdk
  ChainSymbol = sdk.ChainSymbol
  Messenger = sdk.Messenger
} catch (_) {
  logger.info(
    '[Allbridge] SDK not installed — bridge calls will throw at runtime',
  )
}

@Injectable()
export class AllbridgeService {
  private getSdk(): any {
    if (!AllbridgeCoreSdk) throw new Error('Allbridge SDK not installed')
    return new AllbridgeCoreSdk({
      coreApiUrl: 'https://core.api.allbridges.io',
      wormholeMessengerProgramId: '',
      solanaLookupTable: '',
      jupiterUrl: '',
    })
  }

  private getEvmProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(
      config.BSC_RPC_URL ?? 'https://bsc-dataseed.binance.org/',
    )
  }

  private getStellarRpc(): SorobanRpc.Server {
    return new SorobanRpc.Server(
      config.STELLAR_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
    )
  }

  /**
   * Bridge USDC from Stellar to BSC.
   * @param usdcAmountHuman  e.g. "100" for 100 USDC
   * @param destBscAddress   0x... BSC wallet address
   * @param stellarKeypair   sender's Stellar keypair
   * @returns BSC receive tx hash
   */
  async bridgeStellarToBsc(
    usdcAmountHuman: string,
    destBscAddress: string,
    stellarKeypair: StellarKeypair,
  ): Promise<string> {
    logger.info(
      `[Allbridge] Bridge ${usdcAmountHuman} USDC Stellar → BSC (${destBscAddress})`,
    )

    const ab = this.getSdk()

    // Fetch all token infos to find Stellar USDC and BSC USDC
    const tokens = await ab.tokens()
    const srcToken = tokens.find(
      (t: any) =>
        t.chainSymbol === (ChainSymbol.SRB ?? 'SRB') && t.symbol === 'USDC',
    )
    const dstToken = tokens.find(
      (t: any) =>
        t.chainSymbol === (ChainSymbol.BSC ?? 'BSC') && t.symbol === 'USDC',
    )
    if (!srcToken || !dstToken) {
      throw new Error('[Allbridge] Could not find USDC token on Stellar or BSC')
    }

    // Amount in smallest unit of Stellar USDC (7 decimal places → multiply by 1e7)
    const amountFloat = parseFloat(usdcAmountHuman)
    const amountStroops = Math.round(amountFloat * 1e7).toString()

    // Build the Stellar bridge transaction via Allbridge SDK
    const sendParams: any = {
      amount: amountStroops,
      fromToken: srcToken,
      toToken: dstToken,
      toAccountAddress: destBscAddress,
      messenger: Messenger?.ALLBRIDGE ?? 1,
      fromAccountAddress: stellarKeypair.publicKey(),
    }

    const rawTx = await ab.bridge.rawTxBuilder.send(sendParams)

    // rawTx is a Stellar XDR transaction — sign and submit
    const rpc = this.getStellarRpc()
    const tx = rawTx as any
    tx.sign(stellarKeypair)

    const sendResult = await rpc.sendTransaction(tx)
    if (sendResult.status === 'ERROR') {
      throw new Error(
        `Allbridge bridge tx failed: ${JSON.stringify(sendResult.errorResult)}`,
      )
    }
    const stellarTxHash = sendResult.hash
    logger.info(`[Allbridge] Stellar bridge tx: ${stellarTxHash}`)

    // Poll for BSC receive (Allbridge relayer handles this automatically)
    // In practice, wait ~60s and then check the BSC wallet balance increase
    // For now return the Stellar source hash; BSC mint is async via Allbridge relayer
    logger.info(
      `[Allbridge] BSC receive will be relayed automatically. Stellar tx: ${stellarTxHash}`,
    )
    return stellarTxHash
  }

  /**
   * Bridge USDC from BSC to Stellar.
   * @param usdcAmountHuman  e.g. "100" for 100 USDC
   * @param destStellarAddress  G... Stellar public key
   * @param evmPrivKey  BSC sender private key hex (no 0x prefix)
   * @returns BSC source tx hash
   */
  async bridgeBscToStellar(
    usdcAmountHuman: string,
    destStellarAddress: string,
    evmPrivKey: string,
  ): Promise<string> {
    logger.info(
      `[Allbridge] Bridge ${usdcAmountHuman} USDC BSC → Stellar (${destStellarAddress})`,
    )

    const ab = this.getSdk()
    const provider = this.getEvmProvider()
    const key = evmPrivKey.startsWith('0x') ? evmPrivKey : '0x' + evmPrivKey
    const signer = new ethers.Wallet(key, provider)

    const tokens = await ab.tokens()
    const srcToken = tokens.find(
      (t: any) =>
        t.chainSymbol === (ChainSymbol.BSC ?? 'BSC') && t.symbol === 'USDC',
    )
    const dstToken = tokens.find(
      (t: any) =>
        t.chainSymbol === (ChainSymbol.SRB ?? 'SRB') && t.symbol === 'USDC',
    )
    if (!srcToken || !dstToken) {
      throw new Error('[Allbridge] Could not find USDC token on BSC or Stellar')
    }

    // BSC USDC has 18 decimals
    const amountAtomic = ethers
      .parseUnits(parseFloat(usdcAmountHuman).toFixed(18), 18)
      .toString()

    const sendParams: any = {
      amount: amountAtomic,
      fromToken: srcToken,
      toToken: dstToken,
      toAccountAddress: destStellarAddress,
      messenger: Messenger?.ALLBRIDGE ?? 1,
      fromAccountAddress: signer.address,
    }

    // First approve USDC spend if needed
    const usdcAddress = srcToken.tokenAddress
    await this._approveIfNeeded(
      signer,
      usdcAddress,
      srcToken.bridgeAddress,
      amountAtomic,
    )

    const rawTx = await ab.bridge.rawTxBuilder.send(sendParams)

    // rawTx is an EVM tx object
    const txResponse = await signer.sendTransaction({
      to: rawTx.to,
      data: rawTx.data,
      value: rawTx.value ? BigInt(rawTx.value) : 0n,
    })
    const receipt = await txResponse.wait()
    const txHash = receipt?.hash ?? txResponse.hash
    logger.info(`[Allbridge] BSC bridge tx: ${txHash}`)
    return txHash
  }

  private async _approveIfNeeded(
    signer: ethers.Wallet,
    tokenAddress: string,
    spender: string,
    amount: string,
  ): Promise<void> {
    const erc20Abi = [
      'function allowance(address owner, address spender) view returns (uint256)',
      'function approve(address spender, uint256 amount) returns (bool)',
    ]
    const token = new ethers.Contract(tokenAddress, erc20Abi, signer)
    const allowance: bigint = await token.allowance(signer.address, spender)
    if (allowance < BigInt(amount)) {
      const tx = await token.approve(spender, ethers.MaxUint256)
      await tx.wait()
      logger.info(`[Allbridge] Approved USDC spend on BSC`)
    }
  }
}
