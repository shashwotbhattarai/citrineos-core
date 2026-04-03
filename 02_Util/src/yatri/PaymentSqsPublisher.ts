// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { ILogObj, Logger } from 'tslog';

/**
 * Payload for payment settlement messages sent to SQS
 */
export interface PaymentSettlementPayload {
  /** UUID for idempotency - prevents duplicate charges */
  paymentIdempotencyKey: string;
  /** Database ID of the Transaction record */
  transactionDatabaseId: number;
  /** OCPP transaction ID */
  transactionId: string;
  /** Charging station identifier */
  stationId: string;
  /** Tenant ID for multi-tenant isolation */

  locationId: number;
  locationName?: string;

  tenantId: number;
  /** User's RFID token (lowercase) */
  idToken: string;
  /** Total amount to charge */
  amount: number;
  /** Currency code (e.g., 'NPR') */
  currency: string;
  /** Energy consumed in kWh */
  energyKwh: number;
  /** Transaction start time (ISO 8601) */
  startTime?: string;
  /** Transaction end time (ISO 8601) */
  endTime?: string;
  /** Reason for stopping the transaction */

  startSoc?: number;
  endSoc?: number;
  stoppedReason?: string;
}

/**
 * Result of publishing to SQS
 */
export interface SqsPublishResult {
  /** Whether the publish was successful */
  success: boolean;
  /** SQS message ID if successful */
  messageId?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Publisher for sending payment settlement requests to AWS SQS.
 *
 * This enables async payment processing:
 * 1. CitrineOS publishes payment request to SQS
 * 2. Yatri Energy Backend consumes and processes
 * 3. Backend calls webhook to update payment status
 *
 * @example
 * ```typescript
 * const publisher = new PaymentSqsPublisher('ap-south-1', 'https://sqs...', logger);
 * const result = await publisher.publish({
 *   paymentIdempotencyKey: 'uuid',
 *   transactionDatabaseId: 123,
 *   // ... other fields
 * });
 *
 * if (result.success) {
 *   // Update transaction status to QUEUED
 * } else {
 *   // Update transaction status to QUEUE_FAILED
 * }
 * ```
 */
export class PaymentSqsPublisher {
  private _sqsClient: SQSClient;
  private _queueUrl: string;
  private _logger: Logger<ILogObj>;

  /**
   * Creates a new PaymentSqsPublisher
   *
   * @param region - AWS region (e.g., 'ap-south-1')
   * @param queueUrl - Full SQS queue URL
   * @param logger - Logger instance
   */
  constructor(region: string, queueUrl: string, logger: Logger<ILogObj>) {
    this._sqsClient = new SQSClient({ region });
    this._queueUrl = queueUrl;
    this._logger = logger.getSubLogger({ name: 'PaymentSqsPublisher' });

    this._logger.info('PaymentSqsPublisher initialized', {
      region,
      queueUrl: this._maskQueueUrl(queueUrl),
    });
  }

  /**
   * Publishes a payment settlement request to SQS
   *
   * @param payload - Payment settlement payload
   * @returns Result with success status and messageId or error
   */
  async publish(payload: PaymentSettlementPayload): Promise<SqsPublishResult> {
    try {
      this._logger.debug('Publishing payment message to SQS', {
        paymentIdempotencyKey: payload.paymentIdempotencyKey,
        transactionId: payload.transactionId,
        amount: payload.amount,
        tenantId: payload.tenantId,
      });

      const command = new SendMessageCommand({
        QueueUrl: this._queueUrl,
        MessageBody: JSON.stringify(payload),
        // For FIFO queues: group by tenant for ordering within tenant
        MessageGroupId: payload.tenantId.toString(),
        // For FIFO queues: use idempotency key for deduplication
        MessageDeduplicationId: payload.paymentIdempotencyKey,
        // Add message attributes for filtering/routing
        MessageAttributes: {
          tenantId: {
            DataType: 'Number',
            StringValue: payload.tenantId.toString(),
          },
          stationId: {
            DataType: 'String',
            StringValue: payload.stationId,
          },
          transactionId: {
            DataType: 'String',
            StringValue: payload.transactionId,
          },
        },
      });

      const result = await this._sqsClient.send(command);

      this._logger.info('Payment message sent to SQS successfully', {
        messageId: result.MessageId,
        paymentIdempotencyKey: payload.paymentIdempotencyKey,
        transactionId: payload.transactionId,
        amount: payload.amount,
      });

      return {
        success: true,
        messageId: result.MessageId,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      this._logger.error('Failed to send payment message to SQS', {
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
   * Masks the queue URL for logging (hides account ID)
   */
  private _maskQueueUrl(url: string): string {
    // Mask account ID in URL: https://sqs.region.amazonaws.com/123456789012/queue-name
    return url.replace(/\/\d{12}\//, '/****/');
  }
}
