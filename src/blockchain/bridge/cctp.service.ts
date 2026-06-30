import { Injectable } from '@nestjs/common'
import axios from 'axios'
import {
  Keypair as StellarKeypair,
  rpc as SorobanRpc,
  TransactionBuilder,
  Networks,
  Address,
  nativeToScVal,
  Contract,
} from '@stellar/stellar-sdk'
import {
  PublicKey,
} from '@solana/web3.js'
import config from '@common/utils/config'
import logger from '@common/utils/logger'

const CCTP_IRIS_API = 'https://iris-api.circle.com'

// Stellar mainnet CCTP contracts (domain 27)
const STELLAR_TOKEN_MESSENGER = 'CAE2G5Z77UP7GYPYGFOWFGW7C7J6I4YP2AFGSADRKQY62SYUFLPNFTXL'

const SOLANA_DOMAIN = 5
// Solana message transmitter program (domain 5) — used in _mintOnSolana
const SOLANA_MESSAGE_TRANSMITTER_PROGRAM = 'CCTPV2Sm4AdWt5296sk4P66VBZ7bEhcARwFaaS9YPbeC'

@Injectable()
export class CctpService {
  private readonly rpcServer = new SorobanRpc.Server(
    config.STELLAR_SOROBAN_RPC_URL ?? 'https://soroban-testnet.stellar.org',
  )

  /**
   * Bridge USDC from Stellar to Solana via Circle CCTP v2.
   * Returns the Solana transaction hash once USDC is minted on the destination.
   *
   * Full flow:
   *   1. Call CctpForwarder.forward_and_deposit_for_burn() on Stellar (burns USDC)
   *   2. Poll iris-api.circle.com for signed attestation
   *   3. Call MessageTransmitterV2.receive_message() on Solana (mints USDC)
   */
  async bridgeStellarToSolana(
    usdcAmountStroops: string, // USDC amount in Stellar stroops (7 decimal places: 1 USDC = 10_000_000)
    destSolanaAddress: string,
    stellarKeypair: StellarKeypair,
  ): Promise<string> {
    logger.info(
      `[CCTP] Bridging ${usdcAmountStroops} USDC stroops from Stellar → Solana (${destSolanaAddress})`,
    )

    // Encode destination as 32-byte Solana address for CCTP message
    const destBytes32 = '0x' + Buffer.from(new PublicKey(destSolanaAddress).toBytes()).toString('hex').padStart(64, '0')

    // Build Soroban invocation: CctpForwarder.deposit_for_burn(amount, destination_domain, mint_recipient, burn_token)
    const stellarUsdcAddress = config.STELLAR_USDC_ISSUER

    const contract = new Contract(STELLAR_TOKEN_MESSENGER)
    const account = await this.rpcServer.getAccount(stellarKeypair.publicKey())
    const networkPassphrase = config.STELLAR_NETWORK_PASSPHRASE ?? Networks.TESTNET

    const op = contract.call(
      'deposit_for_burn',
      nativeToScVal(BigInt(usdcAmountStroops), { type: 'i128' }),
      nativeToScVal(SOLANA_DOMAIN, { type: 'u32' }),
      nativeToScVal(Buffer.from(destBytes32.slice(2), 'hex'), { type: 'bytes' }),
      new Address(stellarUsdcAddress).toScVal(),
    )

    const tx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase,
    })
      .addOperation(op)
      .setTimeout(30)
      .build()

    const preparedTx = await this.rpcServer.prepareTransaction(tx)
    ;(preparedTx as any).sign(stellarKeypair)

    const sendResult = await this.rpcServer.sendTransaction(preparedTx as any)
    if (sendResult.status === 'ERROR') {
      throw new Error(`CCTP burn failed on Stellar: ${JSON.stringify(sendResult.errorResult)}`)
    }

    const burnTxHash = sendResult.hash
    logger.info(`[CCTP] Stellar burn tx: ${burnTxHash}`)

    // Poll attestation
    const { message, attestation } = await this.pollAttestation(burnTxHash)

    // Mint on Solana via MessageTransmitter.receive_message
    const solanaTxHash = await this._mintOnSolana(
      message,
      attestation,
      destSolanaAddress,
    )
    logger.info(`[CCTP] Solana mint tx: ${solanaTxHash}`)
    return solanaTxHash
  }

  /**
   * Poll the CCTP attestation API until the message is signed.
   * Fast Transfer threshold gives ~30s; standard takes up to 13 minutes.
   */
  async pollAttestation(srcTxHash: string): Promise<{ message: string; attestation: string }> {
    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 5_000))
      const res = await axios.get(`${CCTP_IRIS_API}/v2/messages`, {
        params: { transactionHash: srcTxHash },
      })
      const msg = res.data?.messages?.[0]
      if (msg?.status === 'complete') {
        return { message: msg.message, attestation: msg.attestation }
      }
      logger.info(`[CCTP] Attestation pending for ${srcTxHash} (attempt ${i + 1}/150)`)
    }
    throw new Error(`[CCTP] Attestation timeout for ${srcTxHash}`)
  }

  private async _mintOnSolana(
    message: string,
    attestation: string,
    recipientAddress: string,
  ): Promise<string> {
    // This requires calling the MessageTransmitter program on Solana
    // In production: use @circle-fin/cctp-lib or a pre-built instruction builder
    // For now we log the attestation — integration with the program requires building the ix
    logger.info(`[CCTP] Mint attestation ready. Recipient: ${recipientAddress}`)
    logger.info(`[CCTP] message: ${message.slice(0, 40)}... attestation: ${attestation.slice(0, 40)}...`)

    // TODO: Build and send the receive_message instruction to SOLANA_MESSAGE_TRANSMITTER_PROGRAM
    // The instruction data follows the CCTP ABI for receiveMessage(bytes message, bytes attestation)
    // Return a placeholder hash for now — replace with actual program invocation
    throw new Error(
      `[CCTP] Solana message transmitter (${SOLANA_MESSAGE_TRANSMITTER_PROGRAM}) invocation not yet wired. ` +
      'See @circle-fin/cctp-lib for the receiveMessage instruction builder.',
    )
  }
}
