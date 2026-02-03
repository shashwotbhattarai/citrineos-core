# Synchronous Remote Start/Stop API Design

**Status**: PROPOSED (Not Implemented)
**Last Updated**: February 2, 2026
**Author**: Claude + Shashwot

---

## Problem Statement

Current RemoteStart/RemoteStop APIs return `{ success: true }` immediately after sending to RabbitMQ. This doesn't tell the mobile app if:

- The charger actually accepted the command
- A transaction was started/stopped
- What the transactionId is

The mobile app needs to know the **actual outcome**, not just that the message was queued.

---

## Proposed Solution

Make RemoteStart/RemoteStop APIs **synchronous** - wait for the actual StartTransaction/StopTransaction from the charger before returning.

### RemoteStart Flow

```
Mobile → RemoteStart(stationId, connectorId, idTag)
           │
           ├─► Cache: set pending_remote_start:station1:1:d6a3fa03 = "waiting" (TTL: 60s)
           │
           ├─► Send RemoteStartTransaction to charger
           │
           ├─► Charger: RemoteStartTransaction.conf {status: Accepted}
           │
           ├─► Charger: StartTransaction {connectorId: 1, idTag: d6a3fa03, ...}
           │         │
           │         └─► Transactions Module:
           │               - Create transaction (transactionId: 123)
           │               - Update cache: pending_remote_start:station1:1:d6a3fa03 = {success, transactionId: 123}
           │
           └─► Return { success: true, transactionId: 123, connectorId: 1 }
                 OR on timeout:
               Return { success: false, reason: "timeout", canRetry: true }
```

### RemoteStop Flow

```
Mobile → RemoteStop(stationId, transactionId)
           │
           ├─► Cache: set pending_remote_stop:station1:123 = "waiting" (TTL: 30s)
           │
           ├─► Send RemoteStopTransaction to charger
           │
           ├─► Charger: RemoteStopTransaction.conf {status: Accepted}
           │
           ├─► Charger: StopTransaction {transactionId: 123, meterStop: 5000, reason: "Remote"}
           │         │
           │         └─► Transactions Module:
           │               - Complete transaction
           │               - Calculate cost
           │               - Update cache: pending_remote_stop:station1:123 = {success, meterStop, totalCost}
           │
           └─► Return { success: true, transactionId: 123, meterStop: 5000, totalCost: 150.50 }
                 OR on timeout:
               Return { success: false, reason: "timeout", canRetry: true }
```

---

## Cache Keys

```typescript
// RemoteStart: wait for StartTransaction
// Namespace: PendingRemoteStart (prs)
// Key: {stationId}:{connectorId}:{idTag}
`pending_remote_start:${stationId}:${connectorId}:${idTag}`// RemoteStop: wait for StopTransaction
// Namespace: PendingRemoteStop (prst)
// Key: {stationId}:{transactionId}
`pending_remote_stop:${stationId}:${transactionId}`;
```

---

## Response Types

### RemoteStart Response

```typescript
interface RemoteStartResponse {
  success: boolean;

  // On success
  transactionId?: number;
  stationId?: string;
  connectorId?: number;
  idTag?: string;
  meterStart?: number;
  timestamp?: string;

  // On failure
  reason?:
    | 'timeout' // Charger didn't send StartTransaction in time
    | 'charger_offline' // Couldn't send to charger
    | 'charger_rejected' // RemoteStart.conf status: Rejected
    | 'wallet_insufficient' // Yatri wallet balance too low
    | 'authorization_failed' // idTag not authorized
    | 'request_already_pending'; // Another request is waiting

  // Retry guidance for mobile app
  canRetry: boolean;
  retryAfterSeconds?: number;
}
```

### RemoteStop Response

```typescript
interface RemoteStopResponse {
  success: boolean;

  // On success
  transactionId?: number;
  stationId?: string;
  meterStop?: number;
  totalEnergy?: number; // kWh
  totalCost?: number; // NPR
  currency?: string;
  duration?: number; // seconds
  stoppedReason?: string; // "Remote", "EVDisconnected", etc.

  // On failure
  reason?:
    | 'timeout' // Charger didn't send StopTransaction in time
    | 'charger_offline' // Couldn't send to charger
    | 'charger_rejected' // RemoteStop.conf status: Rejected
    | 'transaction_not_found' // No active transaction with this ID
    | 'request_already_pending'; // Another stop request is waiting

  canRetry: boolean;
  retryAfterSeconds?: number;
}
```

---

## Configuration

```typescript
// Add to SystemConfig
remoteOperations: {
  startTransactionTimeout: 60,  // seconds to wait for StartTransaction
  stopTransactionTimeout: 30,   // seconds to wait for StopTransaction
  allowDuplicateRequests: false // If true, replace pending; if false, reject
}
```

---

## Edge Cases & Cleanup

### Guaranteed Cleanup

| Event                          | Cache Cleanup                                 |
| ------------------------------ | --------------------------------------------- |
| Success (Transaction received) | Cleaned in finally block                      |
| Timeout                        | Auto-expires (TTL) + cleaned in finally block |
| Charger offline                | Cleaned immediately after sendCall fails      |
| Error/Exception                | Cleaned in finally block                      |
| Server restart                 | Auto-expires (TTL)                            |

### State Machine

```
                    ┌─────────────────────────────────────────┐
                    │                                         │
                    ▼                                         │
    ┌───────────────────────────┐                            │
    │      NO PENDING           │◄───────────────────────────┤
    │   (can start new)         │         cleanup            │
    └───────────┬───────────────┘                            │
                │                                             │
                │ Remote operation called                     │
                ▼                                             │
    ┌───────────────────────────┐                            │
    │       PENDING             │──── timeout ────────────────┤
    │  (waiting for charger)    │                            │
    └───────────┬───────────────┘                            │
                │                                             │
                │ Transaction message received                │
                ▼                                             │
    ┌───────────────────────────┐                            │
    │       SUCCESS             │─────────────────────────────┘
    │  (return result)          │
    └───────────────────────────┘
```

---

## Implementation Files

| File                                               | Changes Required                                         |
| -------------------------------------------------- | -------------------------------------------------------- |
| `00_Base/src/interfaces/cache/types.ts`            | Add `PendingRemoteStart`, `PendingRemoteStop` namespaces |
| `00_Base/src/config/types.ts`                      | Add `remoteOperations` config schema                     |
| `03_Modules/EVDriver/src/module/1.6/MessageApi.ts` | RemoteStart/RemoteStop wait logic                        |
| `03_Modules/Transactions/src/module/module.ts`     | StartTransaction/StopTransaction update cache            |
| `Server/src/config/envs/docker.ts`                 | Add default timeout config                               |

---

## Alternative Approaches Considered

### 1. Callback URL (Current)

- **Problem**: Only sends raw OCPP response, no context (stationId, transactionId missing)
- **Problem**: TTL only 10 seconds, not suitable for long waits

### 2. Webhook Subscription

- **Advantage**: Rich data, all OCPP messages
- **Disadvantage**: Requires midlayer to maintain state machine
- **Disadvantage**: More complex integration

### 3. Polling

- **Advantage**: Simple, no long HTTP connections
- **Disadvantage**: Not real-time, wasted requests

### 4. Synchronous Wait (This Proposal)

- **Advantage**: Simple API - one call, one result
- **Advantage**: Mobile app gets exactly what it needs
- **Disadvantage**: Long HTTP requests (30-60 seconds possible)
- **Disadvantage**: More complex server implementation

---

## Decision

**PENDING** - Evaluating subscription API as alternative before implementing.

See: Subscription API exploration for connector-level data.
