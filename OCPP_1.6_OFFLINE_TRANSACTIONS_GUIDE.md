# OCPP 1.6 Offline Transaction Handling & Local Authorization List Guide

**Documentation Date**: December 29, 2025
**Protocol Version**: OCPP 1.6
**Status**: Implementation Guide for Yatri Energy

---

## Overview

This document covers how OCPP 1.6 handles offline transactions in CitrineOS and the integration pattern with Yatri Energy wallet for post-facto billing.

### Key Difference from OCPP 2.0.1

| Feature                  | OCPP 1.6                               | OCPP 2.0.1                               |
| ------------------------ | -------------------------------------- | ---------------------------------------- |
| **Offline Flag**         | No explicit flag                       | `offline: true` in TransactionEvent      |
| **Sequence Tracking**    | No sequence numbers                    | `seqNo` for event ordering               |
| **Transaction Messages** | StartTransaction/StopTransaction       | TransactionEvent (Started/Updated/Ended) |
| **Meter Data Upload**    | `transactionData[]` in StopTransaction | Real-time via Updated events             |
| **Cost Updates**         | Not supported                          | CostUpdated messages                     |
| **Detection Method**     | Timestamp gap analysis                 | Explicit `offline` flag                  |

---

## How Offline Charging Works in OCPP 1.6

### The Complete Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE CHARGING FLOW                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. CHARGER GOES OFFLINE (loses CSMS connection)                │
│            ↓                                                     │
│  2. User taps RFID card                                         │
│            ↓                                                     │
│  3. Charger checks LOCAL AUTHORIZATION LIST (cached idTags)     │
│            ↓                                                     │
│  4. If idTag found & valid → Charging STARTS                    │
│            ↓                                                     │
│  5. Charger records meter values locally with timestamps        │
│            ↓                                                     │
│  6. User stops charging (RFID tap or cable disconnect)          │
│            ↓                                                     │
│  7. CHARGER RECONNECTS to CSMS                                  │
│            ↓                                                     │
│  8. Charger sends StopTransaction with ALL offline data:        │
│     • meterStart, meterStop                                     │
│     • Original timestamps from offline period                    │
│     • transactionData[] (all meter readings)                    │
│            ↓                                                     │
│  9. CitrineOS processes transaction & calculates cost           │
│            ↓                                                     │
│  10. Yatri wallet settlement (deduct balance)                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### OCPP 1.6 Message Structure

#### StartTransaction Request (from Charger)

```json
{
  "connectorId": 1,
  "idTag": "D6A3FA03",
  "meterStart": 6800,
  "timestamp": "2025-12-29T10:30:00.000Z",
  "reservationId": null
}
```

**Note**: No `offline` flag exists. The charger sends this when it reconnects.

#### StopTransaction Request (with Offline Data)

```json
{
  "transactionId": 123,
  "meterStop": 7213,
  "timestamp": "2025-12-29T11:15:00.000Z",
  "reason": "Local",
  "idTag": "D6A3FA03",
  "transactionData": [
    {
      "timestamp": "2025-12-29T10:30:00.000Z",
      "sampledValue": [
        { "value": "6800", "measurand": "Energy.Active.Import.Register", "unit": "Wh" }
      ]
    },
    {
      "timestamp": "2025-12-29T10:45:00.000Z",
      "sampledValue": [
        { "value": "6950", "measurand": "Energy.Active.Import.Register", "unit": "Wh" }
      ]
    },
    {
      "timestamp": "2025-12-29T11:00:00.000Z",
      "sampledValue": [
        { "value": "7100", "measurand": "Energy.Active.Import.Register", "unit": "Wh" }
      ]
    },
    {
      "timestamp": "2025-12-29T11:15:00.000Z",
      "sampledValue": [
        { "value": "7213", "measurand": "Energy.Active.Import.Register", "unit": "Wh" }
      ]
    }
  ]
}
```

**Key Point**: The `transactionData` array contains all meter readings collected during the offline period.

---

## Local Authorization List Management

### What is the Local Authorization List?

The Local Authorization List is a cache of authorized RFID tokens stored directly on the charging station. It enables:

- **Offline charging** when CSMS is unreachable
- **Faster authorization** (no round-trip to CSMS)
- **Network resilience** for areas with poor connectivity

### Charger Configuration Requirements

Enable offline authorization on the charger:

