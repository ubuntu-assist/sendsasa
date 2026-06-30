import { Global, Module } from '@nestjs/common'
import { StellarService } from './stellar.service'
import { HorizonIndexerService } from './horizon-indexer.service'
import { SorobanTrustlockService } from './soroban-trustlock.service'
import { StellarAnchorService } from './stellar-anchor.service'

@Global()
@Module({
  providers: [
    StellarService,
    HorizonIndexerService,
    SorobanTrustlockService,
    StellarAnchorService,
  ],
  exports: [
    StellarService,
    HorizonIndexerService,
    SorobanTrustlockService,
    StellarAnchorService,
  ],
})
export class StellarModule {}
