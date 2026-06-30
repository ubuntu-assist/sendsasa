import { Global, Module } from '@nestjs/common'
import { PhoneNumberService } from '@shared/phone-number.service'
import { JwtAuthService } from '@shared/jwt-auth.service'
import { FxRateService, fxRateService } from '@shared/fx-rate.service'
import { RatesService } from '@shared/rates.service'
import { MobileMoneyService } from '@shared/mobile-money.service'
import { UsernameService } from '@shared/username.service'
import { ReceiptGeneratorService } from '@shared/receipt-generator.service'
import { GeminiService } from '@shared/gemini.service'
import { PaymentRailService } from '@shared/payment-rail.service'

const SHARED_SERVICES = [
  PhoneNumberService,
  JwtAuthService,
  { provide: FxRateService, useValue: fxRateService },
  RatesService,
  MobileMoneyService,
  UsernameService,
  ReceiptGeneratorService,
  GeminiService,
  PaymentRailService,
]

@Global()
@Module({
  providers: SHARED_SERVICES,
  exports: SHARED_SERVICES,
})
export class SharedModule {}