```json
{
  "LocalAuthorizeOffline": "true",
  "LocalPreAuthorize": "true",
  "LocalAuthListEnabled": "true",
  "LocalAuthListMaxLength": "1000"
}
```

### SendLocalList API

CitrineOS supports batch operations to send the auth list to multiple chargers:

```bash
# Send to MULTIPLE chargers in ONE API call
POST /ocpp/1.6/evdriver/sendLocalList?identifier=charger-1&identifier=charger-2&identifier=charger-3&tenantId=1
Content-Type: application/json

{
  "listVersion": 5,
  "updateType": "Full",
  "localAuthorizationList": [
    {
      "idTag": "D6A3FA03",
      "idTagInfo": {
        "status": "Accepted",
        "expiryDate": "2025-12-31T23:59:59.000Z"
      }
    },
    {
      "idTag": "USER_002",
      "idTagInfo": {
        "status": "Accepted",
        "expiryDate": "2025-12-31T23:59:59.000Z"
      }
    },
    {
      "idTag": "USER_003",
      "idTagInfo": {
        "status": "Accepted",
        "expiryDate": "2025-12-31T23:59:59.000Z"
      }
    }
  ]
}
```

### Update Types

| Type           | Description                 | Use Case                                |
| -------------- | --------------------------- | --------------------------------------- |
| `Full`         | Replace entire list         | Initial sync, periodic full refresh     |
| `Differential` | Add/update specific entries | Add new user, update expiry, block user |

#### Differential Update Example (Add Single User)

```bash
POST /ocpp/1.6/evdriver/sendLocalList?identifier=charger-1&identifier=charger-2&tenantId=1

{
  "listVersion": 6,
  "updateType": "Differential",
  "localAuthorizationList": [
    {
      "idTag": "NEW_USER_RFID",
      "idTagInfo": {
        "status": "Accepted",
        "expiryDate": "2025-12-31T23:59:59.000Z"
      }
    }
  ]
}
```

#### Block User (Differential Update)

```bash
POST /ocpp/1.6/evdriver/sendLocalList?identifier=charger-1&identifier=charger-2&tenantId=1

{
  "listVersion": 7,
  "updateType": "Differential",
  "localAuthorizationList": [
    {
      "idTag": "LOW_BALANCE_USER",
      "idTagInfo": {
        "status": "Blocked"
      }
    }
  ]
}
```

---

## The Sync Challenge: Managing Lists Across All Chargers

### The Problem

With OCPP 1.6 offline authorization, you must sync the Local Authorization List to ALL chargers. This creates operational overhead:

1. **New user registers** → Add to all chargers
2. **User wallet goes low** → Remove from all chargers
3. **User tops up wallet** → Add back to all chargers
4. **New charger added** → Push full list to it

### Solution: LocalAuthListSyncService

Implement a sync service in yatri-energy-backend that manages this automatically.

#### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                  yatri-energy-backend                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  LocalAuthListSyncService                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐       │
│  │ User Events │  │ Wallet Events│  │ Scheduled Sync    │       │
│  │ (register,  │  │ (topup,      │  │ (hourly cron)     │       │
│  │  RFID add)  │  │  deduction)  │  │                   │       │
│  └──────┬──────┘  └──────┬───────┘  └─────────┬─────────┘       │
│         │                │                     │                 │
│         └────────────────┼─────────────────────┘                 │
│                          ▼                                       │
│              ┌───────────────────────┐                          │
│              │  SendLocalList API    │                          │
│              │  (batch to all        │                          │
│              │   chargers)           │                          │
│              └───────────┬───────────┘                          │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CitrineOS Core                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐         │
│  │Charger 1 │  │Charger 2 │  │Charger 3 │  │Charger N │         │
│  │Local List│  │Local List│  │Local List│  │Local List│         │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘         │
└──────────────────────────────────────────────────────────────────┘
```

#### Service Implementation

```typescript
// yatri-energy-backend/src/services/LocalAuthListSyncService.ts

class LocalAuthListSyncService {
  private currentVersion = 0;
  private readonly CITRINEOS_URL = process.env.CITRINEOS_URL;
  private readonly MIN_WALLET_BALANCE = 100; // NPR

