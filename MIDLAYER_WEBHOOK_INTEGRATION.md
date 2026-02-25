# Midlayer Webhook Integration Guide

**Status**: FINALIZED
**Last Updated**: February 2, 2026
**Purpose**: Real-time connector state management via CitrineOS webhooks

---

## Overview

The midlayer subscribes to CitrineOS OCPP messages to maintain real-time connector state in Redis. This enables the mobile app to know:

- Connector status (Available, Charging, etc.)
- Active transaction details (transactionId, idToken)
- Live meter values (energy, power, SoC)

## Architecture

```
┌─────────────┐     OCPP      ┌─────────────┐
│   Charger   │◄─────────────►│  CitrineOS  │
└─────────────┘               └──────┬──────┘
                                     │
                    ┌────────────────┴────────────────┐
                    │                                  │
             CS Subscription                    CSMS Subscription
             (onMessage: true)                  (sentMessage: true)
                    │                                  │
                    ▼                                  ▼
        ┌───────────────────┐              ┌───────────────────┐
        │ /webhook/ocpp/cs  │              │/webhook/ocpp/csms │
        │                   │              │                   │
        │ • StatusNotif     │              │ • StartTx.conf    │
        │ • MeterValues     │   pending    │   (transactionId) │
        │ • StartTx ────────┼──────────────┼─►                 │
        │ • StopTx ─────────┼──────────────┼─►                 │
        │ • onConnect       │              │ • StopTx.conf     │
        │ • onClose         │              │   (validation)    │
        └─────────┬─────────┘              └─────────┬─────────┘
                  │                                  │
                  └──────────────┬───────────────────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │    Redis    │
                          │             │
                          │ {tenant}:   │
                          │ {station}:  │
                          │ {connector} │
                          └──────┬──────┘
                                 │
                                 ▼
                          ┌─────────────┐
                          │ Mobile App  │
                          └─────────────┘
```

---

## Redis State Structure

### Key Format

```
{tenantId}:{stationId}:{connectorId}
```

### Value Schema

```typescript
interface ConnectorState {
  // Connector info
  connectorStatus:
    | 'Available'
    | 'Preparing'
    | 'Charging'
    | 'SuspendedEV'
    | 'SuspendedEVSE'
    | 'Finishing'
    | 'Reserved'
    | 'Unavailable'
    | 'Faulted'
    | 'Offline';
  errorCode: string | null;

  // Transaction info (null when no active transaction)
  transactionId: number | null;
  idToken: string | null;
  meterStart: number | null;
  startTime: string | null;

  // Live meter values
  meterValue: number | null; // Current Wh reading
  power: number | null; // Current W
  soc: number | null; // State of charge %

  // Metadata
  lastUpdated: string; // ISO timestamp
  chargerOnline: boolean;
}
```

### Example

```json
{
  "connectorStatus": "Charging",
  "errorCode": null,
  "transactionId": 123,
  "idToken": "d6a3fa03",
  "meterStart": 0,
  "startTime": "2026-02-02T12:00:00Z",
  "meterValue": 2500,
  "power": 7200,
  "soc": 45,
  "lastUpdated": "2026-02-02T12:30:00Z",
  "chargerOnline": true
}
```

---

## Subscription Setup

### 1. CS Subscription (Charger → CSMS)

Receives raw OCPP requests from charger containing actual data.

```bash
curl -X POST "http://{CITRINEOS_HOST}:8080/data/ocpprouter/subscription?tenantId={TENANT_ID}" \
  -H "Content-Type: application/json" \
  -d '{
    "stationId": "{STATION_ID}",
    "url": "http://{MIDLAYER_HOST}/webhook/ocpp/cs",
    "onMessage": true,
    "sentMessage": false,
    "onConnect": true,
    "onClose": true,
    "messageRegexFilter": "StatusNotification|MeterValues|StartTransaction|StopTransaction"
  }'
```

