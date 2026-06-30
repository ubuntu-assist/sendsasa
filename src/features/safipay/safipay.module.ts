import { Module } from '@nestjs/common'
import { SafiPayService } from './safipay.service'
import { SafiPayFlowService } from './safipay-flow.service'
import { SafiPayRedirectController } from './safipay-redirect.controller'
import { GeminiService } from '@shared/gemini.service'
import { StellarService } from '@blockchain/stellar/stellar.service'
import { StellarAnchorService } from '@blockchain/stellar/stellar-anchor.service'

@Module({
  controllers: [SafiPayRedirectController],
  providers: [
    SafiPayService,
    SafiPayFlowService,
    GeminiService,
    StellarService,
    StellarAnchorService,
  ],
  exports: [SafiPayService, SafiPayFlowService],
})
export class SafiPayModule {}