  /**
   * Get all users eligible for offline charging
   * Only users with wallet balance >= minimum threshold
   */
  async getEligibleUsers(): Promise<AuthListEntry[]> {
    const users = await db.query(
      `
      SELECT u.rfid_tag, u.id, w.balance
      FROM users u
      JOIN wallets w ON u.id = w.user_id
      WHERE w.balance >= $1
        AND u.rfid_tag IS NOT NULL
        AND u.status = 'active'
    `,
      [this.MIN_WALLET_BALANCE],
    );

    return users.map((u) => ({
      idTag: u.rfid_tag,
      idTagInfo: {
        status: 'Accepted',
        expiryDate: this.getExpiryDate(), // 30 days from now
      },
    }));
  }

  /**
   * Get all active OCPP 1.6 charger identifiers
   */
  async getAllChargerIds(): Promise<string[]> {
    const chargers = await db.query(`
      SELECT identifier FROM charging_stations
      WHERE status = 'active' AND protocol = 'ocpp1.6'
    `);
    return chargers.map((c) => c.identifier);
  }

  /**
   * Broadcast full list to all chargers
   * Use for: Periodic sync, initial setup
   */
  async syncAllChargers(): Promise<SyncResult> {
    const [authList, chargerIds] = await Promise.all([
      this.getEligibleUsers(),
      this.getAllChargerIds(),
    ]);

    this.currentVersion++;

    // Build query string with all charger IDs
    const identifiers = chargerIds.map((id) => `identifier=${id}`).join('&');

    const response = await fetch(
      `${this.CITRINEOS_URL}/ocpp/1.6/evdriver/sendLocalList?${identifiers}&tenantId=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listVersion: this.currentVersion,
          updateType: 'Full',
          localAuthorizationList: authList,
        }),
      },
    );

    const results = await response.json();

    // Log failures for retry
    const failed = results.filter((r) => !r.success);
    failed.forEach((result, idx) => {
      logger.error(`Failed to sync charger`, { chargerId: chargerIds[idx], error: result.payload });
    });

    return {
      synced: results.filter((r) => r.success).length,
      failed: failed.length,
      version: this.currentVersion,
    };
  }

  /**
   * Add single user to all chargers (Differential update)
   * Use for: New user registration, wallet top-up
   */
  async addUserToAllChargers(rfidTag: string): Promise<void> {
    const chargerIds = await this.getAllChargerIds();
    this.currentVersion++;

    const identifiers = chargerIds.map((id) => `identifier=${id}`).join('&');

    await fetch(`${this.CITRINEOS_URL}/ocpp/1.6/evdriver/sendLocalList?${identifiers}&tenantId=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listVersion: this.currentVersion,
        updateType: 'Differential',
        localAuthorizationList: [
          {
            idTag: rfidTag,
            idTagInfo: {
              status: 'Accepted',
              expiryDate: this.getExpiryDate(),
            },
          },
        ],
      }),
    });

    logger.info(`Added user ${rfidTag} to ${chargerIds.length} chargers`);
  }

  /**
   * Remove user from all chargers (Block status)
   * Use for: Low wallet balance, account suspension
   */
  async removeUserFromAllChargers(rfidTag: string): Promise<void> {
    const chargerIds = await this.getAllChargerIds();
    this.currentVersion++;

    const identifiers = chargerIds.map((id) => `identifier=${id}`).join('&');

    await fetch(`${this.CITRINEOS_URL}/ocpp/1.6/evdriver/sendLocalList?${identifiers}&tenantId=1`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        listVersion: this.currentVersion,
        updateType: 'Differential',
        localAuthorizationList: [{ idTag: rfidTag, idTagInfo: { status: 'Blocked' } }],
      }),
    });

    logger.info(`Blocked user ${rfidTag} on ${chargerIds.length} chargers`);
  }

  /**
   * Push full list to a specific charger
   * Use for: New charger registration
   */
  async syncSingleCharger(chargerId: string): Promise<void> {
    const authList = await this.getEligibleUsers();

    await fetch(
      `${this.CITRINEOS_URL}/ocpp/1.6/evdriver/sendLocalList?identifier=${chargerId}&tenantId=1`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          listVersion: this.currentVersion,
          updateType: 'Full',
          localAuthorizationList: authList,
        }),
      },
    );

    logger.info(`Synced ${authList.length} users to charger ${chargerId}`);
  }

  private getExpiryDate(): string {
    const date = new Date();
    date.setDate(date.getDate() + 30); // 30 days expiry
    return date.toISOString();
  }
}
```

#### Integration Trigger Points

```typescript
// yatri-energy-backend event handlers

