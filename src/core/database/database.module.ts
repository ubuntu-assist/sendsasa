import { Module, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { connectDatabase, disconnectDatabase } from '@config/database'

@Module({})
export class DatabaseModule implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await connectDatabase()
  }

  async onModuleDestroy() {
    await disconnectDatabase()
  }
}
