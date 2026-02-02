# Payment Queue Integration (RabbitMQ)

**Last Updated**: February 2, 2026
**Purpose**: Async payment processing via midlayer RabbitMQ

---

## Overview

CitrineOS publishes payment settlement requests to a **separate midlayer RabbitMQ** instance (not the core CitrineOS RabbitMQ). The Yatri Energy Backend consumes these messages and processes wallet payments.

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   CitrineOS     │────▶│  Midlayer RabbitMQ  │────▶│  Yatri Energy   │
│   (Publisher)   │     │  13.204.177.82:5672 │     │  Backend        │
└─────────────────┘     └─────────────────────┘     │  (Consumer)     │
                                                     └─────────────────┘
```

---

## Configuration

### Environment Variables

| Variable                           | Description                                | Required                |
| ---------------------------------- | ------------------------------------------ | ----------------------- |
| `YATRI_ENERGY_RABBITMQ_URL`        | Midlayer RabbitMQ connection URL           | Yes (if wallet enabled) |
| `YATRI_ENERGY_RABBITMQ_EXCHANGE`   | Exchange name (default: `citrineos`)       | No                      |
| `YATRI_WALLET_INTEGRATION_ENABLED` | Enable wallet integration (`true`/`false`) | Yes                     |

### Example .env

```bash
YATRI_WALLET_INTEGRATION_ENABLED=true
YATRI_ENERGY_RABBITMQ_URL=amqp://admin:password@13.204.177.82:5672
YATRI_ENERGY_RABBITMQ_EXCHANGE=citrineos
```

---

## Message Format

### Exchange & Routing

| Property               | Value                |
| ---------------------- | -------------------- |
| Exchange               | `citrineos` (direct) |
| Routing Key            | `payment.settlement` |
| Queue (consumer binds) | `paymentRequests`    |

### Payload Schema

```typescript
interface PaymentSettlementPayload {
  paymentIdempotencyKey: string; // UUID to prevent duplicate charges
  transactionDatabaseId: number; // Internal DB ID
  transactionId: string; // OCPP transaction ID
  stationId: string; // Charging station identifier
  tenantId: number; // Multi-tenant ID
  idToken: string; // User's RFID/auth token (lowercase)
  amount: number; // Total cost in NPR
  currency: string; // Currency code (e.g., 'NPR')
  energyKwh: number; // Energy delivered in kWh
  startTime?: Date; // Transaction start time
  endTime?: Date; // Transaction end time
  stoppedReason?: string; // Why transaction stopped
}
```

### Message Headers

```typescript
{
  tenantId: number,
  stationId: string,
  transactionId: string,
  paymentIdempotencyKey: string,
  timestamp: string  // ISO 8601
}
```

---

## Consumer Setup (Yatri Energy Backend)

```typescript
import * as amqplib from 'amqplib';

const connection = await amqplib.connect('amqp://admin:password@13.204.177.82:5672');
const channel = await connection.createChannel();

// 1. Assert the exchange as direct type
await channel.assertExchange('citrineos', 'direct', { durable: true });

// 2. Assert the queue
await channel.assertQueue('paymentRequests', { durable: true });

// 3. Bind the queue to the exchange with the routing key
await channel.bindQueue('paymentRequests', 'citrineos', 'payment.settlement');

// 4. Consume messages
channel.consume('paymentRequests', async (msg) => {
  if (!msg) return;

  const payload = JSON.parse(msg.content.toString());

  try {
    // Process payment using payload.idToken, payload.amount, etc.
    await processPayment(payload);

    // Acknowledge successful processing
    channel.ack(msg);
  } catch (error) {
    // Reject and requeue on failure
    channel.nack(msg, false, true);
  }
});
```

---

## Health Check

The `/health` endpoint verifies midlayer RabbitMQ connectivity:

```json
{
  "status": "healthy",
  "database": "connected",
  "rabbitmq": "connected", // Core CitrineOS RabbitMQ
  "paymentQueue": "connected", // Midlayer RabbitMQ (payment processing)
  "s3": "connected",
  "hasura": "connected",
  "walletIntegration": "enabled"
}
```

**Failure Scenarios:**

| Condition                               | `paymentQueue` Status | Health Status |
| --------------------------------------- | --------------------- | ------------- |
| Connected successfully                  | `connected`           | `healthy`     |
| Wallet enabled, RabbitMQ not configured | `not_configured`      | `unhealthy`   |
| Wallet enabled, connection failed       | `disconnected`        | `unhealthy`   |
| Wallet disabled                         | `not_configured`      | `healthy`     |

---

## Transaction Flow

```
1. StopTransaction received from charger
       ↓
2. Calculate total cost (CostCalculator)
       ↓
3. Generate idempotency key (UUID)
       ↓
4. Publish to RabbitMQ (payment.settlement)
       ↓
5. Update transaction: paymentStatus = 'QUEUED'
       ↓
6. Yatri Energy Backend consumes message
       ↓
7. Process wallet payment
       ↓
8. Call webhook to update transaction status
```

---

## Files Reference

| File                                            | Purpose                                       |
| ----------------------------------------------- | --------------------------------------------- |
| `02_Util/src/yatri/PaymentRabbitMqPublisher.ts` | RabbitMQ publisher class                      |
| `03_Modules/Transactions/src/module/module.ts`  | Publishes on StopTransaction                  |
| `Server/src/index.ts`                           | Health check for midlayer RabbitMQ            |
| `Server/src/config/envs/docker.ts`              | Environment variable mappings                 |
| `00_Base/src/config/types.ts`                   | Config schema (rabbitmqUrl, rabbitmqExchange) |

---

## Routing Keys (Future Use)

| Routing Key          | Purpose                              |
| -------------------- | ------------------------------------ |
| `payment.settlement` | Payment settlement after transaction |
| `payment.status`     | Payment status updates (reserved)    |
| `payment.refund`     | Payment refunds (reserved)           |