// 1. User Registration with RFID
app.post('/users/:id/rfid', async (req, res) => {
  const { rfidTag } = req.body;
  await UserService.setRfidTag(req.params.id, rfidTag);

  // Check wallet balance before adding to chargers
  const wallet = await WalletService.getBalance(req.params.id);
  if (wallet.balance >= MIN_WALLET_BALANCE) {
    await LocalAuthListSyncService.addUserToAllChargers(rfidTag);
  }

  res.json({ success: true });
});

// 2. Wallet Top-up
app.post('/wallets/:userId/topup', async (req, res) => {
  const { amount } = req.body;
  const wallet = await WalletService.topup(req.params.userId, amount);

  const user = await UserService.getById(req.params.userId);
  if (user.rfidTag) {
    // Was below threshold, now above = add to chargers
    if (wallet.previousBalance < MIN_WALLET_BALANCE && wallet.balance >= MIN_WALLET_BALANCE) {
      await LocalAuthListSyncService.addUserToAllChargers(user.rfidTag);
    }
  }

  res.json({ success: true, newBalance: wallet.balance });
});

// 3. Transaction Settlement (after offline charging)
app.post('/webhooks/transaction-complete', async (req, res) => {
  const { idTag, cost, transactionId, totalKwh } = req.body;

  const user = await UserService.getByRfidTag(idTag);
  await WalletService.deduct(user.id, cost);

  const newBalance = await WalletService.getBalance(user.id);

  // Remove from chargers if balance now below threshold
  if (newBalance < MIN_WALLET_BALANCE) {
    await LocalAuthListSyncService.removeUserFromAllChargers(idTag);

    // Notify user
    await NotificationService.send(user.id, {
      title: 'Low Balance Alert',
      body: `Your balance is NPR ${newBalance}. Top up to continue offline charging.`,
    });
  }

  res.json({ success: true });
});

// 4. New Charger Registration
app.post('/chargers', async (req, res) => {
  const charger = await ChargerService.create(req.body);

  // Push current auth list to new charger
  await LocalAuthListSyncService.syncSingleCharger(charger.identifier);

  res.json({ success: true, charger });
});

// 5. Scheduled Full Sync (Cron Job)
cron.schedule('0 * * * *', async () => {
  // Every hour
  logger.info('Starting scheduled auth list sync');
  const result = await LocalAuthListSyncService.syncAllChargers();
  logger.info(`Auth list sync complete`, result);
});
```

---

## Wallet Deduction for Offline Transactions

### How You Know About Offline Transactions

Since OCPP 1.6 has no explicit `offline` flag, detect offline transactions by timestamp analysis:

```typescript
// In StopTransaction handler
const transactionStartTime = new Date(transaction.startTransaction.timestamp);
const messageReceivedTime = new Date();
const timeDifference = messageReceivedTime.getTime() - transactionStartTime.getTime();

