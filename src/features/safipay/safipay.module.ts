import { Module } from '@nestjs/common'
import { SafiPayService } from './safipay.service'
import { SafiPayFlowService } from './safipay-flow.service'
import { SafiPayRedirectController } from './safipay-redirect.controller'
import { PawapayService } from '@payments/pawapay/pawapay.service'

@Module({
  controllers: [SafiPayRedirectController],
  providers: [SafiPayService, SafiPayFlowService, PawapayService],
  exports: [SafiPayService, SafiPayFlowService],
})
export class SafiPayModule {}
