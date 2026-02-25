// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

// Documentation: See PAYMENT_QUEUE_INTEGRATION.md for full details

import * as amqplib from 'amqplib';
import { ILogObj, Logger } from 'tslog';
import { PaymentSettlementPayload } from './PaymentSqsPublisher';

/**
 * Result of publishing to RabbitMQ
 */
export interface RabbitMqPublishResult {
  /** Whether the publish was successful */
  success: boolean;
  /** Error message if failed */
  error?: string;
}

/**
 * Routing keys for payment-related messages
 */
export const PaymentRoutingKeys = {
  /** Route for payment settlement requests */
  SETTLEMENT: 'payment.settlement',
  /** Route for payment status updates (future use) */
  STATUS_UPDATE: 'payment.status',
  /** Route for payment refunds (future use) */
  REFUND: 'payment.refund',
} as const;

/**
 * Publisher for sending payment settlement requests to RabbitMQ.
 *
 * Uses direct exchange with routing keys for targeted message delivery.
 *
 * Exchange: citrineos (or configured exchange name)
 * Routing Key: payment.settlement
 * Queue: paymentRequests (consumer should bind this queue to the exchange with the routing key)
 *
 * @example
 * ```typescript
 * const publisher = new PaymentRabbitMqPublisher(
 *   'amqp://admin:password@localhost:5672',
 *   'citrineos',
 *   logger
 * );
 * await publisher.connect();
 *
 * const result = await publisher.publish({
 *   paymentIdempotencyKey: 'uuid',
 *   transactionDatabaseId: 123,
 *   // ... other fields
 * });
 *
 * if (result.success) {
 *   // Message sent successfully
 * }
 * ```
 *
 * Consumer Setup (Yatri Energy Backend):
 * ```typescript
 * // 1. Assert the exchange as direct type
 * channel.assertExchange('citrineos', 'direct', { durable: true });
 *
 * // 2. Assert the queue
 * channel.assertQueue('paymentRequests', { durable: true });
 *
 * // 3. Bind the queue to the exchange with the routing key
 * channel.bindQueue('paymentRequests', 'citrineos', 'payment.settlement');
 *
 * // 4. Consume messages
 * channel.consume('paymentRequests', (msg) => {
 *   const payload = JSON.parse(msg.content.toString());
 *   // Process payment...
 * });
 * ```
 */
export class PaymentRabbitMqPublisher {
  private _connection?: amqplib.Connection;
  private _channel?: amqplib.Channel;
  private _url: string;
  private _exchange: string;
  private _logger: Logger<ILogObj>;
  private _isConnected: boolean = false;

  /**
   * Creates a new PaymentRabbitMqPublisher
   *
   * @param url - RabbitMQ connection URL (e.g., 'amqp://admin:password@localhost:5672')
   * @param exchange - Exchange name (e.g., 'citrineos')
   * @param logger - Logger instance
   */
  constructor(url: string, exchange: string, logger: Logger<ILogObj>) {
    this._url = url;
    this._exchange = exchange;
    this._logger = logger.getSubLogger({ name: 'PaymentRabbitMqPublisher' });

    this._logger.info('PaymentRabbitMqPublisher initialized', {
      exchange: this._exchange,
      url: this._maskUrl(url),
    });
  }

  /**
   * Connects to RabbitMQ and sets up the exchange
   */
  async connect(): Promise<void> {
    try {
      this._logger.info('Connecting to RabbitMQ...');

      this._connection = await amqplib.connect(this._url);
      this._channel = await this._connection.createChannel();

      // Assert exchange as direct type for routing key based delivery
      await this._channel.assertExchange(this._exchange, 'direct', {
        durable: true,
      });

      // Set up connection event handlers
      this._connection.on('close', () => {
        this._logger.warn('RabbitMQ connection closed');
        this._isConnected = false;
        this._scheduleReconnect();
      });

      this._connection.on('error', (err) => {
        this._logger.error('RabbitMQ connection error', err);
        this._isConnected = false;
      });

      this._channel.on('error', (err) => {
        this._logger.error('RabbitMQ channel error', err);
      });

      this._isConnected = true;
      this._logger.info('Connected to RabbitMQ successfully', {
        exchange: this._exchange,
      });
    } catch (error) {
      this._logger.error('Failed to connect to RabbitMQ', error);
      this._isConnected = false;
      throw error;
    }
  }

  /**
   * Publishes a payment settlement request to RabbitMQ
   *
   * @param payload - Payment settlement payload
   * @param routingKey - Routing key (defaults to 'payment.settlement')
   * @returns Result with success status or error
   */
  async publish(
    payload: PaymentSettlementPayload,
    routingKey: string = PaymentRoutingKeys.SETTLEMENT,
  ): Promise<RabbitMqPublishResult> {
    if (!this._isConnected || !this._channel) {
      // Try to reconnect
      try {
        await this.connect();
      } catch (error) {
        return {
          success: false,
          error: 'Not connected to RabbitMQ and reconnection failed',
        };
      }
    }

    try {
      this._logger.debug('Publishing payment message to RabbitMQ', {
        paymentIdempotencyKey: payload.paymentIdempotencyKey,
        transactionId: payload.transactionId,
        amount: payload.amount,
        tenantId: payload.tenantId,
        routingKey,
      });

      const messageBuffer = Buffer.from(JSON.stringify(payload), 'utf-8');

      const success = this._channel!.publish(this._exchange, routingKey, messageBuffer, {
        persistent: true, // Message survives broker restart
        contentType: 'application/json',
        contentEncoding: 'utf-8',
        headers: {
          tenantId: payload.tenantId,
          stationId: payload.stationId,
          transactionId: payload.transactionId,
          paymentIdempotencyKey: payload.paymentIdempotencyKey,
          timestamp: new Date().toISOString(),
        },
      });

      if (success) {
        this._logger.info('Payment message sent to RabbitMQ successfully', {
          paymentIdempotencyKey: payload.paymentIdempotencyKey,
          transactionId: payload.transactionId,
          amount: payload.amount,
          routingKey,
        });

        return { success: true };
      } else {
        this._logger.warn('RabbitMQ publish returned false (buffer full)', {
          paymentIdempotencyKey: payload.paymentIdempotencyKey,
        });

        return {
          success: false,
          error: 'Channel buffer is full',
        };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this._logger.error('Failed to send payment message to RabbitMQ', {
        error: errorMessage,
        paymentIdempotencyKey: payload.paymentIdempotencyKey,
        transactionId: payload.transactionId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    }
  }

  /**
   * Checks if connected to RabbitMQ
   */
  isConnected(): boolean {
    return this._isConnected;
  }

  /**
   * Closes the connection
   */
  async close(): Promise<void> {
    try {
      if (this._channel) {
        await this._channel.close();
      }
      if (this._connection) {
        await this._connection.close();
      }
      this._isConnected = false;
      this._logger.info('RabbitMQ connection closed');
    } catch (error) {
      this._logger.error('Error closing RabbitMQ connection', error);
    }
  }

  /**
   * Schedules a reconnection attempt
   */
  private _scheduleReconnect(): void {
    setTimeout(async () => {
      this._logger.info('Attempting to reconnect to RabbitMQ...');
      try {
        await this.connect();
      } catch (error) {
        this._logger.error('Reconnection failed, will retry...', error);
        this._scheduleReconnect();
      }
    }, 5000); // Retry every 5 seconds
  }

  /**
   * Masks the URL for logging (hides password)
   */
  private _maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      if (parsed.password) {
        parsed.password = '****';
      }
      return parsed.toString();
    } catch {
      return url.replace(/:([^:@]+)@/, ':****@');
    }
  }
}