**Receives:**
| Message | Data |
|---------|------|
| StatusNotification | `connectorId`, `status`, `errorCode` |
| MeterValues | `connectorId`, `transactionId`, `meterValue[]` |
| StartTransaction | `connectorId`, `idTag`, `meterStart`, `timestamp` |
| StopTransaction | `transactionId`, `meterStop`, `reason`, `timestamp` |
| onConnect | Charger came online |
| onClose | Charger went offline |

### 2. CSMS Subscription (CSMS → Charger)

Receives validated responses with generated IDs.

```bash
curl -X POST "http://{CITRINEOS_HOST}:8080/data/ocpprouter/subscription?tenantId={TENANT_ID}" \
  -H "Content-Type: application/json" \
  -d '{
    "stationId": "{STATION_ID}",
    "url": "http://{MIDLAYER_HOST}/webhook/ocpp/csms",
    "onMessage": false,
    "sentMessage": true,
    "onConnect": false,
    "onClose": false,
    "messageRegexFilter": "StartTransaction|StopTransaction"
  }'
```

**Receives:**
| Message | Data |
|---------|------|
| StartTransaction.conf | `transactionId`, `idTagInfo.status` |
| StopTransaction.conf | `idTagInfo.status` |

---

## Webhook Payload Format

CitrineOS sends webhooks in this format:

```typescript
interface WebhookPayload {
  stationId: string;
  event: 'message' | 'connected' | 'closed';
  origin?: 'ChargingStation' | 'ChargingStationManagementSystem';
  message?: string; // Raw OCPP message as JSON string
  info?: {
    correlationId: string; // msgId for correlation
    timestamp: string;
    protocol: 'ocpp1.6' | 'ocpp2.0.1';
    action: string;
  };
}
```

### OCPP Message Types

```
[2, msgId, action, payload]  = Call (Request)
[3, msgId, payload]          = CallResult (Response)
[4, msgId, error, desc, ...] = CallError
```

---

## Webhook Handlers

### CS Webhook Handler

