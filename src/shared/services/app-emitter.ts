import { EventEmitter } from 'node:events'

// Shared module-level emitter for feature service singletons.
// NestJS-managed services with DI should inject EventEmitter2 from @nestjs/event-emitter.
export const appEmitter = new EventEmitter()

export const EVENTS = {
  RECEIPT_SEND: 'receipt.send',
} as const
