import { Global, Module } from '@nestjs/common'
import {
  UserRepository,
  TransactionRepository,
  DealRepository,
  DisputeRepository,
  GroupRepository,
  GroupMemberRepository,
  PayrollRepository,
  InvoiceRepository,
} from './repositories'

const repositories = [
  UserRepository,
  TransactionRepository,
  DealRepository,
  DisputeRepository,
  GroupRepository,
  GroupMemberRepository,
  PayrollRepository,
  InvoiceRepository,
]

// @Global() — all feature modules can inject repositories without importing DomainModule explicitly.
@Global()
@Module({
  providers: repositories,
  exports: repositories,
})
export class DomainModule {}