// If transaction started hours ago but we just received it = offline
const OFFLINE_THRESHOLD = 5 * 60 * 1000; // 5 minutes
const wasOffline = timeDifference > OFFLINE_THRESHOLD;
```

### Wallet Settlement Flow

CitrineOS calls `_processYatriPaymentSettlement()` in the StopTransaction handler:

**File**: `citrineos-core/03_Modules/Transactions/src/module/module.ts:734-735`

```typescript
// Called when StopTransaction is received (covers all stop methods)
private async _processYatriPaymentSettlement(
  context: IMessageContext,
  transaction: Transaction,
  totalKwh: number,
  cost: number
): Promise<void> {
  const idToken = transaction.startTransaction?.idTokenValue;

  if (!idToken) {
    this._logger.warn('No idToken found for payment settlement');
    return;
  }

  try {
    const response = await this._yatriEnergyClient.makePayment({
      idToken: idToken,
      amount: cost,
      currency: 'NPR',
      transactionId: parseInt(transaction.transactionId),
      stationId: transaction.stationId,
      description: `EV Charging - ${transaction.stationId} - ${totalKwh.toFixed(2)}kWh`
    });

    this._logger.info('Payment settlement completed', {
      transactionId: transaction.transactionId,
      amount: cost,
      newBalance: response.balance
    });

    // Check if balance dropped below threshold
    if (response.balance < MIN_WALLET_BALANCE) {
      // Notify sync service to remove user from chargers
      await this._notifyLowBalance(idToken, response.balance);
    }
  } catch (error) {
    this._logger.error('Payment settlement failed', {
      transactionId: transaction.transactionId,
      error
    });
  }
}
```

### Webhook Integration for yatri-energy-backend

```typescript
// yatri-energy-backend webhook handler
app.post('/webhooks/citrineos/transaction-complete', async (req, res) => {
  const { transactionId, totalKwh, cost, idTag, stationId, startTimestamp, stopTimestamp } =
    req.body;

  // 1. Find user by RFID tag
  const user = await UserService.findByRfidTag(idTag);
  if (!user) {
    logger.error(`User not found for RFID: ${idTag}`);
    return res.status(404).json({ error: 'User not found' });
  }

  // 2. Detect if this was an offline transaction
  const startTime = new Date(startTimestamp);
  const now = new Date();
  const wasOffline = now.getTime() - startTime.getTime() > 5 * 60 * 1000;

  // 3. Deduct from wallet
  const result = await WalletService.deductBalance({
    userId: user.id,
    amount: cost,
    transactionId,
    type: wasOffline ? 'OFFLINE_CHARGE' : 'ONLINE_CHARGE',
    metadata: {
      kwh: totalKwh,
      stationId,
      startTime: startTimestamp,
      endTime: stopTimestamp,
    },
  });

  // 4. Handle low balance
  if (result.newBalance < MIN_WALLET_BALANCE) {
    await LocalAuthListSyncService.removeUserFromAllChargers(idTag);

    await NotificationService.send(user.id, {
      title: 'Charging Complete - Low Balance',
      body:
        `${totalKwh.toFixed(2)} kWh charged. NPR ${cost.toFixed(2)} deducted. ` +
        `Balance: NPR ${result.newBalance.toFixed(2)}. Top up to continue offline charging.`,
    });
  } else {
    await NotificationService.send(user.id, {
      title: 'Charging Complete',
      body: `${totalKwh.toFixed(2)} kWh charged. NPR ${cost.toFixed(2)} deducted.`,
    });
  }

  res.json({ success: true });
});
```

---

## Critical Considerations

### 1. The Pre-Authorization Problem

**Issue**: If a user's wallet balance is NPR 0 when they charge offline, you can't stop them - they're authorized in the Local List!

**Solutions**:

| Approach                      | Description                                           | Pros                           | Cons                       |
| ----------------------------- | ----------------------------------------------------- | ------------------------------ | -------------------------- |
| **Minimum Balance Threshold** | Only add users to Local Auth List if wallet > NPR 500 | Prevents zero-balance charging | May block legitimate users |
| **Periodic Sync**             | Hourly sync removes low-balance users                 | Catches balance changes        | Gap window for abuse       |
| **Short Expiry Dates**        | Set auth expiry to 24 hours                           | Forces regular renewal         | More sync overhead         |
| **Post-paid Recovery**        | Allow negative balance + recovery process             | Better UX                      | Need collection process    |

**Recommended**: Combine minimum balance threshold (NPR 100-500) with hourly periodic sync.

### 2. Version Management

Local Auth List has a version number. Each update must increment:

```typescript
class VersionManager {
  private version = 0;

  getNextVersion(): number {
    return ++this.version;
  }

  // Persist version to database for recovery
  async persistVersion(): Promise<void> {
    await db.query('UPDATE auth_list_version SET version = $1', [this.version]);
  }

