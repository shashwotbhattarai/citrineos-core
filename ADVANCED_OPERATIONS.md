# CitrineOS Advanced Operations Guide

_Deep Technical Concepts for Yatri Motorcycles CSMS Implementation_  
_Session Date: August 22, 2025_

## 🎯 Session Overview

This document captures advanced technical concepts explored during our deep dive into CitrineOS offline operations, local authorization, and wallet integration patterns. Essential reading for understanding sophisticated OCPP protocol implementations.

---

## 📋 Table of Contents

1. [Local Authorization Lists](#-local-authorization-lists)
2. [Offline Transaction Handling](#-offline-transaction-handling)
3. [Wallet Balance Integration](#-wallet-balance-integration)
4. [Business Implementation Patterns](#-business-implementation-patterns)
5. [Technical Implementation Details](#-technical-implementation-details)
6. [Monitoring & Reconciliation](#-monitoring--reconciliation)

---

## 🔐 Local Authorization Lists

### Business Context for Yatri Motorcycles

Local Authorization Lists enable charging stations to **operate independently** when CSMS connectivity is lost, ensuring **uninterrupted service** for Yatri's EV customers across Nepal's varying network conditions.

### 🚨 **OCPP Version Compatibility Alert**

**Critical**: Local Authorization Lists work differently between OCPP versions. See `/citrineos-core/OCPP_VERSION_COMPATIBILITY.md` for detailed differences.

- **OCPP 1.6**: Simple `idTag` string format with basic `idTagInfo`
- **OCPP 2.0.1**: Rich `AuthorizationData` structure with advanced token types

### OCPP 2.0.1 Implementation

**Purpose**: Enable offline charging by caching authorized ID tokens locally on charging stations.

#### Key Components

**1. Authorization List Structure**

```typescript
interface AuthorizationData {
  idToken: IdTokenType; // RFID card or mobile app token
  idTokenInfo?: IdTokenInfoType; // Authorization status and restrictions
}

interface IdTokenInfoType {
  status: AuthorizationStatusEnumType; // Accepted/Blocked/Expired/Invalid
  cacheExpiryDateTime?: string; // When authorization expires
  chargingPriority?: number; // Priority level (1-9)
  language1?: string; // Customer language preference
  language2?: string; // Secondary language
  groupIdToken?: IdTokenType; // Parent/group token
  personalMessage?: MessageContentType; // Custom message to display
}
```

**2. SendLocalAuthorizationList API Call**

```bash
# CitrineOS API to update station's local list
curl -X POST "http://localhost:8080/ocpp/2.0.1/sendLocalAuthorizationList" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "stationId": "YATRI_CP_001",
    "tenantId": "1",
    "versionNumber": 1,
    "updateType": "FullUpdate",
    "localAuthorizationList": [
      {
        "idToken": {
          "idToken": "RFID_WALK_IN_001",
          "type": "ISO14443"
        },
        "idTokenInfo": {
          "status": "Accepted",
          "cacheExpiryDateTime": "2025-12-31T23:59:59.000Z",
          "chargingPriority": 5
        }
      },
      {
        "idToken": {
          "idToken": "MOBILE_APP_USER_001",
          "type": "KeyCode"
        },
        "idTokenInfo": {
          "status": "Accepted",
          "cacheExpiryDateTime": "2025-08-29T23:59:59.000Z",
          "chargingPriority": 3
        }
      }
    ]
  }'
```

#### Business Use Cases

**Yatri Customer Scenarios:**

1. **Walk-in RFID Registration**: Customer gets RFID card → Added to local auth list → Can charge offline
2. **Mobile App Users**: App generates temporary tokens → Synced to local list → Offline charging enabled
3. **Network Outages**: Stations continue serving authorized customers using cached credentials
4. **Remote Locations**: Stations in rural Nepal operate independently with periodic sync

### CitrineOS Implementation Analysis

**Database Storage**: `/citrineos-core/01_Data/src/layers/sequelize/model/Authorization/Authorization.ts`

```typescript
@Table
export class Authorization extends BaseModelWithTenant {
  @Column({ type: DataType.STRING, allowNull: false })
  declare stationId: string;

  @Column({ type: DataType.STRING, allowNull: false })
  declare idToken: string;

  @Column({ type: DataType.STRING })
  declare type: string | null;

  @Column({ type: DataType.JSON })
  declare idTokenInfo: IdTokenInfoType | null;

  @Column({ type: DataType.BOOLEAN, defaultValue: false })
  declare concurrentTransaction: boolean;
}
```

**Message Handling**: `/citrineos-core/03_Modules/EVDriver/src/module/module.ts`

```typescript
@AsHandler(OCPP2_0_1_CallAction.SendLocalAuthorizationList)
async handleSendLocalAuthorizationList(
  message: IMessage<OCPP2_0_1.SendLocalAuthorizationListRequest>
): Promise<OCPP2_0_1.SendLocalAuthorizationListResponse> {

  const request = message.payload;

  // Validate and store authorization list
  for (const authData of request.localAuthorizationList || []) {
    await this._authorizationRepository.createOrUpdateByQuerystring(
      message.context.tenantId,
      {
        stationId: message.context.stationId,
        idToken: authData.idToken.idToken,
        type: authData.idToken.type,
        idTokenInfo: authData.idTokenInfo
      }
    );
  }

  return { status: OCPP2_0_1.SendLocalAuthorizationListStatusEnumType.Accepted };
}
```

---

## 🔄 Offline Transaction Handling

### 🚨 **OCPP Version Compatibility Alert**

**Critical**: Offline transaction handling varies significantly between OCPP versions:

- **OCPP 1.6**: Limited offline support, basic transaction logging
- **OCPP 2.0.1**: Full offline capabilities with `offline` flag and sequence tracking

See `/citrineos-core/OCPP_VERSION_COMPATIBILITY.md` for implementation differences.

### OCPP Protocol Mechanisms

When charging stations lose CSMS connectivity, OCPP provides robust mechanisms for data preservation and synchronization.

#### Transaction Event Structure for Offline Operations

```typescript
interface TransactionEventRequest {
  eventType: TransactionEventEnumType; // Started/Updated/Ended
  offline?: boolean; // KEY: Indicates offline event
  timestamp: string; // Actual event occurrence time
  seqNo: number; // Sequence number for ordering
  transactionInfo: TransactionType;
  meterValue?: MeterValueType[]; // Energy readings during offline period
  idToken?: IdTokenType; // Authorization token used
}
```

#### Offline Operation Flow

**1. Connection Loss Detection**

```typescript
// CitrineOS Router detects station disconnect
async deregisterConnection(tenantId: number, stationId: string): Promise<boolean> {
  // Mark station as offline in database
  const offlineCharger = await this._locationRepository.setChargingStationIsOnlineAndOCPPVersion(
    tenantId,
    stationId,
    false,  // isOnline = false
    null    // Clear OCPP version
  );

  this._logger.info(`Station ${stationId} marked as offline`);
  return true;
}
```

**2. Station-Side Offline Behavior**

- **Local Storage**: Station stores all transaction events with `offline: true` flag
- **Sequence Tracking**: Maintains `seqNo` for proper event ordering during sync
- **Energy Metering**: Continues recording meter values with accurate timestamps
- **Authorization**: Uses Local Authorization List for ID token validation

**3. Reconnection & Data Synchronization**

**Phase A: Status Notification**

```json
{
  "messageType": 2,
  "messageId": "reconnect-001",
  "action": "StatusNotification",
  "payload": {
    "timestamp": "2025-08-22T14:30:00.000Z",
    "connectorStatus": "Available",
    "evseId": 1,
    "connectorId": 1
  }
}
```

**Phase B: Offline Transaction Upload**

```json
{
  "messageType": 2,
  "messageId": "offline-txn-001",
  "action": "TransactionEvent",
  "payload": {
    "eventType": "Started",
    "offline": true,
    "timestamp": "2025-08-22T14:25:00.000Z",
    "seqNo": 1,
    "triggerReason": "Authorized",
    "transactionInfo": {
      "transactionId": "TXN_OFFLINE_001",
      "chargingState": "Charging"
    },
    "idToken": {
      "idToken": "RFID123456789",
      "type": "ISO14443"
    },
    "meterValue": [
      {
        "timestamp": "2025-08-22T14:25:00.000Z",
        "sampledValue": [
          {
            "value": 0,
            "measurand": "Energy.Active.Import.Register",
            "context": "Transaction.Begin"
          }
        ]
      }
    ]
  }
}
```

#### CitrineOS Offline Processing

```typescript
// TransactionService handles offline events with special processing
async processOfflineTransaction(
  request: OCPP2_0_1.TransactionEventRequest,
  context: IMessageContext
): Promise<OCPP2_0_1.TransactionEventResponse> {

  if (request.offline) {
    this._logger.info(`Processing offline transaction event: ${request.eventType}`);

    // Use original timestamp, not current processing time
    const originalEventTime = new Date(request.timestamp);

    // Validate sequence integrity to ensure no missing events
    await this.validateOfflineSequence(
      request.transactionInfo.transactionId,
      request.seqNo
    );

    // Process with offline-specific business logic
    const transaction = await this.createOrUpdateTransaction(request, originalEventTime);

    // Calculate costs using tariffs from original time period
    if (request.eventType === OCPP2_0_1.TransactionEventEnumType.Ended) {
      await this.calculateOfflineCosts(transaction, originalEventTime);
    }
  }

  // Return standard response
  return {
    idTokenInfo: {
      status: OCPP2_0_1.AuthorizationStatusEnumType.Accepted
    }
  };
}
```

#### Offline Cost Calculation Strategy

```typescript
class CostCalculator {
  /**
   * Calculate costs for offline transactions using historical tariff rates
   */
  async calculateOfflineCosts(
    transaction: Transaction,
    originalTransactionTime: Date,
  ): Promise<number> {
    // Retrieve tariff rates from the actual transaction time period
    const historicalTariff = await this._tariffRepository.findByStationIdAndTime(
      transaction.tenantId,
      transaction.stationId,
      originalTransactionTime, // Use original time, not current time!
    );

    if (!historicalTariff) {
      this._logger.error(`No tariff found for offline transaction at ${originalTransactionTime}`);
      return 0;
    }

    // Calculate total cost based on energy consumption
    const totalKwh = await this._transactionService.recalculateTotalKwh(
      transaction.tenantId,
      transaction.id,
    );

    const totalCost = Money.of(historicalTariff.pricePerKwh, historicalTariff.currency)
      .multiply(totalKwh)
      .add(historicalTariff.pricePerSession || 0) // Session fee
      .multiply(1 + (historicalTariff.taxRate || 0)) // Apply tax
      .roundToCurrencyScale()
      .toNumber();

    this._logger.debug(
      `Offline transaction cost: ${totalKwh} kWh × ${historicalTariff.pricePerKwh} = ${totalCost}`,
    );

    return totalCost;
  }
}
```

### Business Impact for Yatri

**Revenue Protection:**

- ✅ **Zero Revenue Loss**: All offline transactions captured and billed accurately
- ✅ **Historical Pricing**: Costs calculated using rates from actual usage time
- ✅ **Complete Audit Trail**: Full transaction history with timestamps preserved

**Customer Experience:**

- ✅ **Uninterrupted Service**: Charging continues during network outages
- ✅ **Fair Billing**: Charged based on actual consumption at time of use
- ✅ **Reliable Access**: RFID cards work offline via Local Authorization Lists

**Operational Benefits:**

- ✅ **Network Resilience**: Distributed operation across charging stations
- ✅ **Automatic Recovery**: Seamless data sync when connectivity restored
- ✅ **Business Continuity**: No manual intervention required for offline operations

---

## 💳 Wallet Balance Integration

### Strategic Deduction Approach

For Yatri's mobile app wallet integration, implement a **hybrid authorization and settlement model**:

#### Phase 1: Transaction Authorization (Started Event)

**Purpose**: Ensure sufficient funds before allowing charging to begin

```typescript
interface WalletAuthorizationFlow {
  trigger: 'TransactionEvent.Started';
  action: 'AUTHORIZATION_HOLD';
  amount: number;  // From tariff.authorizationAmount (e.g., NPR 500)
  purpose: 'Guarantee payment capability';
}

// Implementation in TransactionService
async authorizeWalletTransaction(
  request: OCPP2_0_1.TransactionEventRequest
): Promise<OCPP2_0_1.TransactionEventResponse> {

  if (request.eventType === OCPP2_0_1.TransactionEventEnumType.Started) {
    // Get authorization amount from tariff
    const tariff = await this._tariffRepository.findByStationId(
      tenantId,
      request.stationId
    );

    const authAmount = tariff?.authorizationAmount || 500; // NPR default

    // Place hold on customer wallet
    const walletResult = await this._walletService.authorizeHold({
      customerId: request.idToken?.idToken,
      amount: authAmount,
      transactionId: request.transactionInfo.transactionId,
      currency: tariff?.currency || 'NPR',
      holdType: 'CHARGING_AUTHORIZATION'
    });

    if (walletResult.status !== 'APPROVED') {
      return {
        idTokenInfo: {
          status: OCPP2_0_1.AuthorizationStatusEnumType.NoCredit,
          personalMessage: {
            format: OCPP2_0_1.MessageFormatEnumType.UTF8,
            language: 'np',
            content: 'वालेटमा अपर्याप्त शेष। Insufficient wallet balance.'
          }
        }
      };
    }

    // Store authorization reference for later settlement
    await this._paymentRepository.createAuthorizationRecord({
      transactionId: request.transactionInfo.transactionId,
      customerId: request.idToken?.idToken,
      authorizedAmount: authAmount,
      walletTransactionId: walletResult.transactionId,
      status: 'AUTHORIZED'
    });
  }

  return {
    idTokenInfo: {
      status: OCPP2_0_1.AuthorizationStatusEnumType.Accepted
    }
  };
}
```

#### Phase 2: Real-time Monitoring (Updated Events - Optional)

**Purpose**: Monitor spending and stop transaction if approaching wallet limit

```typescript
async monitorWalletDuringCharging(
  request: OCPP2_0_1.TransactionEventRequest
): Promise<void> {

  if (request.eventType === OCPP2_0_1.TransactionEventEnumType.Updated) {
    // Calculate current transaction cost
    const currentCost = await this._costCalculator.calculateTotalCost(
      tenantId,
      request.stationId,
      transactionDbId
    );

    // Get customer's available balance
    const availableBalance = await this._walletService.getAvailableBalance(
      request.idToken?.idToken
    );

    // Check if current cost is approaching available balance
    const safetyMargin = 50; // NPR 50 safety buffer
    if (currentCost + safetyMargin >= availableBalance) {

      // Send remote stop to prevent overdraft
      await this._module.sendCall(
        request.stationId,
        tenantId,
        OCPPVersion.OCPP2_0_1,
        OCPP2_0_1_CallAction.RequestStopTransaction,
        {
          transactionId: request.transactionInfo.transactionId,
          reason: OCPP2_0_1.ReasonEnumType.Other
        }
      );

      this._logger.warn(
        `Stopping transaction ${request.transactionInfo.transactionId} - insufficient wallet balance`
      );
    }
  }
}
```

#### Phase 3: Final Settlement (Ended Event)

**Purpose**: Charge actual consumption amount and release unused authorization

```typescript
async settleWalletTransaction(
  request: OCPP2_0_1.TransactionEventRequest
): Promise<void> {

  if (request.eventType === OCPP2_0_1.TransactionEventEnumType.Ended) {

    // Calculate final consumption cost
    const finalCost = await this._costCalculator.calculateTotalCost(
      tenantId,
      request.stationId,
      transactionDbId
    );

    // Retrieve original authorization
    const authRecord = await this._paymentRepository.findByTransactionId(
      request.transactionInfo.transactionId
    );

    if (!authRecord) {
      this._logger.error(`No authorization found for transaction ${request.transactionInfo.transactionId}`);
      return;
    }

    // Settle the payment
    const settlementResult = await this._walletService.settleAuthorization({
      walletTransactionId: authRecord.walletTransactionId,
      finalAmount: finalCost,
      originalAuthAmount: authRecord.authorizedAmount,
      description: `EV Charging - ${request.stationId}`,
      metadata: {
        transactionId: request.transactionInfo.transactionId,
        stationId: request.stationId,
        energyKwh: await this.getTotalKwh(transactionDbId),
        chargingDuration: this.getChargingDuration(request)
      }
    });

    // Update payment record
    await this._paymentRepository.updateAuthorizationRecord(authRecord.id, {
      status: 'SETTLED',
      finalAmount: finalCost,
      settlementId: settlementResult.settlementId,
      settledAt: new Date()
    });

    // Update transaction with final cost
    await this._transactionEventRepository.updateTransactionTotalCostById(
      tenantId,
      finalCost,
      transactionDbId
    );

    this._logger.info(
      `Wallet settlement completed: ${finalCost} NPR charged for transaction ${request.transactionInfo.transactionId}`
    );
  }
}
```

### Wallet Service Interface

```typescript
interface IWalletService {
  // Authorization phase
  authorizeHold(request: WalletAuthorizationRequest): Promise<WalletAuthorizationResponse>;

  // Monitoring phase
  getAvailableBalance(customerId: string): Promise<number>;

  // Settlement phase
  settleAuthorization(request: WalletSettlementRequest): Promise<WalletSettlementResponse>;

  // Reconciliation
  getTransactionHistory(customerId: string, dateRange: DateRange): Promise<WalletTransaction[]>;
}

interface WalletAuthorizationRequest {
  customerId: string;
  amount: number;
  transactionId: string;
  currency: string;
  holdType: 'CHARGING_AUTHORIZATION';
  expiryMinutes?: number; // Default: 60 minutes
}

interface WalletSettlementRequest {
  walletTransactionId: string;
  finalAmount: number;
  originalAuthAmount: number;
  description: string;
  metadata?: Record<string, any>;
}
```

---

## 🏪 Business Implementation Patterns

### Yatri Customer Journey Integration

#### Walk-in Customer Registration Flow

```
Customer arrives → RFID card issued →
Local Authorization List updated →
Wallet linked → Ready to charge
```

**Implementation:**

```typescript
async registerWalkInCustomer(
  stationId: string,
  rfidCardId: string,
  customerDetails: CustomerDetails
): Promise<RegistrationResult> {

  // 1. Create customer wallet
  const wallet = await this._walletService.createWallet({
    customerId: customerDetails.phoneNumber,
    initialBalance: 0,
    currency: 'NPR'
  });

  // 2. Add to authorization database
  await this._authorizationRepository.createOrUpdate({
    tenantId: 1,
    stationId: stationId,
    idToken: rfidCardId,
    type: 'ISO14443',
    idTokenInfo: {
      status: 'Accepted',
      cacheExpiryDateTime: '2025-12-31T23:59:59.000Z',
      chargingPriority: 5
    }
  });

  // 3. Update Local Authorization List on station
  await this._module.sendCall(
    stationId,
    1, // tenantId
    OCPPVersion.OCPP2_0_1,
    OCPP2_0_1_CallAction.SendLocalAuthorizationList,
    {
      versionNumber: await this.getNextVersionNumber(stationId),
      updateType: 'DifferentialUpdate',
      localAuthorizationList: [{
        idToken: { idToken: rfidCardId, type: 'ISO14443' },
        idTokenInfo: {
          status: 'Accepted',
          cacheExpiryDateTime: '2025-12-31T23:59:59.000Z'
        }
      }]
    }
  );

  return {
    success: true,
    customerId: customerDetails.phoneNumber,
    rfidCardId: rfidCardId,
    walletId: wallet.id
  };
}
```

#### Mobile App User Flow

```
App registration → JWT token generated →
Local Authorization List updated →
Wallet integration → QR/NFC charging
```

**Implementation:**

```typescript
async registerMobileAppUser(
  userId: string,
  deviceToken: string
): Promise<MobileRegistrationResult> {

  // 1. Generate secure charging token
  const chargingToken = this.generateSecureToken(userId);

  // 2. Add to all stations' authorization lists
  const activeStations = await this._locationRepository.findAllActiveStations(tenantId);

  for (const station of activeStations) {
    await this._authorizationRepository.createOrUpdate({
      tenantId: 1,
      stationId: station.id,
      idToken: chargingToken,
      type: 'KeyCode',
      idTokenInfo: {
        status: 'Accepted',
        cacheExpiryDateTime: this.getTokenExpiry(30), // 30 days
        chargingPriority: 3
      }
    });

    // Update station's local list
    await this._module.sendCall(
      station.id,
      1,
      OCPPVersion.OCPP2_0_1,
      OCPP2_0_1_CallAction.SendLocalAuthorizationList,
      {
        versionNumber: await this.getNextVersionNumber(station.id),
        updateType: 'DifferentialUpdate',
        localAuthorizationList: [{
          idToken: { idToken: chargingToken, type: 'KeyCode' },
          idTokenInfo: {
            status: 'Accepted',
            cacheExpiryDateTime: this.getTokenExpiry(30)
          }
        }]
      }
    );
  }

  return {
    success: true,
    userId: userId,
    chargingToken: chargingToken,
    tokenExpiry: this.getTokenExpiry(30)
  };
}
```

---

## 🔧 Technical Implementation Details

### Database Schema Extensions

#### Payment Authorization Tracking

```sql
CREATE TABLE payment_authorizations (
  id SERIAL PRIMARY KEY,
  tenant_id INTEGER NOT NULL,
  transaction_id VARCHAR(255) NOT NULL,
  customer_id VARCHAR(255) NOT NULL,
  station_id VARCHAR(255) NOT NULL,

  authorized_amount DECIMAL(10,2) NOT NULL,
  final_amount DECIMAL(10,2),
  currency CHAR(3) NOT NULL DEFAULT 'NPR',

  wallet_transaction_id VARCHAR(255) NOT NULL,
  settlement_id VARCHAR(255),

  status VARCHAR(50) NOT NULL DEFAULT 'AUTHORIZED',
  -- Status: AUTHORIZED, SETTLED, EXPIRED, CANCELLED

  authorized_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  settled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '1 hour',

  metadata JSONB,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_payment_auth_transaction ON payment_authorizations(transaction_id);
CREATE INDEX idx_payment_auth_customer ON payment_authorizations(customer_id);
CREATE INDEX idx_payment_auth_status ON payment_authorizations(status);
```

#### Offline Transaction Tracking

```sql
-- Add offline tracking to existing transaction_events table
ALTER TABLE transaction_events
ADD COLUMN IF NOT EXISTS offline BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS sync_status VARCHAR(50) DEFAULT 'SYNCED';
-- sync_status: PENDING, SYNCED, FAILED

-- Index for offline event queries
CREATE INDEX IF NOT EXISTS idx_transaction_events_offline
ON transaction_events (transaction_id, offline, seq_no);
```

### Message Queue Integration

#### Offline Transaction Processing Queue

```typescript
// RabbitMQ queue configuration for offline transaction processing
const OFFLINE_TRANSACTION_QUEUE = 'citrineos.offline.transactions';

interface OfflineTransactionMessage {
  stationId: string;
  tenantId: number;
  transactionEvents: OCPP2_0_1.TransactionEventRequest[];
  reconnectionTime: string;
  priority: 'HIGH' | 'NORMAL' | 'LOW';
}

// Queue processor
export class OfflineTransactionProcessor {
  async processOfflineTransactionBatch(message: OfflineTransactionMessage): Promise<void> {
    this._logger.info(
      `Processing ${message.transactionEvents.length} offline events for ${message.stationId}`,
    );

    // Sort events by sequence number
    const sortedEvents = message.transactionEvents.sort((a, b) => a.seqNo - b.seqNo);

    // Process each event in order
    for (const event of sortedEvents) {
      try {
        await this._transactionService.processOfflineTransaction(event);

        // Update sync status
        await this._transactionEventRepository.updateSyncStatus(
          event.transactionInfo.transactionId,
          event.seqNo,
          'SYNCED',
        );
      } catch (error) {
        this._logger.error(`Failed to process offline event ${event.seqNo}`, error);

        await this._transactionEventRepository.updateSyncStatus(
          event.transactionInfo.transactionId,
          event.seqNo,
          'FAILED',
        );

        // Send to retry queue
        await this._publisher.publish(
          'citrineos.offline.retry',
          event,
          { delay: 300000 }, // 5 minute delay
        );
      }
    }
  }
}
```

### Configuration Management

#### Offline Operation Settings

```typescript
// Environment configuration for offline operations
export interface OfflineConfig {
  // Local Authorization List settings
  localAuthListEnabled: boolean;
  localAuthListMaxSize: number;
  localAuthListSyncInterval: number; // minutes

  // Offline transaction settings
  offlineTransactionBufferSize: number;
  offlineTransactionRetentionDays: number;
  offlineSequenceValidationEnabled: boolean;

  // Wallet integration settings
  walletAuthorizationTimeoutMinutes: number;
  walletBalanceCheckIntervalSeconds: number;
  walletLowBalanceThreshold: number; // NPR

  // Network resilience
  connectionTimeoutSeconds: number;
  reconnectRetryIntervalSeconds: number;
  maxReconnectAttempts: number;
}

// Default configuration for Nepal deployment
export const NEPAL_OFFLINE_CONFIG: OfflineConfig = {
  localAuthListEnabled: true,
  localAuthListMaxSize: 1000,
  localAuthListSyncInterval: 60, // 1 hour

  offlineTransactionBufferSize: 500,
  offlineTransactionRetentionDays: 30,
  offlineSequenceValidationEnabled: true,

  walletAuthorizationTimeoutMinutes: 60,
  walletBalanceCheckIntervalSeconds: 30,
  walletLowBalanceThreshold: 100, // NPR 100

  connectionTimeoutSeconds: 30,
  reconnectRetryIntervalSeconds: 60,
  maxReconnectAttempts: 10,
};
```

---

## 📊 Monitoring & Reconciliation

### Real-time Dashboards

#### Offline Operations Dashboard

```typescript
interface OfflineOperationsMetrics {
  // Station connectivity
  totalStations: number;
  onlineStations: number;
  offlineStations: number;
  intermittentStations: number;

  // Transaction processing
  offlineTransactionsPending: number;
  offlineTransactionsSynced: number;
  offlineTransactionsFailed: number;

  // Financial impact
  offlineRevenueValue: number;
  pendingSettlements: number;
  walletAuthorizationFailures: number;

  // Performance metrics
  averageSyncTime: number; // seconds
  syncSuccessRate: number; // percentage
  dataIntegrityScore: number; // percentage
}

// GraphQL subscription for real-time monitoring
const OFFLINE_METRICS_SUBSCRIPTION = gql`
  subscription OfflineOperationsMetrics($tenantId: Int!) {
    offline_operations_metrics(where: { tenant_id: { _eq: $tenantId } }) {
      total_stations
      online_stations
      offline_stations
      offline_transactions_pending
      offline_revenue_value
      sync_success_rate
      updated_at
    }
  }
`;
```

#### Financial Reconciliation Reports

```typescript
interface OfflineRevenueReport {
  reportPeriod: DateRange;

  // Revenue breakdown
  onlineTransactionRevenue: number;
  offlineTransactionRevenue: number;
  totalRevenue: number;

  // Transaction counts
  onlineTransactionCount: number;
  offlineTransactionCount: number;

  // Wallet operations
  successfulAuthorizations: number;
  failedAuthorizations: number;
  pendingSettlements: number;

  // Data quality
  completeTransactions: number;
  incompleteTransactions: number;
  dataIntegrityIssues: string[];
}

// Generate daily reconciliation report
export class OfflineRevenueReconciliation {
  async generateDailyReport(date: Date): Promise<OfflineRevenueReport> {
    const startDate = startOfDay(date);
    const endDate = endOfDay(date);

    // Query offline transactions
    const offlineTransactions = await this._transactionEventRepository.findAll({
      where: {
        offline: true,
        timestamp: {
          [Op.between]: [startDate, endDate],
        },
      },
    });

    // Calculate revenue impact
    const offlineRevenue = await this.calculateOfflineRevenue(offlineTransactions);
    const onlineRevenue = await this.calculateOnlineRevenue(startDate, endDate);

    // Wallet authorization statistics
    const walletStats = await this.getWalletStatistics(startDate, endDate);

    return {
      reportPeriod: { start: startDate, end: endDate },
      onlineTransactionRevenue: onlineRevenue.total,
      offlineTransactionRevenue: offlineRevenue.total,
      totalRevenue: onlineRevenue.total + offlineRevenue.total,
      onlineTransactionCount: onlineRevenue.count,
      offlineTransactionCount: offlineRevenue.count,
      successfulAuthorizations: walletStats.successful,
      failedAuthorizations: walletStats.failed,
      pendingSettlements: walletStats.pending,
      completeTransactions: offlineTransactions.filter((t) => t.syncStatus === 'SYNCED').length,
      incompleteTransactions: offlineTransactions.filter((t) => t.syncStatus === 'FAILED').length,
      dataIntegrityIssues: await this.validateDataIntegrity(offlineTransactions),
    };
  }
}
```

### Alerting System

#### Critical Offline Events

```typescript
interface OfflineAlert {
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  type: 'STATION_OFFLINE' | 'TRANSACTION_SYNC_FAILED' | 'WALLET_AUTH_FAILED' | 'DATA_INTEGRITY';
  stationId: string;
  message: string;
  timestamp: Date;
  metadata: Record<string, any>;
}

export class OfflineAlertManager {
  async handleStationOffline(stationId: string, lastSeen: Date): Promise<void> {
    const offlineDuration = Date.now() - lastSeen.getTime();

    if (offlineDuration > 30 * 60 * 1000) {
      // 30 minutes
      await this.sendAlert({
        severity: 'WARNING',
        type: 'STATION_OFFLINE',
        stationId: stationId,
        message: `Station ${stationId} has been offline for ${Math.round(offlineDuration / 60000)} minutes`,
        timestamp: new Date(),
        metadata: { lastSeen, offlineDurationMinutes: Math.round(offlineDuration / 60000) },
      });
    }

    if (offlineDuration > 4 * 60 * 60 * 1000) {
      // 4 hours
      await this.sendAlert({
        severity: 'CRITICAL',
        type: 'STATION_OFFLINE',
        stationId: stationId,
        message: `CRITICAL: Station ${stationId} has been offline for over 4 hours`,
        timestamp: new Date(),
        metadata: { lastSeen, requiresFieldTechnician: true },
      });
    }
  }

  async handleWalletAuthorizationFailure(
    customerId: string,
    transactionId: string,
    reason: string,
  ): Promise<void> {
    await this.sendAlert({
      severity: 'WARNING',
      type: 'WALLET_AUTH_FAILED',
      stationId: 'N/A',
      message: `Wallet authorization failed for customer ${customerId}: ${reason}`,
      timestamp: new Date(),
      metadata: { customerId, transactionId, reason },
    });
  }
}
```

---

## 💰 Billing and Tariffs Configuration

_Session Date: August 22, 2025 (Extended Deep Dive)_

### 🏗️ **Tariff Model Architecture**

CitrineOS implements a sophisticated billing system using high-precision financial calculations for accurate revenue management.

### 🚨 **OCPP Version Compatibility Alert**

**Important**: Billing and cost calculation features vary between OCPP versions:

- **OCPP 1.6**: Manual cost calculation only, no real-time cost updates
- **OCPP 2.0.1**: Native `CostUpdated` message support for real-time notifications

Both versions require custom tariff management - this is a CitrineOS enhancement. See `/citrineos-core/OCPP_VERSION_COMPATIBILITY.md` for detailed differences.

#### **Database Schema Structure**

```typescript
// Tariff Model in CitrineOS
@Table
export class Tariff extends BaseModelWithTenant implements TariffData {
  @Column({ type: DataType.STRING, unique: true })
  declare stationId: string; // Unique per charging station

  @Column({ type: DataType.CHAR(3), allowNull: false })
  declare currency: string; // 3-character currency code (NPR, USD)

  @Column({ type: DataType.DECIMAL, allowNull: false })
  declare pricePerKwh: number; // Energy cost (NPR per kWh)

  @Column({ type: DataType.DECIMAL })
  declare pricePerMin?: number; // Time-based pricing (NPR per minute)

  @Column({ type: DataType.DECIMAL })
  declare pricePerSession?: number; // Flat session connection fee

  @Column({ type: DataType.DECIMAL })
  declare authorizationAmount?: number; // Pre-authorization hold amount

  @Column({ type: DataType.DECIMAL })
  declare paymentFee?: number; // Transaction processing fee

  @Column({ type: DataType.DECIMAL })
  declare taxRate?: number; // Tax percentage (0.13 = 13% VAT)
}
```

#### **High-Precision Money Class**

CitrineOS uses the `Money` class with Big.js for financial accuracy:

```typescript
// Money class prevents floating-point precision errors
class Money {
  private readonly _amount: Big;
  private readonly _currency: Currency;

  multiply(multiplier: number): Money; // Precise multiplication
  add(money: Money): Money; // Currency-safe addition
  subtract(money: Money): Money; // Accurate subtraction
  roundToCurrencyScale(): Money; // Proper currency rounding
  toNumber(): number; // Final conversion

  // Usage in cost calculation
  static calculateTransactionCost(tariff: Tariff, kwhUsed: number): number {
    return Money.of(tariff.pricePerKwh, tariff.currency)
      .multiply(kwhUsed) // Base energy cost
      .add(Money.of(tariff.pricePerSession || 0, tariff.currency)) // Session fee
      .multiply(1 + (tariff.taxRate || 0)) // Apply tax
      .roundToCurrencyScale() // Round to currency precision
      .toNumber(); // Final amount
  }
}
```

### 💳 **Yatri's Multi-Tier Pricing Strategy**

#### **Tier 1: Standard AC Charging (22kW)**

```typescript
const acStandardTariff: TariffData = {
  stationId: 'yatri-ktm-001',
  currency: 'NPR',
  pricePerKwh: 15.0, // NPR 15 per kWh - competitive rate
  pricePerMin: 1.0, // NPR 1 per minute occupancy fee
  pricePerSession: 25.0, // NPR 25 connection fee
  authorizationAmount: 500.0, // NPR 500 pre-authorization hold
  paymentFee: 10.0, // NPR 10 processing fee
  taxRate: 0.13, // 13% VAT (Nepal standard rate)
};

/* Real-world calculation example:
   30 kWh charge × NPR 15 = NPR 450 (energy)
   45 minutes × NPR 1 = NPR 45 (time occupancy)
   Session fee = NPR 25
   Subtotal = NPR 520
   Tax (13%) = NPR 67.60
   Payment fee = NPR 10
   TOTAL = NPR 597.60 */
```

#### **Tier 2: Premium DC Fast Charging (50kW)**

```typescript
const dcFastTariff: TariffData = {
  stationId: 'yatri-ktm-002',
  currency: 'NPR',
  pricePerKwh: 25.0, // Premium energy rate for speed
  pricePerMin: 2.5, // Higher occupancy fee (faster turnover)
  pricePerSession: 50.0, // Premium connection fee
  authorizationAmount: 1000.0, // Higher pre-auth for larger sessions
  paymentFee: 15.0, // Higher processing fee
  taxRate: 0.13,
};
```

#### **Tier 3: Ultra-Fast Charging (150kW)**

```typescript
const ultraFastTariff: TariffData = {
  stationId: 'yatri-pkr-001',
  currency: 'NPR',
  pricePerKwh: 35.0, // Premium ultra-fast rate
  pricePerMin: 5.0, // Highest occupancy fee
  pricePerSession: 100.0, // Premium session fee
  authorizationAmount: 2000.0, // Highest pre-auth amount
  paymentFee: 25.0, // Highest processing fee
  taxRate: 0.13,
};
```

### 🔄 **Real-Time Cost Calculation Engine**

#### **CostCalculator Implementation**

```typescript
export class CostCalculator {
  private readonly _tariffRepository: ITariffRepository;
  private readonly _transactionService: TransactionService;

  async calculateTotalCost(
    tenantId: number,
    stationId: string,
    transactionDbId: number,
    totalKwh?: number,
  ): Promise<number> {
    // 1. Retrieve station-specific tariff
    const tariff = await this._tariffRepository.findByStationId(tenantId, stationId);
    if (!tariff) {
      this._logger.error(`No tariff configuration found for station ${stationId}`);
      return 0;
    }

    // 2. Calculate or retrieve energy consumption
    if (totalKwh === undefined || totalKwh === null) {
      totalKwh = await this._transactionService.recalculateTotalKwh(tenantId, transactionDbId);
    }

    // 3. High-precision calculation using Money class
    return this._calculateTotalCost(tenantId, stationId, totalKwh, tariff);
  }

  private async _calculateTotalCost(
    tenantId: number,
    stationId: string,
    totalKwh: number,
    tariff: Tariff,
  ): Promise<number> {
    this._logger.debug(`Calculating cost: ${stationId} station, ${totalKwh} kWh`);

    // Base energy cost calculation
    const energyCost = Money.of(tariff.pricePerKwh, tariff.currency).multiply(totalKwh);

    // Additional fees
    const sessionFee = Money.of(tariff.pricePerSession || 0, tariff.currency);
    const paymentFee = Money.of(tariff.paymentFee || 0, tariff.currency);

    // Time-based pricing (if configured)
    let timeCost = Money.of(0, tariff.currency);
    if (tariff.pricePerMin) {
      const chargingMinutes = await this.getChargingDurationMinutes(transactionDbId);
      timeCost = Money.of(tariff.pricePerMin, tariff.currency).multiply(chargingMinutes);
    }

    // Calculate subtotal
    const subtotal = energyCost.add(sessionFee).add(timeCost).add(paymentFee);

    // Apply tax if configured
    const taxMultiplier = 1 + (tariff.taxRate || 0);
    const finalTotal = subtotal.multiply(taxMultiplier);

    return finalTotal.roundToCurrencyScale().toNumber();
  }
}
```

### 📊 **Advanced Tariff Management**

#### **Tariff Repository Operations**

```typescript
interface ITariffRepository extends CrudRepository<Tariff> {
  // Core station-specific operations
  findByStationId(tenantId: number, stationId: string): Promise<Tariff | undefined>;
  findByStationIds(tenantId: number, stationIds: string[]): Promise<Tariff[]>;

  // CRUD operations
  upsertTariff(tenantId: number, tariff: Tariff): Promise<Tariff>;
  readAllByQuerystring(tenantId: number, query: TariffQueryString): Promise<Tariff[]>;
  deleteAllByQuerystring(tenantId: number, query: TariffQueryString): Promise<Tariff[]>;
}

// Example: Bulk tariff setup for Yatri network
async function setupYatriNetworkTariffs(tenantId: number): Promise<void> {
  const networkConfigs = [
    { stationId: 'yatri-ktm-001', type: 'AC_STANDARD', pricePerKwh: 15.0 },
    { stationId: 'yatri-ktm-002', type: 'DC_FAST', pricePerKwh: 25.0 },
    { stationId: 'yatri-pkr-001', type: 'ULTRA_FAST', pricePerKwh: 35.0 },
  ];

  for (const config of networkConfigs) {
    const tariff = Tariff.newInstance({
      id: 0, // Auto-generated
      currency: 'NPR',
      stationId: config.stationId,
      pricePerKwh: config.pricePerKwh,
      pricePerMin: config.type === 'ULTRA_FAST' ? 5.0 : config.type === 'DC_FAST' ? 2.5 : 1.0,
      pricePerSession:
        config.type === 'ULTRA_FAST' ? 100.0 : config.type === 'DC_FAST' ? 50.0 : 25.0,
      authorizationAmount:
        config.type === 'ULTRA_FAST' ? 2000.0 : config.type === 'DC_FAST' ? 1000.0 : 500.0,
      paymentFee: config.type === 'ULTRA_FAST' ? 25.0 : config.type === 'DC_FAST' ? 15.0 : 10.0,
      taxRate: 0.13, // Nepal VAT rate
    });

    await this._tariffRepository.upsertTariff(tenantId, tariff);
    this._logger.info(`Configured ${config.type} tariff for ${config.stationId}`);
  }
}
```

### 💰 **Real-World Billing Scenarios**

#### **Scenario 1: Daily Commuter (Standard AC)**

```
Customer: Yatri bike daily commuter
Station: yatri-ktm-001 (AC 22kW)
Energy consumed: 15 kWh (50km range)
Charging time: 35 minutes
Session count: 1

Detailed calculation:
├─ Energy cost: 15 kWh × NPR 15.00 = NPR 225.00
├─ Time cost: 35 min × NPR 1.00 = NPR 35.00
├─ Session fee: NPR 25.00
├─ Payment processing: NPR 10.00
├─ Subtotal: NPR 295.00
├─ VAT (13%): NPR 38.35
└─ TOTAL CHARGED: NPR 333.35

Wallet deduction: NPR 500.00 (pre-auth) → NPR 333.35 (final)
Refund: NPR 166.65
```

#### **Scenario 2: Commercial Driver (DC Fast)**

```
Customer: Delivery service driver
Station: yatri-ktm-002 (DC 50kW)
Energy consumed: 40 kWh (130km range)
Charging time: 25 minutes (fast charging)
Session count: 1

Detailed calculation:
├─ Energy cost: 40 kWh × NPR 25.00 = NPR 1,000.00
├─ Time cost: 25 min × NPR 2.50 = NPR 62.50
├─ Session fee: NPR 50.00
├─ Payment processing: NPR 15.00
├─ Subtotal: NPR 1,127.50
├─ VAT (13%): NPR 146.58
└─ TOTAL CHARGED: NPR 1,274.08

Wallet deduction: NPR 1,000.00 (pre-auth) → Additional NPR 274.08 charged
```

#### **Scenario 3: Long-Distance Travel (Ultra-Fast)**

```
Customer: Inter-city traveler
Station: yatri-pkr-001 (150kW)
Energy consumed: 60 kWh (200km range)
Charging time: 18 minutes (ultra-fast)
Session count: 1

Detailed calculation:
├─ Energy cost: 60 kWh × NPR 35.00 = NPR 2,100.00
├─ Time cost: 18 min × NPR 5.00 = NPR 90.00
├─ Session fee: NPR 100.00
├─ Payment processing: NPR 25.00
├─ Subtotal: NPR 2,315.00
├─ VAT (13%): NPR 300.95
└─ TOTAL CHARGED: NPR 2,615.95

Wallet deduction: NPR 2,000.00 (pre-auth) → Additional NPR 615.95 charged
```

### 📈 **Business Intelligence & Analytics**

#### **Revenue Analytics Interface**

```typescript
interface TariffPerformanceMetrics {
  stationId: string;
  reportingPeriod: DateRange;

  // Volume metrics
  totalChargingSessions: number;
  totalEnergyDispensed: number; // kWh
  totalChargingMinutes: number;
  uniqueCustomers: number;

  // Revenue breakdown by component
  energyRevenue: number; // kWh-based income
  timeBasedRevenue: number; // Occupancy fees
  sessionFeeRevenue: number; // Connection fees
  paymentProcessingRevenue: number; // Transaction fees
  taxesCollected: number; // Government remittance
  netRevenue: number; // After taxes and fees

  // Performance indicators
  averageSessionValue: number; // NPR per session
  revenuePerKwh: number; // Effective rate per kWh
  stationUtilizationRate: number; // % of time occupied
  customerRetentionRate: number; // Repeat customer %

  // Comparison metrics
  monthOverMonthGrowth: number; // % growth
  competitorPriceDifferential: number; // vs market rates
}
```

#### **Dynamic Pricing Engine (Future Enhancement)**

```typescript
// AI-driven pricing optimization system
class DynamicTariffOptimizer {
  async optimizeStationTariff(
    stationId: string,
    historicalData: ChargingSessionData[],
    marketConditions: MarketAnalysis,
  ): Promise<OptimizedTariff> {
    // Demand pattern analysis
    const demandPatterns = this.analyzeDemandPatterns(historicalData);
    const peakHours = demandPatterns.identifyPeakPeriods();
    const lowDemandPeriods = demandPatterns.identifyLowDemandPeriods();

    // Price elasticity calculation
    const elasticity = this.calculatePriceElasticity(historicalData);

    // Competitive analysis
    const competitorRates = await this.getCompetitorPricing(stationId);

    // Generate optimized pricing recommendations
    return {
      recommendedBaseRate: this.optimizeBaseEnergyRate(elasticity, competitorRates),
      peakHourMultiplier: this.calculateOptimalPeakMultiplier(demandPatterns),
      offPeakDiscount: this.calculateOptimalOffPeakDiscount(lowDemandPeriods),
      dynamicSessionFee: this.optimizeSessionFee(demandPatterns),
      projectedRevenueIncrease: this.calculateRevenueImpact(),
      implementationDate: this.recommendImplementationTiming(),
      confidenceScore: this.calculateOptimizationConfidence(),
    };
  }

  // Time-of-use pricing implementation
  async implementTimeBasedPricing(stationId: string): Promise<TimeBasedTariff> {
    return {
      peakHours: { start: '17:00', end: '21:00', multiplier: 1.5 }, // Evening rush
      standardHours: { start: '09:00', end: '17:00', multiplier: 1.0 }, // Business hours
      offPeakHours: { start: '21:00', end: '09:00', multiplier: 0.8 }, // Night/early morning
      weekendMultiplier: 1.2, // Weekend premium
      holidayMultiplier: 0.9, // Holiday discount
    };
  }
}
```

### 🔧 **API Integration Examples**

#### **Create Tariff via REST API**

```bash
# Standard AC charging tariff
curl -X POST "http://localhost:8080/data/tariff?tenantId=2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "stationId": "yatri-ktm-001",
    "currency": "NPR",
    "pricePerKwh": 15.00,
    "pricePerMin": 1.00,
    "pricePerSession": 25.00,
    "authorizationAmount": 500.00,
    "paymentFee": 10.00,
    "taxRate": 0.13
  }'
```

#### **Retrieve Tariff Information**

```bash
# Get tariff for specific station
curl -X GET "http://localhost:8080/data/tariff/byStationId/yatri-ktm-001?tenantId=2" \
  -H "Authorization: Bearer ${JWT_TOKEN}"

# Response:
{
  "id": 1,
  "stationId": "yatri-ktm-001",
  "currency": "NPR",
  "pricePerKwh": 15.00,
  "pricePerMin": 1.00,
  "pricePerSession": 25.00,
  "authorizationAmount": 500.00,
  "paymentFee": 10.00,
  "taxRate": 0.13,
  "createdAt": "2025-08-22T10:30:00.000Z",
  "updatedAt": "2025-08-22T10:30:00.000Z"
}
```

#### **Update Tariff (Bulk Operation)**

```bash
# Update multiple tariffs for seasonal pricing
curl -X PUT "http://localhost:8080/data/tariff/bulk?tenantId=2" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${JWT_TOKEN}" \
  -d '{
    "updates": [
      {
        "stationId": "yatri-ktm-001",
        "pricePerKwh": 16.50,
        "reason": "Winter demand adjustment"
      },
      {
        "stationId": "yatri-ktm-002",
        "pricePerKwh": 27.50,
        "reason": "Premium service enhancement"
      }
    ]
  }'
```

### 🎯 **Implementation Best Practices for Yatri**

#### **Financial Accuracy Standards**

1. **Always use Money class** for calculations to avoid floating-point errors
2. **Round to currency scale** before final amount determination
3. **Store all amounts as DECIMAL** in database, never FLOAT
4. **Implement proper tax calculation** following Nepal's VAT regulations
5. **Maintain audit trail** for all pricing changes and calculations

#### **Business Intelligence Integration**

1. **Real-time revenue tracking** for each station and tariff tier
2. **Automated pricing recommendations** based on demand patterns
3. **Competitive analysis integration** for market positioning
4. **Customer behavior analytics** for pricing optimization
5. **Regulatory compliance reporting** for tax authorities

#### **Scalability Considerations**

1. **Station-specific tariff flexibility** for different locations/types
2. **Time-based pricing capability** for peak/off-peak optimization
3. **Bulk tariff management** for network-wide updates
4. **A/B testing framework** for pricing experiments
5. **Multi-currency support** for future international expansion

This comprehensive billing and tariff system provides Yatri Motorcycles with enterprise-grade financial management capabilities, ensuring accurate revenue capture, regulatory compliance, and business intelligence for optimal pricing strategies across Nepal's EV charging network.

---

## 🎯 Next Session Preparation

### Immediate Action Items

1. **Test offline transaction flow** with EVerest simulator
2. **Implement wallet authorization service** interface
3. **Configure Local Authorization List** management APIs
4. **Set up monitoring dashboards** for offline operations

### Advanced Topics to Explore

1. **OCPI integration** for roaming customers
2. **Multi-tenant isolation** for franchise operators
3. **Load balancing** across charging station networks
4. **Energy management** and grid integration

### Code Files to Review Next Session

```bash
# Key files for continued development
/citrineos-core/03_Modules/Transactions/src/module/CostCalculator.ts
/citrineos-core/03_Modules/Transactions/src/module/CostNotifier.ts
/citrineos-core/03_Modules/EVDriver/src/module/module.ts
/citrineos-core/01_Data/src/layers/sequelize/model/Authorization/
/citrineos-core/01_Data/src/layers/sequelize/model/Tariff/
```

---

## 📚 Technical References

### OCPP Documentation

- **OCPP 2.0.1 Specification**: Local Authorization Lists (Section 4.15)
- **OCPP 2.0.1 Specification**: Offline Behavior (Section 3.2.4)
- **OCPP 1.6 Specification**: Authorization Cache (Section 4.2)

### CitrineOS Architecture

- **Module System**: `/citrineos-core/03_Modules/`
- **Data Layer**: `/citrineos-core/01_Data/`
- **Base Types**: `/citrineos-core/00_Base/`
- **Utilities**: `/citrineos-core/02_Util/`

### Business Logic Patterns

- **Transaction Lifecycle**: Start → Update → End
- **Authorization Flow**: Local List → CSMS Validation → Response
- **Cost Calculation**: Energy × Rate + Fees + Tax
- **Wallet Integration**: Authorization → Settlement → Reconciliation

---

_This document represents advanced technical concepts for CitrineOS implementation at Yatri Motorcycles. Continue development with confidence in offline operations, local authorization, and wallet integration patterns._

**Session Context Preserved**: This documentation ensures continuity for future development sessions and serves as a comprehensive reference for sophisticated OCPP protocol implementations.
