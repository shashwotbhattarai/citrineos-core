# Async Payment Settlement via AWS SQS

**Implementation Date**: January 22, 2026
**Branch**: `async-payment`
**Status**: Ready for Testing

---

## Overview

This feature changes the payment settlement process from **synchronous HTTP calls** to **asynchronous AWS SQS messaging**. When a charging session ends (StopTransaction), instead of blocking while waiting for the Yatri Energy Backend to process the payment, CitrineOS now pushes the payment request to an AWS SQS queue and returns immediately.

### Benefits

- **Resilience**: If Yatri Energy Backend is down, payments are queued and processed when it recovers
- **No Lost Transactions**: SQS provides guaranteed delivery with retries
- **Faster Response**: Charger gets immediate response, no waiting for wallet API
- **Infrastructure Isolation**: SQS is external to CitrineOS, no shared infrastructure access needed

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     CitrineOS Core                              │
│  StopTransaction → Calculate Cost → Publish to SQS              │
│                                          ↓                      │
│                              ┌───────────┴───────────┐          │
│                              ↓                       ↓          │
│                           Success                 Failure       │
│                              ↓                       ↓          │
│                     paymentStatus=QUEUED    paymentStatus=QUEUE_FAILED
│                                                                 │
│                    Return immediately to charger                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                         AWS SQS Queue
                    (payment-settlement-queue.fifo)
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                  Yatri Energy Backend                           │
│  Consume from SQS → Process via Wallet gRPC → Webhook callback  │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    POST /data/transactions/payment-callback
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│                     CitrineOS Core                              │
│           Update paymentStatus = COMPLETED or FAILED            │
└─────────────────────────────────────────────────────────────────┘
```

---

## Payment Status Flow

| Status         | Description                                                     |
| -------------- | --------------------------------------------------------------- |
| `NOT_REQUIRED` | No payment needed (zero cost, integration disabled, no idToken) |
| `QUEUED`       | Successfully pushed to SQS, waiting for midlayer to process     |
| `QUEUE_FAILED` | Failed to push to SQS (can be retried later)                    |
| `COMPLETED`    | Payment successfully processed by midlayer                      |
| `FAILED`       | Payment failed after midlayer attempted processing              |

```
Transaction ends (StopTransaction)
         ↓
   Payment needed?
         ↓
    ┌────┴────┐
    No       Yes
    ↓         ↓
NOT_REQUIRED  Try SQS Publish
              ↓
       ┌──────┴──────┐
       ↓             ↓
    Success       Failure
       ↓             ↓
    QUEUED     QUEUE_FAILED
       ↓          (can retry)
  Midlayer webhook
       ↓
    ┌──┴──┐
    ↓     ↓