```typescript
// POST /webhook/ocpp/cs

import { Redis } from 'ioredis';

const redis = new Redis();

interface WebhookPayload {
  stationId: string;
  event: 'message' | 'connected' | 'closed';
  origin?: string;
  message?: string;
  info?: {
    correlationId: string;
    action: string;
  };
}

app.post('/webhook/ocpp/cs', async (req, res) => {
  const { stationId, event, message, info } = req.body as WebhookPayload;
  const tenantId = 1; // Get from config or subscription context

  try {
    // ─────────────────────────────────────────────────────────────
    // CONNECTION EVENTS
    // ─────────────────────────────────────────────────────────────
    if (event === 'connected') {
      await handleChargerOnline(tenantId, stationId);
      return res.sendStatus(200);
    }

    if (event === 'closed') {
      await handleChargerOffline(tenantId, stationId);
      return res.sendStatus(200);
    }

    // ─────────────────────────────────────────────────────────────
    // OCPP MESSAGES
    // ─────────────────────────────────────────────────────────────
    if (event !== 'message' || !message) {
      return res.sendStatus(200);
    }

    const ocppMsg = JSON.parse(message);
    const msgType = ocppMsg[0];

    // Only process Calls (type 2) from charger
    if (msgType !== 2) {
      return res.sendStatus(200);
    }

    const [, msgId, action, payload] = ocppMsg;

    switch (action) {
      case 'StatusNotification':
        await handleStatusNotification(tenantId, stationId, payload);
        break;

      case 'MeterValues':
        await handleMeterValues(tenantId, stationId, payload);
        break;

      case 'StartTransaction':
        await handleStartTransactionRequest(tenantId, stationId, msgId, payload);
        break;

      case 'StopTransaction':
        await handleStopTransactionRequest(tenantId, stationId, msgId, payload);
        break;
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('CS webhook error:', error);
    res.sendStatus(500);
  }
});

// ─────────────────────────────────────────────────────────────────
// HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────────

async function handleChargerOnline(tenantId: number, stationId: string) {
  // Get all connectors for this station and mark as online
  const pattern = `${tenantId}:${stationId}:*`;
  const keys = await redis.keys(pattern);

  for (const key of keys) {
    const state = await redis.get(key);
    if (state) {
      const connectorState = JSON.parse(state);
      connectorState.chargerOnline = true;
      connectorState.lastUpdated = new Date().toISOString();
      await redis.set(key, JSON.stringify(connectorState));
    }
  }

  console.log(`Charger online: ${stationId}`);
}

async function handleChargerOffline(tenantId: number, stationId: string) {
  const pattern = `${tenantId}:${stationId}:*`;
  const keys = await redis.keys(pattern);

  for (const key of keys) {
    const state = await redis.get(key);
    if (state) {
      const connectorState = JSON.parse(state);
      connectorState.chargerOnline = false;
      connectorState.connectorStatus = 'Offline';
      connectorState.lastUpdated = new Date().toISOString();
      await redis.set(key, JSON.stringify(connectorState));

      // Alert if transaction was active
      if (connectorState.transactionId) {
        console.warn(`Charger offline with active transaction: ${connectorState.transactionId}`);
        // TODO: Notify mobile app
      }
    }
  }

  console.log(`Charger offline: ${stationId}`);
}

async function handleStatusNotification(
  tenantId: number,
  stationId: string,
  payload: { connectorId: number; status: string; errorCode: string },
) {
  const key = `${tenantId}:${stationId}:${payload.connectorId}`;

  let state = await getOrCreateConnectorState(key);
  state.connectorStatus = payload.status;
  state.errorCode = payload.errorCode !== 'NoError' ? payload.errorCode : null;
  state.chargerOnline = true;
  state.lastUpdated = new Date().toISOString();

  await redis.set(key, JSON.stringify(state));

  console.log(`Status update: ${stationId}:${payload.connectorId} = ${payload.status}`);
}

async function handleMeterValues(
  tenantId: number,
  stationId: string,
  payload: { connectorId: number; transactionId?: number; meterValue: any[] },
) {
  const key = `${tenantId}:${stationId}:${payload.connectorId}`;

  let state = await getOrCreateConnectorState(key);

  // Extract values from meterValue array
  for (const mv of payload.meterValue) {
    for (const sv of mv.sampledValue || []) {
      const value = parseFloat(sv.value);

      // Energy (Wh)
      if (sv.measurand === 'Energy.Active.Import.Register' || !sv.measurand) {
        state.meterValue = value;
      }
      // Power (W)
      else if (sv.measurand === 'Power.Active.Import') {
        state.power = value;
      }
      // State of Charge (%)
      else if (sv.measurand === 'SoC') {
        state.soc = value;
      }
    }
  }

  state.lastUpdated = new Date().toISOString();
  await redis.set(key, JSON.stringify(state));

  console.log(`Meter update: ${stationId}:${payload.connectorId} = ${state.meterValue} Wh`);
}

async function handleStartTransactionRequest(
  tenantId: number,
  stationId: string,
  msgId: string,
  payload: { connectorId: number; idTag: string; meterStart: number; timestamp: string },
) {
  // Store pending - waiting for CSMS response with transactionId
  const pendingKey = `pending:start:${tenantId}:${stationId}:${msgId}`;

  await redis.setex(
    pendingKey,
    120,
    JSON.stringify({
      connectorId: payload.connectorId,
      idTag: payload.idTag.toLowerCase(),
      meterStart: payload.meterStart,
      timestamp: payload.timestamp,
    }),
  );

  console.log(`StartTransaction pending: ${stationId}:${payload.connectorId} msgId=${msgId}`);
}

async function handleStopTransactionRequest(
  tenantId: number,
  stationId: string,
  msgId: string,
  payload: { transactionId: number; meterStop: number; reason?: string; timestamp: string },
) {
  // Store pending - waiting for CSMS validation
  const pendingKey = `pending:stop:${tenantId}:${stationId}:${msgId}`;

  await redis.setex(
    pendingKey,
    120,
    JSON.stringify({
      transactionId: payload.transactionId,
      meterStop: payload.meterStop,
      reason: payload.reason || 'Local',
      timestamp: payload.timestamp,
    }),
  );

  console.log(`StopTransaction pending: ${stationId} txId=${payload.transactionId} msgId=${msgId}`);
}

async function getOrCreateConnectorState(key: string): Promise<any> {
  const existing = await redis.get(key);
  if (existing) {
    return JSON.parse(existing);
  }

  return {
    connectorStatus: 'Unknown',
    errorCode: null,
    transactionId: null,
    idToken: null,
    meterStart: null,
    startTime: null,
    meterValue: null,
    power: null,
    soc: null,
    lastUpdated: new Date().toISOString(),
    chargerOnline: true,
  };
}
```

