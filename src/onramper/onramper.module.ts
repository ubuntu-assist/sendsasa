import { Module } from '@nestjs/common'
import { OnramperController } from './onramper.controller'
import { OnramperService } from './onramper.service'

@Module({
  providers: [OnramperService],
  controllers: [OnramperController],
  exports: [OnramperService],
})
export class OnramperModule {}
