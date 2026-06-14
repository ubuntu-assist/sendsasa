import { Global, Module } from '@nestjs/common'
import { PhoneNumberService } from '../services/phone-number.service'
import { JwtAuthService } from '../services/jwt-auth.service'
import { FxRateService, fxRateService } from '../services/fx-rate.service'
import { RatesService } from '../services/rates.service'
import { MobileMoneyService } from '../services/mobile-money.service'
import { UsernameService } from '../services/username.service'
import { ReceiptGeneratorService } from '../services/receipt-generator.service'
import { GeminiService } from '../services/gemini.service'

const SHARED_SERVICES = [
  PhoneNumberService,
  JwtAuthService,
  { provide: FxRateService, useValue: fxRateService },
  RatesService,
  MobileMoneyService,
  UsernameService,
  ReceiptGeneratorService,
  GeminiService,
]

@Global()
@Module({
  providers: SHARED_SERVICES,
  exports: SHARED_SERVICES,
})
export class SharedModule {}
