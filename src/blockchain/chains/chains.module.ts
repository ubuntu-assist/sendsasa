import { Global, Module } from '@nestjs/common'
import { XrplService } from './xrpl.service'
import { EVMService } from './evm.service'
import { SolanaService } from './solana.service'
import { WalletService } from './wallet.service'
import { XrplLifecycleService } from './xrpl-lifecycle.service'

@Global()
@Module({
  providers: [XrplService, EVMService, SolanaService, WalletService, XrplLifecycleService],
  exports: [XrplService, EVMService, SolanaService, WalletService],
})
export class ChainsModule {}
