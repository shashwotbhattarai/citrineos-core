// SPDX-FileCopyrightText: 2026 Contributors to the CitrineOS Project
//
// SPDX-License-Identifier: Apache-2.0

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Transaction } from '@citrineos/data';
import { ILogObj, Logger } from 'tslog';

/**
 * Request body for payment callback webhook from Yatri Energy Backend
 */
export interface PaymentCallbackRequest {
  /** UUID matching the paymentIdempotencyKey in Transaction */
  paymentIdempotencyKey: string;
  /** Database ID of the Transaction record */
  transactionDatabaseId: number;
  /** Tenant ID for multi-tenant validation */
  tenantId: number;
  /** Payment result status */
  status: 'COMPLETED' | 'FAILED';
  /** Wallet transaction ID (on success) */
  walletTransactionId?: string;
  /** Wallet provider name (e.g., 'yatri', 'esewa', 'khalti') */
  walletProvider?: string;
  /** Error code (on failure) */
  errorCode?: string;
  /** Error message (on failure) */
  errorMessage?: string;
}

/**
 * Response body for payment callback
 */
export interface PaymentCallbackResponse {
  success: boolean;
  message?: string;
  error?: string;
}

/**
 * JSON schema for request validation
 */
const paymentCallbackRequestSchema = {
  type: 'object',
  required: ['paymentIdempotencyKey', 'transactionDatabaseId', 'tenantId', 'status'],
  properties: {
    paymentIdempotencyKey: { type: 'string', format: 'uuid' },
    transactionDatabaseId: { type: 'integer' },
    tenantId: { type: 'integer' },
    status: { type: 'string', enum: ['COMPLETED', 'FAILED'] },
    walletTransactionId: { type: 'string' },
    walletProvider: { type: 'string' },
    errorCode: { type: 'string' },
    errorMessage: { type: 'string' },
  },
};

/**
 * JSON schema for response
 */
const paymentCallbackResponseSchema = {
  200: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      message: { type: 'string' },
    },
  },
  400: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
  404: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
  500: {
    type: 'object',
    properties: {
      success: { type: 'boolean' },
      error: { type: 'string' },
    },
  },
};

/**
 * Registers the payment callback webhook API endpoint.
 *
 * This endpoint is called by Yatri Energy Backend after processing a payment
 * from the SQS queue. It updates the transaction's payment status.
 *
 * Endpoint: POST /data/transactions/payment-callback
 *
 * @param server - Fastify server instance
 * @param logger - Logger instance
 *
 * @example
 * ```bash
 * curl -X POST http://localhost:8080/data/transactions/payment-callback \
 *   -H "Content-Type: application/json" \
 *   -d '{
 *     "paymentIdempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
 *     "transactionDatabaseId": 123,
 *     "tenantId": 1,
 *     "status": "COMPLETED",
 *     "walletTransactionId": "wallet-txn-456"
 *   }'
 * ```
 */
export function registerPaymentCallbackApi(server: FastifyInstance, logger: Logger<ILogObj>): void {
  const callbackLogger = logger.getSubLogger({ name: 'PaymentCallbackApi' });

  server.post<{
    Body: PaymentCallbackRequest;
    Reply: PaymentCallbackResponse;
  }>(
    '/data/transactions/payment-callback',
    {
      schema: {
        body: paymentCallbackRequestSchema,
        response: paymentCallbackResponseSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: PaymentCallbackRequest }>,
      reply: FastifyReply,
    ): Promise<PaymentCallbackResponse> => {
      const callback = request.body;

      callbackLogger.info('Payment callback received', {
        paymentIdempotencyKey: callback.paymentIdempotencyKey,
        transactionDatabaseId: callback.transactionDatabaseId,
        tenantId: callback.tenantId,
        status: callback.status,
      });

      try {
        // Find transaction by database ID, tenant ID, and idempotency key
        const transaction = await Transaction.findOne({
          where: {
            id: callback.transactionDatabaseId,
            tenantId: callback.tenantId,
            paymentIdempotencyKey: callback.paymentIdempotencyKey,
          },
        });

        if (!transaction) {
          callbackLogger.warn('Transaction not found for payment callback', callback);
          return reply.code(404).send({
            success: false,
            error: 'Transaction not found or idempotency key mismatch',
          });
        }

        // Idempotency check: if already in terminal state, return success
        if (transaction.paymentStatus === 'COMPLETED' || transaction.paymentStatus === 'FAILED') {
          callbackLogger.info('Payment already processed (idempotent)', {
            transactionId: transaction.transactionId,
            existingStatus: transaction.paymentStatus,
            requestedStatus: callback.status,
          });
          return reply.send({
            success: true,
            message: 'Payment already processed',
          });
        }

        // Update transaction based on callback status
        if (callback.status === 'COMPLETED') {
          await Transaction.update(
            {
              paymentStatus: 'COMPLETED',
              walletTransactionId: callback.walletTransactionId,
              walletProvider: callback.walletProvider,
              paymentCompletedAt: new Date().toISOString(),
            },
            { where: { id: transaction.id } },
          );

          callbackLogger.info('Payment completed successfully', {
            transactionId: transaction.transactionId,
            transactionDatabaseId: transaction.id,
            walletTransactionId: callback.walletTransactionId,
            walletProvider: callback.walletProvider,
          });

          return reply.send({
            success: true,
            message: 'Payment completed',
          });
        } else {
          // status === 'FAILED'
          const errorMsg = callback.errorMessage || callback.errorCode || 'Unknown error';

          await Transaction.update(
            {
              paymentStatus: 'FAILED',
              paymentErrorMessage: errorMsg,
            },
            { where: { id: transaction.id } },
          );

          callbackLogger.error('Payment failed', {
            transactionId: transaction.transactionId,
            transactionDatabaseId: transaction.id,
            errorCode: callback.errorCode,
            errorMessage: callback.errorMessage,
          });

          return reply.send({
            success: true,
            message: 'Payment failure recorded',
          });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        callbackLogger.error('Error processing payment callback', {
          error: errorMessage,
          callback,
        });

        return reply.code(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    },
  );

  callbackLogger.info('Payment callback API registered at /data/transactions/payment-callback');
}