### CSMS Webhook Handler

```typescript
// POST /webhook/ocpp/csms

app.post('/webhook/ocpp/csms', async (req, res) => {
  const { stationId, event, message, info } = req.body as WebhookPayload;
  const tenantId = 1;

  try {
    if (event !== 'message' || !message) {
      return res.sendStatus(200);
    }

    const ocppMsg = JSON.parse(message);
    const msgType = ocppMsg[0];

    // Only process CallResults (type 3) from CSMS
    if (msgType !== 3) {
      return res.sendStatus(200);
    }

    const [, msgId, payload] = ocppMsg;
    const action = info?.action;

    switch (action) {
      case 'StartTransaction':
        await handleStartTransactionResponse(tenantId, stationId, msgId, payload);
        break;

      case 'StopTransaction':
        await handleStopTransactionResponse(tenantId, stationId, msgId, payload);
        break;
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('CSMS webhook error:', error);
    res.sendStatus(500);
  }
});

// ─────────────────────────────────────────────────────────────────
// HANDLER FUNCTIONS
// ─────────────────────────────────────────────────────────────────

async function handleStartTransactionResponse(
  tenantId: number,
  stationId: string,
  msgId: string,
  payload: { transactionId: number; idTagInfo: { status: string } },
) {
  const pendingKey = `pending:start:${tenantId}:${stationId}:${msgId}`;
  const pendingData = await redis.get(pendingKey);

  if (!pendingData) {
    console.warn(`No pending StartTransaction for msgId=${msgId}`);
    return;
  }

  const pending = JSON.parse(pendingData);

  if (payload.idTagInfo?.status !== 'Accepted') {
    console.warn(`StartTransaction rejected: ${payload.idTagInfo?.status}`);
    await redis.del(pendingKey);
    return;
  }

  // Update connector state with validated transaction
  const key = `${tenantId}:${stationId}:${pending.connectorId}`;
  let state = await getOrCreateConnectorState(key);

  state.transactionId = payload.transactionId;
  state.idToken = pending.idTag;
  state.meterStart = pending.meterStart;
  state.meterValue = pending.meterStart;
  state.startTime = pending.timestamp;
  state.connectorStatus = 'Charging';
  state.lastUpdated = new Date().toISOString();

  await redis.set(key, JSON.stringify(state));
  await redis.del(pendingKey);

  console.log(
    `Transaction started: ${stationId}:${pending.connectorId} txId=${payload.transactionId}`,
  );

  // TODO: Notify mobile app via WebSocket/SSE
  // await notifyMobile(tenantId, stationId, pending.connectorId, 'TRANSACTION_STARTED', {
  //   transactionId: payload.transactionId,
  //   idToken: pending.idTag
  // });
}

async function handleStopTransactionResponse(
  tenantId: number,
  stationId: string,
  msgId: string,
  payload: { idTagInfo?: { status: string } },
) {
  const pendingKey = `pending:stop:${tenantId}:${stationId}:${msgId}`;
  const pendingData = await redis.get(pendingKey);

  if (!pendingData) {
    console.warn(`No pending StopTransaction for msgId=${msgId}`);
    return;
  }

  const pending = JSON.parse(pendingData);

  // Find connector by transactionId
  const connectorId = await findConnectorByTransactionId(
    tenantId,
    stationId,
    pending.transactionId,
  );

  if (!connectorId) {
    console.warn(`No connector found for transactionId=${pending.transactionId}`);
    await redis.del(pendingKey);
    return;
  }

  // Clear transaction from connector state
  const key = `${tenantId}:${stationId}:${connectorId}`;
  let state = await getOrCreateConnectorState(key);

  const completedTransaction = {
    transactionId: pending.transactionId,
    idToken: state.idToken,
    meterStart: state.meterStart,
    meterStop: pending.meterStop,
    startTime: state.startTime,
    endTime: pending.timestamp,
    reason: pending.reason,
    totalEnergy: pending.meterStop - (state.meterStart || 0),
  };

  // Reset transaction fields
  state.transactionId = null;
  state.idToken = null;
  state.meterStart = null;
  state.startTime = null;
  state.meterValue = null;
  state.power = null;
  state.soc = null;
  state.connectorStatus = 'Finishing';
  state.lastUpdated = new Date().toISOString();

  await redis.set(key, JSON.stringify(state));
  await redis.del(pendingKey);

  console.log(
    `Transaction ended: ${stationId}:${connectorId} txId=${pending.transactionId} energy=${completedTransaction.totalEnergy}Wh`,
  );

  // TODO: Notify mobile app
  // await notifyMobile(tenantId, stationId, connectorId, 'TRANSACTION_ENDED', completedTransaction);
}

async function findConnectorByTransactionId(
  tenantId: number,
  stationId: string,
  transactionId: number,
): Promise<number | null> {
  const pattern = `${tenantId}:${stationId}:*`;
  const keys = await redis.keys(pattern);

  for (const key of keys) {
    const state = await redis.get(key);
    if (state) {
      const parsed = JSON.parse(state);
      if (parsed.transactionId === transactionId) {
        // Extract connectorId from key
        const parts = key.split(':');
        return parseInt(parts[2]);
      }
    }
  }

  return null;
}
```

