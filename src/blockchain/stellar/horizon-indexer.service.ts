import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { Horizon, rpc as SorobanRpc } from '@stellar/stellar-sdk'
import mongoose from 'mongoose'
import config from '@common/utils/config'
import { StellarService } from './stellar.service'
import logger from '@common/utils/logger'
import type { StellarPaymentEvent, SorobanContractEvent } from './stellar.types'

const HORIZON_URL = config.STELLAR_HORIZON_URL
const SOROBAN_RPC_URL = config.STELLAR_SOROBAN_RPC_URL
const TRUSTLOCK_CONTRACT_ID = config.STELLAR_TRUSTLOCK_CONTRACT_ID

// MongoDB collection that stores the last seen Horizon cursor (paging_token).
// A single document with key='horizon' is upserted on every event.
const CursorSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  paging_token: { type: String, required: true },
})
const CursorModel =
  (mongoose.models['stellar_horizon_cursor'] as mongoose.Model<any>) ??
  mongoose.model('stellar_horizon_cursor', CursorSchema)

// MongoDB collection that deduplicates ingested Soroban events.
const EventSchema = new mongoose.Schema({
  eventId: { type: String, required: true, unique: true },
  contractId: { type: String },
  topic: [String],
  txHash: { type: String },
  ledger: { type: Number },
  ingestedAt: { type: Date, default: Date.now },
})
const EventModel =
  (mongoose.models['stellar_contract_events'] as mongoose.Model<any>) ??
  mongoose.model('stellar_contract_events', EventSchema)

@Injectable()
export class HorizonIndexerService implements OnModuleInit, OnModuleDestroy {
  private readonly horizonServer = new Horizon.Server(HORIZON_URL)
  private readonly rpcServer = new SorobanRpc.Server(SOROBAN_RPC_URL)
  private stopStream = false
  private streamHandle: (() => void) | null = null
  private eventPollInterval: ReturnType<typeof setInterval> | null = null

  // Injected dispatch handlers (registered by feature services at startup)
  private readonly paymentHandlers: Array<(event: StellarPaymentEvent) => Promise<void>> = []
  private readonly contractEventHandlers: Array<(event: SorobanContractEvent) => Promise<void>> = []

  constructor(private readonly stellar: StellarService) {}

  onModuleInit() {
    void this.startPaymentStream()
    this.startContractEventPoll()
  }

  onModuleDestroy() {
    this.stopStream = true
    if (this.streamHandle) {
      this.streamHandle()
      this.streamHandle = null
    }
    if (this.eventPollInterval) {
      clearInterval(this.eventPollInterval)
      this.eventPollInterval = null
    }
  }

  /** Register a handler for incoming Stellar payment events. */
  onPayment(handler: (event: StellarPaymentEvent) => Promise<void>) {
    this.paymentHandlers.push(handler)
  }

  /** Register a handler for Soroban contract events. */
  onContractEvent(handler: (event: SorobanContractEvent) => Promise<void>) {
    this.contractEventHandlers.push(handler)
  }

  /**
   * Start a cursor-based Horizon payment stream for the platform account.
   * The cursor is persisted to MongoDB on every message so reconnects resume
   * exactly where they left off — zero missed events, zero duplicates.
   */
  async startPaymentStream() {
    if (this.stopStream) return

    const cursorDoc = await CursorModel.findOne({ key: 'horizon' }).lean() as { paging_token?: string } | null
    const cursor = cursorDoc?.paging_token ?? 'now'

    logger.info(`[HorizonIndexer] Starting payment stream (cursor: ${cursor})`)

    this.streamHandle = this.horizonServer
      .payments()
      .forAccount(this.stellar.platformPublicKey)
      .cursor(cursor)
      .stream({
        onmessage: async (payment: any) => {
          try {
            await CursorModel.updateOne(
              { key: 'horizon' },
              { $set: { paging_token: payment.paging_token } },
              { upsert: true },
            )
            const event = payment as StellarPaymentEvent
            for (const handler of this.paymentHandlers) {
              await handler(event).catch((err) =>
                logger.error('[HorizonIndexer] Payment handler error:', err),
              )
            }
          } catch (err) {
            logger.error('[HorizonIndexer] onmessage error:', err)
          }
        },
        onerror: (err: any) => {
          if (this.stopStream) return
          logger.error('[HorizonIndexer] Stream error, reconnecting in 5s:', err?.message ?? err)
          setTimeout(() => void this.startPaymentStream(), 5000)
        },
      }) as unknown as () => void
  }

  /**
   * Poll Soroban RPC for TrustLock contract events every 30 seconds.
   * On-chain retention is 7 days — this poll must run continuously so
   * no events are lost. Deduplication is done via the eventId in MongoDB.
   */
  startContractEventPoll() {
    if (!TRUSTLOCK_CONTRACT_ID) return

    const poll = async () => {
      try {
        const response = await this.rpcServer.getEvents({
          filters: [
            {
              type: 'contract',
              contractIds: [TRUSTLOCK_CONTRACT_ID],
            },
          ],
          cursor: '0',
        })

        for (const event of (response as any).events ?? []) {
          const alreadyIngested = await EventModel.exists({ eventId: event.id })
          if (alreadyIngested) continue

          await EventModel.create({
            eventId: event.id,
            contractId: event.contractId,
            topic: event.topic,
            txHash: event.txHash,
            ledger: event.ledger,
          })

          const parsed: SorobanContractEvent = {
            id: event.id,
            ledger: event.ledger,
            ledgerClosedAt: event.ledgerClosedAt,
            contractId: event.contractId,
            type: event.type,
            topic: event.topic,
            value: event.value,
            txHash: event.txHash,
          }

          for (const handler of this.contractEventHandlers) {
            await handler(parsed).catch((err) =>
              logger.error('[HorizonIndexer] Contract event handler error:', err),
            )
          }
        }
      } catch (err) {
        logger.error('[HorizonIndexer] Soroban event poll error:', (err as Error).message)
      }
    }

    this.eventPollInterval = setInterval(() => void poll(), 30_000)
    void poll()
  }
}