COMPLETED FAILED
```

---

## Database Changes

New columns added to `Transactions` table:

| Column                  | Type          | Purpose                                                 |
| ----------------------- | ------------- | ------------------------------------------------------- |
| `paymentStatus`         | ENUM          | NOT_REQUIRED, QUEUED, QUEUE_FAILED, COMPLETED, FAILED   |
| `paymentIdempotencyKey` | UUID (unique) | Prevents duplicate charges                              |
| `walletTransactionId`   | STRING        | Wallet transaction ID from midlayer                     |
| `walletProvider`        | STRING        | Wallet provider name (e.g., 'yatri', 'esewa', 'khalti') |
| `paymentCompletedAt`    | TIMESTAMP     | When payment settled                                    |
| `paymentErrorMessage`   | TEXT          | Failure reason                                          |
| `sqsMessageId`          | STRING        | SQS message ID for tracking                             |

---

## SQS Message Format

```json
{
  "paymentIdempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "transactionDatabaseId": 123,
  "transactionId": "TXN-001",
  "stationId": "yatri-1-ioc-1-sec1",
  "tenantId": 1,
  "idToken": "d6a3fa03",
  "amount": 150.5,
  "currency": "NPR",
  "energyKwh": 2.5,
  "startTime": "2026-01-22T10:00:00Z",
  "endTime": "2026-01-22T10:30:00Z",
  "stoppedReason": "Remote"
}
```

### SQS Message Attributes

- `tenantId` (Number) - For filtering/routing
- `stationId` (String) - For logging/debugging
- `transactionId` (String) - For correlation

---

## Webhook Callback API

**Endpoint**: `POST /data/transactions/payment-callback`

### Request Body

```json
{
  "paymentIdempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
  "transactionDatabaseId": 123,
  "tenantId": 1,
  "status": "COMPLETED",
  "walletTransactionId": "wallet-txn-456",
  "walletProvider": "yatri",
  "errorCode": null,
  "errorMessage": null
}
```

| Field                   | Type    | Required | Description                                             |
| ----------------------- | ------- | -------- | ------------------------------------------------------- |
| `paymentIdempotencyKey` | UUID    | Yes      | Must match the key sent in SQS message                  |
| `transactionDatabaseId` | Integer | Yes      | Database ID of the transaction                          |
| `tenantId`              | Integer | Yes      | Tenant ID for validation                                |
| `status`                | String  | Yes      | `COMPLETED` or `FAILED`                                 |
| `walletTransactionId`   | String  | No       | Wallet transaction ID (on success)                      |
| `walletProvider`        | String  | No       | Wallet provider name (e.g., 'yatri', 'esewa', 'khalti') |
| `errorCode`             | String  | No       | Error code (on failure)                                 |
| `errorMessage`          | String  | No       | Error description (on failure)                          |

### Response

**Success (200)**:

```json
{
  "success": true,
  "message": "Payment completed"
}
```

**Not Found (404)**:

```json
{
  "success": false,
  "error": "Transaction not found or idempotency key mismatch"
}
```

### Idempotency

The webhook is idempotent. If called multiple times with the same `paymentIdempotencyKey`:

- First call: Updates transaction status
- Subsequent calls: Returns success without modifying data

---

## Files Changed

### Created

| File                                                              | Purpose               |
| ----------------------------------------------------------------- | --------------------- |
| `migrations/20260122000000-add-payment-status-to-transactions.ts` | Database migration    |
| `02_Util/src/yatri/PaymentSqsPublisher.ts`                        | SQS publisher service |
| `03_Modules/Transactions/src/module/PaymentCallbackApi.ts`        | Webhook endpoint      |

### Modified

| File                                            | Changes                           |
| ----------------------------------------------- | --------------------------------- |
| `01_Data/.../Transaction.ts`                    | Added payment status fields       |
| `00_Base/src/interfaces/dto/transaction.dto.ts` | Added payment fields to DTO       |
| `00_Base/src/config/types.ts`                   | Added SQS config schema           |
| `03_Modules/Transactions/src/module/module.ts`  | Replaced sync HTTP with SQS       |
| `02_Util/src/index.ts`                          | Export PaymentSqsPublisher        |
| `03_Modules/Transactions/src/index.ts`          | Export registerPaymentCallbackApi |
| `Server/src/index.ts`                           | Register webhook API              |
| `Server/src/config/envs/docker.ts`              | Added SQS config                  |
| `Server/.env.example`                           | Added SQS env vars                |
| `02_Util/package.json`                          | Added @aws-sdk/client-sqs         |
| `03_Modules/Transactions/package.json`          | Added uuid                        |

---

## Configuration

### Environment Variables

```bash
# AWS SQS Configuration
YATRI_ENERGY_SQS_REGION=ap-south-1
YATRI_ENERGY_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/payment-settlement-queue.fifo
```

### AWS Credentials

CitrineOS needs AWS credentials to publish to SQS. Options:

1. **IAM Role (Recommended for EC2)**: Attach IAM role to EC2 instance
2. **Environment Variables**: Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
3. **Shared Credentials File**: `~/.aws/credentials`

Required IAM permissions:

```json
{
  "Effect": "Allow",
  "Action": ["sqs:SendMessage"],
  "Resource": "arn:aws:sqs:ap-south-1:ACCOUNT_ID:payment-settlement-queue.fifo"
}
```

---

## Deployment Checklist

### 1. AWS SQS Setup

- [ ] Create FIFO queue: `payment-settlement-queue.fifo`
- [ ] Enable content-based deduplication
- [ ] Set message retention: 14 days (recommended)
- [ ] Set visibility timeout: 30 seconds
- [ ] Create dead-letter queue: `payment-settlement-dlq.fifo`
- [ ] Configure DLQ redrive policy (max receives: 3)

### 2. IAM Configuration

- [ ] Create IAM policy with `sqs:SendMessage` permission
- [ ] Attach to EC2 instance role OR create access key for CitrineOS
- [ ] Create IAM policy with `sqs:ReceiveMessage`, `sqs:DeleteMessage` for Yatri Energy Backend

### 3. CitrineOS Configuration

- [ ] Set `YATRI_ENERGY_SQS_REGION` environment variable
- [ ] Set `YATRI_ENERGY_SQS_QUEUE_URL` environment variable
- [ ] Configure AWS credentials (IAM role or access keys)

### 4. Database Migration

- [ ] Run migration: `npm run migration:run` (or let CitrineOS auto-migrate on startup)
- [ ] Verify new columns exist in Transactions table

### 5. Yatri Energy Backend Implementation

- [ ] Implement SQS consumer to poll messages from queue
- [ ] Process payment via Wallet gRPC
- [ ] Call CitrineOS webhook with result
- [ ] Delete message from queue after successful processing
- [ ] Handle DLQ messages for manual review

### 6. Testing

- [ ] Test successful payment flow (end-to-end)
- [ ] Test SQS publish failure (verify QUEUE_FAILED status)
- [ ] Test webhook idempotency (call twice with same key)
- [ ] Test webhook with FAILED status
- [ ] Test with SQS disabled (verify NOT_REQUIRED for zero-cost transactions)

### 7. Monitoring

- [ ] Set up CloudWatch alarms for SQS queue depth
- [ ] Set up CloudWatch alarms for DLQ messages
- [ ] Monitor CitrineOS logs for payment errors
- [ ] Create dashboard for payment status distribution

---

## Yatri Energy Backend Requirements

The midlayer needs to implement:

### 1. SQS Consumer

```python
# Pseudocode
while True:
    messages = sqs.receive_message(queue_url, max_messages=10, wait_time=20)
    for message in messages:
        payload = json.loads(message.body)

        # Idempotency check
        if already_processed(payload.paymentIdempotencyKey):
            sqs.delete_message(message)
            continue

        # Process payment
        try:
            result = wallet_grpc.make_payment(
                user_id=payload.idToken,
                amount=payload.amount,
                currency=payload.currency,
                description=f"EV Charging - {payload.stationId}"
            )

            # Call webhook
            call_citrineos_webhook(
                paymentIdempotencyKey=payload.paymentIdempotencyKey,
                transactionDatabaseId=payload.transactionDatabaseId,
                tenantId=payload.tenantId,
                status="COMPLETED",
                walletTransactionId=result.transaction_id
            )
        except PaymentError as e:
            call_citrineos_webhook(
                paymentIdempotencyKey=payload.paymentIdempotencyKey,
                transactionDatabaseId=payload.transactionDatabaseId,
                tenantId=payload.tenantId,
                status="FAILED",
                errorCode=e.code,
                errorMessage=str(e)
            )

        sqs.delete_message(message)