  async loadVersion(): Promise<void> {
    const result = await db.query('SELECT version FROM auth_list_version');
    this.version = result.rows[0]?.version || 0;
  }
}
```

### 3. Charger Response Handling

Monitor charger responses to SendLocalList:

```typescript
// Possible responses
{
  "status": "Accepted"      // Success
  "status": "Failed"        // General failure
  "status": "VersionMismatch"  // Version conflict - resync needed
  "status": "NotSupported"  // Charger doesn't support Local Auth
}
```

Handle `VersionMismatch` by querying current version and resyncing:

```bash
POST /ocpp/1.6/evdriver/getLocalListVersion?identifier=charger-1&tenantId=1
```

### 4. Scale Considerations

| Users   | Chargers | List Size | Sync Time   | Recommendation      |
| ------- | -------- | --------- | ----------- | ------------------- |
| 100     | 10       | ~2KB      | < 1 sec     | Full sync ok        |
| 1,000   | 50       | ~20KB     | 2-3 sec     | Prefer differential |
| 10,000  | 100      | ~200KB    | 5-10 sec    | Batch by location   |
| 100,000 | 500      | ~2MB      | May timeout | Chunk + async       |

For large deployments, consider:

- Chunking chargers by location/group
- Async sync with job queues
- Using differential updates primarily
- Upgrading to OCPP 2.0.1 (better offline handling)

---

## Summary: Complete Offline Transaction Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    COMPLETE SYSTEM FLOW                          │
└─────────────────────────────────────────────────────────────────┘

SETUP PHASE:
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ User Registers   │ ──> │ RFID Assigned    │ ──> │ Wallet Created   │
│ in Yatri App     │     │ to User          │     │ (Min NPR 100)    │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                         ┌─────────────────────────────────────────────┐
                         │   LocalAuthListSyncService.addUser()        │
                         │   → SendLocalList to ALL chargers           │
                         └─────────────────────────────────────────────┘

CHARGING (ONLINE):
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ User Taps RFID   │ ──> │ CitrineOS Checks │ ──> │ Charging Starts  │
│ at Charger       │     │ Wallet Balance   │     │                  │
└──────────────────┘     └──────────────────┘     └────────┬─────────┘
                                                           │
                                                           ▼
                         ┌─────────────────────────────────────────────┐
                         │   StopTransaction → Payment Settlement      │
                         │   → Wallet Deducted → User Notified         │
                         └─────────────────────────────────────────────┘

CHARGING (OFFLINE):
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│ User Taps RFID   │ ──> │ Charger Checks   │ ──> │ Charging Starts  │
│ (Charger Offline)│     │ LOCAL Auth List  │     │ (Data Stored     │
└──────────────────┘     └──────────────────┘     │  Locally)        │
                                                  └────────┬─────────┘
                                                           │
                                               (Charger Reconnects)
                                                           │
                                                           ▼
┌──────────────────────────────────────────────────────────────────────┐
│   StopTransaction with transactionData[]                             │
│   → CitrineOS Calculates Cost                                        │
│   → Payment Settlement (Webhook to yatri-energy-backend)             │
│   → Wallet Deducted                                                  │
│   → If Balance < Threshold: Remove from Local Auth Lists             │
│   → User Notified                                                    │
└──────────────────────────────────────────────────────────────────────┘

MAINTENANCE:
┌──────────────────────────────────────────────────────────────────────┐
│   Hourly Cron: LocalAuthListSyncService.syncAllChargers()            │
│   → Rebuilds list with current eligible users                        │
│   → Removes blocked/low-balance users                                │
│   → Adds new eligible users                                          │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Files Reference

### CitrineOS Core Files

| File                                                               | Purpose                                         |
| ------------------------------------------------------------------ | ----------------------------------------------- |
| `03_Modules/Transactions/src/module/module.ts:634-737`             | StopTransaction handler with payment settlement |
| `03_Modules/Transactions/src/module/TransactionService.ts:174-259` | RFID authorization with wallet check            |
| `03_Modules/EVDriver/src/module/1.6/MessageApi.ts:47-67`           | Remote start with wallet validation             |
| `01_Data/src/layers/sequelize/model/TransactionEvent/`             | Transaction data models                         |

### yatri-energy-backend Files (To Implement)

| File                                              | Purpose                    |
| ------------------------------------------------- | -------------------------- |
| `src/services/LocalAuthListSyncService.ts`        | Auth list management       |
| `src/controllers/webhooks/transactionComplete.ts` | Webhook handler            |
| `src/jobs/authListSync.ts`                        | Cron job for periodic sync |

---

## Next Steps

1. **Implement LocalAuthListSyncService** in yatri-energy-backend
2. **Configure webhook subscription** in CitrineOS for transaction events
3. **Set up cron job** for hourly full sync
4. **Test with IoCharger** in offline mode
5. **Monitor and tune** minimum balance threshold

---

**Document Author**: Claude Code Assistant
**Last Updated**: December 29, 2025
**Related Docs**:

- `YATRI_WALLET_INTEGRATION.md` - Base wallet integration
- `ADVANCED_OPERATIONS.md` - OCPP 2.0.1 offline handling
- `OCPP_VERSION_COMPATIBILITY.md` - Protocol differences
