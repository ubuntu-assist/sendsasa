import { Injectable } from '@nestjs/common'
import { FxRateService } from './fx-rate.service'

// Proxy (refactoring.guru/design-patterns/proxy):
// Subclasses FxRateService so SharedModule can use `useClass` instead of
// `useValue`, placing the singleton lifecycle under NestJS DI management.
// FxRateService already maintains its own in-memory TTL cache, so this
// wrapper adds no new caching logic.
@Injectable()
export class CachedFxRateService extends FxRateService {}