```

### 2. Webhook Call

```bash
curl -X POST https://citrineos-server:8080/data/transactions/payment-callback \
  -H "Content-Type: application/json" \
  -d '{
    "paymentIdempotencyKey": "550e8400-e29b-41d4-a716-446655440000",
    "transactionDatabaseId": 123,
    "tenantId": 1,
    "status": "COMPLETED",
    "walletTransactionId": "wallet-txn-456"
  }'
```

---

## Handling QUEUE_FAILED Transactions

Transactions with `paymentStatus = QUEUE_FAILED` need manual or automated retry:

### Query Failed Transactions

```sql
SELECT id, "transactionId", "stationId", "totalCost", "paymentErrorMessage", "createdAt"
FROM "Transactions"
WHERE "paymentStatus" = 'QUEUE_FAILED'
ORDER BY "createdAt" DESC;
```

### Future Enhancement: Retry API

A future enhancement could add an API endpoint to retry failed queue operations:

```
POST /data/transactions/{id}/retry-payment
```

---

## Rollback Plan

If issues arise:

1. **Disable SQS Integration**: Remove `YATRI_ENERGY_SQS_QUEUE_URL` from environment

   - System will fall back to setting `paymentStatus = NOT_REQUIRED`

2. **Revert Code**: The old synchronous code is preserved in git history

3. **Database**: Migration has `down` method to remove columns if needed

---

## Troubleshooting

### Payment stuck in QUEUED

1. Check SQS queue for pending messages
2. Check Yatri Energy Backend logs for consumer errors
3. Check DLQ for failed messages

### Payment shows QUEUE_FAILED

1. Check CitrineOS logs for SQS publish error
2. Verify AWS credentials are configured
3. Verify SQS queue URL is correct
4. Check IAM permissions

### Webhook returns 404

1. Verify `paymentIdempotencyKey` matches the one sent to SQS
2. Verify `transactionDatabaseId` is correct
3. Verify `tenantId` matches the transaction's tenant

---

## Step-by-Step Go-Live Guide

### Phase 1: AWS Infrastructure (Do First)

```bash
# 1. Create SQS FIFO Queue
aws sqs create-queue \
  --queue-name payment-settlement-queue.fifo \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "true",
    "MessageRetentionPeriod": "1209600",
    "VisibilityTimeout": "30"
  }' \
  --region ap-south-1

