import { Global, Module } from '@nestjs/common'
import { XrplService } from './xrpl.service'
import { EVMService } from './evm.service'
import { SolanaService } from './solana.service'
import { WalletService } from './wallet.service'

@Global()
@Module({
  providers: [XrplService, EVMService, SolanaService, WalletService],
  exports: [XrplService, EVMService, SolanaService, WalletService],
})
export class ChainsModule {}
