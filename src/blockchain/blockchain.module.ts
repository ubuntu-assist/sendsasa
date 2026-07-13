import { Module } from '@nestjs/common'
import { ChainsModule } from './chains/chains.module'
import { StellarModule } from './stellar/stellar.module'
import { BlockchainFacadeService } from './blockchain-facade.service'

@Module({
  imports: [ChainsModule, StellarModule],
  providers: [BlockchainFacadeService],
  exports: [BlockchainFacadeService],
})
export class BlockchainModule {}
