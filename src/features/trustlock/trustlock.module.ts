import { Module } from '@nestjs/common'
import { TrustLockService } from './trustlock.service'
import { TrustLockFlowService } from './trustlock-flow.service'
import { GeminiService } from '@shared/gemini.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { SorobanTrustlockService } from '@blockchain/stellar/soroban-trustlock.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'
import { HorizonIndexerService } from '@blockchain/stellar/horizon-indexer.service'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  providers: [
    TrustLockService,
    TrustLockFlowService,
    GeminiService,
    StellarService,
    SorobanTrustlockService,
    StellarAnchorService,
    HorizonIndexerService,
    PawapayService,
  ],
  exports: [TrustLockService, TrustLockFlowService],
})
export class TrustLockModule {}