# 2. Create Dead Letter Queue
aws sqs create-queue \
  --queue-name payment-settlement-dlq.fifo \
  --attributes '{"FifoQueue": "true", "MessageRetentionPeriod": "1209600"}' \
  --region ap-south-1

# 3. Set up DLQ redrive policy on main queue
aws sqs set-queue-attributes \
  --queue-url https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/payment-settlement-queue.fifo \
  --attributes '{
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:ap-south-1:ACCOUNT_ID:payment-settlement-dlq.fifo\",\"maxReceiveCount\":\"3\"}"
  }'
```

### Phase 2: IAM Permissions

**CitrineOS IAM Policy** (sqs-publish-policy):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:SendMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:ap-south-1:ACCOUNT_ID:payment-settlement-queue.fifo"
    }
  ]
}
```

**Yatri Energy Backend IAM Policy** (sqs-consume-policy):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"],
      "Resource": "arn:aws:sqs:ap-south-1:ACCOUNT_ID:payment-settlement-queue.fifo"
    }
  ]
}
```

### Phase 3: Deploy CitrineOS

1. **Merge the `async-payment` branch** to your deployment branch

2. **Update environment variables** on your EC2/container:

   ```bash
   YATRI_ENERGY_SQS_REGION=ap-south-1
   YATRI_ENERGY_SQS_QUEUE_URL=https://sqs.ap-south-1.amazonaws.com/ACCOUNT_ID/payment-settlement-queue.fifo
   ```

3. **Deploy CitrineOS** (Docker will run migrations automatically)

   ```bash
   docker compose up -d
   ```

4. **Verify health check includes SQS**:

   ```bash
   curl http://localhost:8080/health | jq
   # Should show: "sqs": "connected"
   ```

5. **Verify migration ran**:
   ```sql
   SELECT column_name FROM information_schema.columns
   WHERE table_name = 'Transactions'
   AND column_name IN ('paymentStatus', 'walletTransactionId', 'walletProvider');
   ```

### Phase 4: Implement Yatri Energy Backend Consumer

Your midlayer needs to:

1. **Poll SQS queue** for messages
2. **Process payment** via Wallet gRPC
3. **Call webhook** with result:
   ```bash
   curl -X POST https://citrineos-server:8080/data/transactions/payment-callback \
     -H "Content-Type: application/json" \
     -d '{
       "paymentIdempotencyKey": "<from SQS message>",
       "transactionDatabaseId": <from SQS message>,
       "tenantId": <from SQS message>,
       "status": "COMPLETED",
       "walletTransactionId": "<from wallet response>",
       "walletProvider": "yatri"
     }'
   ```
4. **Delete message** from SQS after successful webhook call

### Phase 5: End-to-End Testing

1. **Start a charging session** (RemoteStart or RFID tap)
2. **Stop the session** (RemoteStop or unplug)
3. **Check transaction status**:

   ```sql
   SELECT id, "transactionId", "paymentStatus", "paymentIdempotencyKey", "sqsMessageId"
   FROM "Transactions" ORDER BY id DESC LIMIT 1;
   ```

   Should show: `paymentStatus = 'QUEUED'`

4. **Check SQS queue** in AWS Console - message should be visible

5. **Process with midlayer** - run your consumer

6. **Verify final status**:
   ```sql
   SELECT "paymentStatus", "walletTransactionId", "walletProvider", "paymentCompletedAt"
   FROM "Transactions" ORDER BY id DESC LIMIT 1;
   ```
   Should show: `paymentStatus = 'COMPLETED'`

### Phase 6: Monitoring Setup

1. **CloudWatch Alarm for Queue Depth**:

   - Metric: `ApproximateNumberOfMessagesVisible`
   - Threshold: > 100 for 5 minutes
   - Action: SNS notification

2. **CloudWatch Alarm for DLQ**:

   - Metric: `ApproximateNumberOfMessagesVisible` on DLQ
   - Threshold: > 0 for 1 minute
   - Action: SNS notification (high priority)

3. **CitrineOS Log Queries**:

   ```bash
   # Find payment errors
   docker logs citrine 2>&1 | grep -E "(QUEUE_FAILED|Payment failed|CRITICAL)"

   # Find successful payments
   docker logs citrine 2>&1 | grep "Payment completed successfully"
   ```

---

## Version History

| Version | Date       | Changes                                                                |
| ------- | ---------- | ---------------------------------------------------------------------- |
| 1.0.0   | 2026-01-22 | Initial implementation                                                 |
| 1.1.0   | 2026-01-22 | Added walletProvider field, SQS health check, error on missing idToken |