---

## Message Flow Examples

### Example 1: Start Transaction Flow

```
1. Charger sends StartTransaction
   ────────────────────────────────────────────────────────────────
   CS Webhook receives:
   {
     "stationId": "yatri-1-ioc-1-sec1",
     "event": "message",
     "origin": "ChargingStation",
     "message": "[2,\"msg-001\",\"StartTransaction\",{\"connectorId\":1,\"idTag\":\"D6A3FA03\",\"meterStart\":0,\"timestamp\":\"2026-02-02T12:00:00Z\"}]",
     "info": {"correlationId": "msg-001", "action": "StartTransaction"}
   }

   Action: Store in Redis pending:start:1:yatri-1-ioc-1-sec1:msg-001

2. CitrineOS validates and responds
   ────────────────────────────────────────────────────────────────
   CSMS Webhook receives:
   {
     "stationId": "yatri-1-ioc-1-sec1",
     "event": "message",
     "origin": "ChargingStationManagementSystem",
     "message": "[3,\"msg-001\",{\"transactionId\":123,\"idTagInfo\":{\"status\":\"Accepted\"}}]",
     "info": {"correlationId": "msg-001", "action": "StartTransaction"}
   }

   Action:
   - Get pending data using msgId
   - Update Redis 1:yatri-1-ioc-1-sec1:1 with transactionId=123
   - Delete pending key
```

### Example 2: Meter Values Flow

