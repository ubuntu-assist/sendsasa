import { Module } from '@nestjs/common'
import { JupiterService } from './jupiter.service'
import { OneInchService } from './oneinch.service'
import { XrplDexService } from './xrpl-dex.service'

@Module({
  providers: [JupiterService, OneInchService, XrplDexService],
  exports: [JupiterService, OneInchService, XrplDexService],
})
export class DexModule {}
