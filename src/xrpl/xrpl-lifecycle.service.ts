import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { xrplClient } from '../config/xrpl'

@Injectable()
export class XrplLifecycleService implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await xrplClient.connect()
  }

  async onModuleDestroy() {
    await xrplClient.disconnect()
  }
}