```
   Charger sends MeterValues
   ────────────────────────────────────────────────────────────────
   CS Webhook receives:
   {
     "stationId": "yatri-1-ioc-1-sec1",
     "event": "message",
     "origin": "ChargingStation",
     "message": "[2,\"msg-002\",\"MeterValues\",{\"connectorId\":1,\"transactionId\":123,\"meterValue\":[{\"timestamp\":\"2026-02-02T12:05:00Z\",\"sampledValue\":[{\"value\":\"500\",\"measurand\":\"Energy.Active.Import.Register\",\"unit\":\"Wh\"},{\"value\":\"7200\",\"measurand\":\"Power.Active.Import\",\"unit\":\"W\"}]}]}]",
     "info": {"correlationId": "msg-002", "action": "MeterValues"}
   }

   Action: Update Redis 1:yatri-1-ioc-1-sec1:1 with meterValue=500, power=7200
```

---

## Subscription Management

### Create Subscriptions for a Station

```typescript
async function createSubscriptionsForStation(
  citrineoHost: string,
  tenantId: number,
  stationId: string,
  midlayerHost: string,
) {
  // CS Subscription
  await fetch(`${citrineoHost}/data/ocpprouter/subscription?tenantId=${tenantId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stationId,
      url: `${midlayerHost}/webhook/ocpp/cs`,
      onMessage: true,
      sentMessage: false,
      onConnect: true,
      onClose: true,
      messageRegexFilter: 'StatusNotification|MeterValues|StartTransaction|StopTransaction',
    }),
  });

  // CSMS Subscription
  await fetch(`${citrineoHost}/data/ocpprouter/subscription?tenantId=${tenantId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      stationId,
      url: `${midlayerHost}/webhook/ocpp/csms`,
      onMessage: false,
      sentMessage: true,
      onConnect: false,
      onClose: false,
      messageRegexFilter: 'StartTransaction|StopTransaction',
    }),
  });
}
```

### Delete Subscriptions

```typescript
async function deleteSubscription(citrineoHost: string, tenantId: number, subscriptionId: number) {
  await fetch(
    `${citrineoHost}/data/ocpprouter/subscription?tenantId=${tenantId}&id=${subscriptionId}`,
    { method: 'DELETE' },
  );
}
```

### List Subscriptions for a Station

```typescript
async function getSubscriptions(citrineoHost: string, tenantId: number, stationId: string) {
  const response = await fetch(
    `${citrineoHost}/data/ocpprouter/subscription?tenantId=${tenantId}&stationId=${stationId}`,
  );
  return response.json();
}
```

---

## Summary Table

| Source | Message               | Data Extracted                         | Redis Update                           |
| ------ | --------------------- | -------------------------------------- | -------------------------------------- |
| CS     | StatusNotification    | `connectorId`, `status`, `errorCode`   | Direct update                          |
| CS     | MeterValues           | `connectorId`, `meterValue[]`          | Direct update                          |
| CS     | StartTransaction      | `connectorId`, `idTag`, `meterStart`   | Store pending                          |
| CS     | StopTransaction       | `transactionId`, `meterStop`, `reason` | Store pending                          |
| CS     | onConnect             | -                                      | Mark online                            |
| CS     | onClose               | -                                      | Mark offline                           |
| CSMS   | StartTransaction.conf | `transactionId`, `status`              | Merge with pending → update            |
| CSMS   | StopTransaction.conf  | `status`                               | Merge with pending → clear transaction |

---

## Error Handling

### Pending Data Expiry

Pending keys have 120 second TTL. If CSMS response doesn't arrive:

- Pending data auto-expires
- Transaction may have failed
- Log warning for investigation

### Missing Correlation

If CSMS response arrives but no pending data:

- Log warning
- Possible causes: TTL expired, webhook out of order, duplicate message

### Charger Offline During Transaction

- `onClose` event marks charger offline
- Active transaction flagged
- Mobile app notified
- When charger reconnects, it may send StopTransaction

---

## Environment Variables

```bash
REDIS_URL=redis://localhost:6379
CITRINEOS_HOST=http://43.205.3.181:8080
MIDLAYER_HOST=http://your-midlayer.com
DEFAULT_TENANT_ID=1
```
