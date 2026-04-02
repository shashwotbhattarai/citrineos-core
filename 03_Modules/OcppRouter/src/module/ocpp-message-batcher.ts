// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { CallAction, MessageOrigin, OCPPVersion } from '@citrineos/base';
import { OCPPMessage } from '@citrineos/data';
import { ILogObj, Logger } from 'tslog';

export interface OCPPMessageRecord {
  tenantId: number;
  stationId: string;
  correlationId: string;
  origin: MessageOrigin;
  protocol: OCPPVersion;
  action: CallAction | string | null | undefined;
  message: any;
  timestamp: string;
}

/**
 * Batches OCPPMessage writes to reduce database load.
 *
 * Instead of writing each OCPP message to the database synchronously
 * inside a transaction (findOne + create + commit per message),
 * this class buffers messages in memory and flushes them in bulk.
 *
 * It also maintains an in-memory correlation map so that
 * CallResult/CallError messages can look up the action from
 * the original Call message without querying the database.
 */
export class OCPPMessageBatcher {
  private _buffer: OCPPMessageRecord[] = [];
  private _flushTimer: ReturnType<typeof setInterval>;
  private _logger: Logger<ILogObj>;

  // In-memory correlation: key = "tenantId:stationId:correlationId" → action
  // Replaces the OCPPMessage.findOne() DB query for action correlation
  private _correlationMap: Map<string, string | null | undefined> = new Map();

  // Limit correlation map size to prevent unbounded memory growth
  private static readonly MAX_CORRELATION_ENTRIES = 10000;
  private static readonly DEFAULT_BATCH_SIZE = 50;
  private static readonly DEFAULT_FLUSH_INTERVAL_MS = 5000;

  constructor(
    private readonly _batchSize: number = OCPPMessageBatcher.DEFAULT_BATCH_SIZE,
    flushIntervalMs: number = OCPPMessageBatcher.DEFAULT_FLUSH_INTERVAL_MS,
    logger?: Logger<ILogObj>,
  ) {
    this._logger = logger
      ? logger.getSubLogger({ name: this.constructor.name })
      : new Logger<ILogObj>({ name: this.constructor.name });

    this._flushTimer = setInterval(() => {
      this.flush().catch((err) => {
        this._logger.error('Periodic flush failed', err);
      });
    }, flushIntervalMs);
  }

  /**
   * Look up the action for a correlated message (replaces DB findOne).
   * Returns the action string if found, undefined if not.
   */
  getCorrelatedAction(
    tenantId: number,
    stationId: string,
    correlationId: string,
  ): string | null | undefined {
    const key = `${tenantId}:${stationId}:${correlationId}`;
    return this._correlationMap.get(key);
  }

  /**
   * Store a correlation entry for later lookup.
   */
  setCorrelation(
    tenantId: number,
    stationId: string,
    correlationId: string,
    action: string | null | undefined,
  ): void {
    const key = `${tenantId}:${stationId}:${correlationId}`;
    this._correlationMap.set(key, action);

    // Evict oldest entries if map grows too large
    if (this._correlationMap.size > OCPPMessageBatcher.MAX_CORRELATION_ENTRIES) {
      const firstKey = this._correlationMap.keys().next().value;
      if (firstKey) {
        this._correlationMap.delete(firstKey);
      }
    }
  }

  /**
   * Add a message to the buffer for batched writing.
   * Triggers immediate flush if buffer reaches batch size.
   */
  enqueue(record: OCPPMessageRecord): void {
    this._buffer.push(record);
    if (this._buffer.length >= this._batchSize) {
      this.flush().catch((err) => {
        this._logger.error('Batch size flush failed', err);
      });
    }
  }

  /**
   * Flush all buffered messages to the database via bulkCreate.
   */
  async flush(): Promise<void> {
    if (this._buffer.length === 0) {
      return;
    }
    const batch = this._buffer.splice(0);
    try {
      await OCPPMessage.bulkCreate(batch as any[]);
      this._logger.debug(`Flushed ${batch.length} OCPPMessages to database`);
    } catch (err) {
      // Log but don't crash — message logging is non-critical
      this._logger.error(`Failed to flush ${batch.length} OCPPMessages`, err);
    }
  }

  /**
   * Clean up: clear the flush interval and attempt a final flush.
   */
  async destroy(): Promise<void> {
    clearInterval(this._flushTimer);
    await this.flush();
    this._correlationMap.clear();
  }
}
