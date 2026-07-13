import { Injectable } from '@nestjs/common'
import { EVMService } from '@blockchain/chains/evm.service'
import { SolanaService } from '@blockchain/chains/solana.service'
import {
  WalletService,
  type WalletAddresses,
} from '@blockchain/chains/wallet.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { getBalance as getXrplBalance } from '@blockchain/chains/xrpl.service'
import type { EVMChain } from '@config/chains'

export type SolanaToken = 'SOL' | 'USDC' | 'USDT' | 'EURC'

@Injectable()
export class BlockchainFacadeService {
  constructor(
    private readonly evm: EVMService,
    private readonly solana: SolanaService,
    private readonly wallet: WalletService,
    private readonly stellar: StellarService,
  ) {}

  getOrCreateWallets(phoneNumber: string): Promise<WalletAddresses> {
    return this.wallet.getOrCreateWallets(phoneNumber)
  }

  async sendEvmToken(
    privateKey: string,
    chain: EVMChain,
    tokenSymbol: string,
    to: string,
    amount: string,
  ): Promise<string> {
    const receipt = await this.evm.transferToken(
      privateKey,
      chain,
      tokenSymbol,
      to,
      amount,
    )
    return receipt.hash
  }

  async sendEvmNative(
    privateKey: string,
    chain: EVMChain,
    to: string,
    amount: string,
  ): Promise<string> {
    const receipt = await this.evm.transferNative(privateKey, chain, to, amount)
    return receipt.hash
  }

  async getSolanaBalances(
    address: string,
  ): Promise<{ sol: string; usdc: string; usdt: string; eurc: string }> {
    return this.solana.getAllBalances(address)
  }

  async sendSolanaToken(
    seedHex: string,
    to: string,
    amount: number,
    token: SolanaToken,
  ): Promise<string> {
    const result = await (token === 'SOL'
      ? this.solana.sendSOL(seedHex, to, amount)
      : token === 'USDC'
        ? this.solana.sendUSDC(seedHex, to, amount)
        : token === 'USDT'
          ? this.solana.sendUSDT(seedHex, to, amount)
          : this.solana.sendEURC(seedHex, to, amount))
    return result.hash
  }

  async sendStellarUsdc(
    destination: string,
    amount: number,
    memo?: string,
  ): Promise<string> {
    return this.stellar.sendUsdc(destination, amount, memo)
  }

  async getXrplBalance(address: string): Promise<string> {
    const { balance } = await getXrplBalance(address)
    return balance
  }
}
