# OCPP Version Compatibility Guide

_Critical Reference for Yatri Motorcycles CSMS Implementation_  
_Session Date: August 22, 2025_

## 🚨 **Important Notice**

**CitrineOS supports both OCPP 1.6 and 2.0.1**, but feature availability varies significantly between versions. This guide ensures proper implementation planning based on actual protocol capabilities.

---

## 📊 **Feature Compatibility Matrix**

### 🟢 **Available in Both OCPP 1.6 and 2.0.1**

| Feature                       | OCPP 1.6 Implementation                          | OCPP 2.0.1 Implementation                          | Notes                              |
| ----------------------------- | ------------------------------------------------ | -------------------------------------------------- | ---------------------------------- |
| **Basic Charging Operations** | ✅ StartTransaction, StopTransaction             | ✅ TransactionEvent (Started/Ended)                | Core functionality                 |
| **Remote Start/Stop**         | ✅ RemoteStartTransaction, RemoteStopTransaction | ✅ RequestStartTransaction, RequestStopTransaction | Essential remote control           |
| **Authorization**             | ✅ Authorize request                             | ✅ TransactionEvent with idToken                   | Token validation                   |
| **Local Authorization List**  | ✅ SendLocalList                                 | ✅ SendLocalAuthorizationList                      | **Different data structures**      |
| **Status Notifications**      | ✅ StatusNotification                            | ✅ StatusNotification                              | Station status updates             |
| **Heartbeat**                 | ✅ Heartbeat                                     | ✅ Heartbeat                                       | Connection monitoring              |
| **Boot Notification**         | ✅ BootNotification                              | ✅ BootNotification                                | Station registration               |
| **Basic Configuration**       | ✅ ChangeConfiguration, GetConfiguration         | ✅ SetVariables, GetVariables                      | **Completely different APIs**      |
| **Basic Billing**             | ✅ Manual cost calculation                       | ✅ Manual cost calculation                         | Both require custom implementation |

### 🟡 **OCPP 2.0.1 Enhanced Features**

| Feature                          | OCPP 1.6                   | OCPP 2.0.1                                        | Impact for Yatri                     |
| -------------------------------- | -------------------------- | ------------------------------------------------- | ------------------------------------ |
| **Offline Transaction Handling** | ❌ Limited support         | ✅ Full offline flag support                      | **Critical for network reliability** |
| **Transaction Events**           | ❌ Start/Stop only         | ✅ Started/Updated/Ended events                   | **Enhanced transaction tracking**    |
| **Advanced ID Token Types**      | ❌ Basic idTag string      | ✅ Multiple token types (ISO14443, KeyCode, etc.) | **Modern authentication support**    |
| **Charging Profiles v2**         | ⚠️ Basic smart charging    | ✅ Advanced composite schedules                   | **Grid integration capabilities**    |
| **Device Model**                 | ❌ Simple key-value config | ✅ Structured device model                        | **Advanced station management**      |
| **Security Extensions**          | ❌ Basic security          | ✅ Certificate management, signed meter values    | **Enterprise security**              |
| **Detailed Cost Information**    | ❌ Manual calculation      | ✅ CostUpdated messages                           | **Real-time cost notifications**     |
| **Multi-Language Support**       | ❌ Not supported           | ✅ language1, language2 fields                    | **Localization for Nepal**           |

### 🔴 **OCPP 2.0.1 Exclusive Features**

| Feature                           | Availability | Business Impact                                 |
| --------------------------------- | ------------ | ----------------------------------------------- |
| **Real-time Cost Updates**        | 2.0.1 only   | Cannot push live pricing to 1.6 stations        |
| **Advanced Offline Capabilities** | 2.0.1 only   | 1.6 stations have limited offline functionality |
| **Structured Authorization Data** | 2.0.1 only   | 1.6 uses simple string-based idTag              |
| **Certificate Management**        | 2.0.1 only   | Advanced security not available for 1.6         |
| **Composite Charging Schedules**  | 2.0.1 only   | Advanced smart charging limited to 2.0.1        |

---

## 🔧 **Implementation Strategy for Mixed Environment**

### **Yatri's Dual-Protocol Approach**

#### **Station Categorization**

```typescript
interface StationProtocolConfig {
  stationId: string;
  ocppVersion: '1.6' | '2.0.1';
  capabilities: StationCapabilities;
  limitations: string[];
}

// Example configuration for Yatri network
const yatriStations: StationProtocolConfig[] = [
  {
    stationId: 'yatri-ktm-001',
    ocppVersion: '2.0.1',
    capabilities: {
      offlineTransactions: true,
      realTimeCostUpdates: true,
      advancedAuthorization: true,
      multiLanguageSupport: true,
    },
    limitations: [],
  },
  {
    stationId: 'yatri-legacy-001',
    ocppVersion: '1.6',
    capabilities: {
      basicCharging: true,
      simpleAuthorization: true,
      localAuthList: true,
    },
    limitations: [
      'No offline transaction handling',
      'No real-time cost updates',
      'Basic authorization only',
      'Manual cost calculation required',
    ],
  },
];
```

### **Feature Implementation Patterns**

#### **1. Local Authorization Lists**

**OCPP 1.6 Implementation:**

```typescript
// 1.6 uses simpler data structure
interface OCPP16LocalAuthList {
  listVersion: number;
  updateType: 'Differential' | 'Full';
  localAuthorizationList?: {
    idTag: string; // Simple string ID
    idTagInfo?: {
      status: 'Accepted' | 'Blocked' | 'Expired' | 'Invalid';
      expiryDate?: string;
      parentIdTag?: string;
    };
  }[];
}

// CitrineOS API call for 1.6 stations
async function sendLocalListOCPP16(stationId: string): Promise<void> {
  await this._module.sendCall(
    stationId,
    tenantId,
    OCPPVersion.OCPP1_6,
    OCPP1_6_CallAction.SendLocalList,
    {
      listVersion: 1,
      updateType: 'Full',
      localAuthorizationList: [
        {
          idTag: 'RFID123456789',
          idTagInfo: {
            status: 'Accepted',
            expiryDate: '2025-12-31T23:59:59.000Z',
          },
        },
      ],
    },
  );
}
```

**OCPP 2.0.1 Implementation:**

```typescript
// 2.0.1 uses richer data structure
interface OCPP201LocalAuthList {
  versionNumber: number;
  updateType: 'Differential' | 'Full';
  localAuthorizationList?: {
    idToken: {
      idToken: string;
      type:
        | 'Central'
        | 'eMAID'
        | 'ISO14443'
        | 'ISO15693'
        | 'KeyCode'
        | 'Local'
        | 'MacAddress'
        | 'NoAuthorization';
      additionalInfo?: {
        additionalIdToken: string;
        type: string;
      }[];
    };
    idTokenInfo?: {
      status:
        | 'Accepted'
        | 'Blocked'
        | 'ConcurrentTx'
        | 'Expired'
        | 'Invalid'
        | 'NoCredit'
        | 'NotAllowedTypeEVSE'
        | 'NotAtThisLocation'
        | 'NotAtThisTime'
        | 'Unknown';
      cacheExpiryDateTime?: string;
      chargingPriority?: number;
      language1?: string;
      language2?: string;
      groupIdToken?: IdTokenType;
      personalMessage?: {
        format: 'ASCII' | 'HTML' | 'URI' | 'UTF8';
        language?: string;
        content: string;
      };
    };
  }[];
}

// CitrineOS API call for 2.0.1 stations
async function sendLocalListOCPP201(stationId: string): Promise<void> {
  await this._module.sendCall(
    stationId,
    tenantId,
    OCPPVersion.OCPP2_0_1,
    OCPP2_0_1_CallAction.SendLocalAuthorizationList,
    {
      versionNumber: 1,
      updateType: 'FullUpdate',
      localAuthorizationList: [
        {
          idToken: {
            idToken: 'RFID123456789',
            type: 'ISO14443',
          },
          idTokenInfo: {
            status: 'Accepted',
            cacheExpiryDateTime: '2025-12-31T23:59:59.000Z',
            chargingPriority: 5,
            language1: 'ne',
            personalMessage: {
              format: 'UTF8',
              language: 'ne',
              content: 'स्वागतम्! Welcome to Yatri Charging',
            },
          },
        },
      ],
    },
  );
}
```

#### **2. Transaction Handling**

**OCPP 1.6 Transaction Flow:**

```typescript
// 1.6 uses separate start/stop transactions
class OCPP16TransactionHandler {
  async handleStartTransaction(
    request: OCPP1_6.StartTransactionRequest,
  ): Promise<OCPP1_6.StartTransactionResponse> {
    // Simple start transaction - no offline support
    const authorization = await this.authorizeIdToken(request.idTag);

    return {
      idTagInfo: {
        status: authorization.status,
        expiryDate: authorization.expiryDate,
        parentIdTag: authorization.parentIdTag,
      },
      transactionId: this.generateTransactionId(), // Simple integer ID
    };
  }

  async handleStopTransaction(
    request: OCPP1_6.StopTransactionRequest,
  ): Promise<OCPP1_6.StopTransactionResponse> {
    // Process meter values and calculate cost manually
    const finalCost = await this.calculateCost(
      request.transactionId,
      request.meterStop,
      request.timestamp,
    );

    // No built-in cost update mechanism - must handle externally
    await this.notifyCustomerOfCost(request.idTag, finalCost);

    return {
      idTagInfo: {
        status: 'Accepted',
      },
    };
  }
}
```

**OCPP 2.0.1 Transaction Flow:**

```typescript
// 2.0.1 uses unified transaction events with offline support
class OCPP201TransactionHandler {
  async handleTransactionEvent(
    request: OCPP2_0_1.TransactionEventRequest,
  ): Promise<OCPP2_0_1.TransactionEventResponse> {
    // Check if this is an offline transaction
    if (request.offline) {
      this._logger.info(
        `Processing offline transaction event: ${request.eventType} at ${request.timestamp}`,
      );

      // Handle offline transaction with original timestamp
      return await this.processOfflineTransactionEvent(request);
    }

    // Handle real-time transaction events
    switch (request.eventType) {
      case 'Started':
        return await this.handleTransactionStarted(request);
      case 'Updated':
        // Real-time cost updates available
        await this.sendCostUpdate(request);
        return await this.handleTransactionUpdated(request);
      case 'Ended':
        return await this.handleTransactionEnded(request);
    }
  }

  async sendCostUpdate(request: OCPP2_0_1.TransactionEventRequest): Promise<void> {
    const currentCost = await this.calculateRealTimeCost(
      request.transactionInfo.transactionId,
      request.meterValue,
    );

    // OCPP 2.0.1 supports real-time cost notifications
    await this._module.sendCall(
      request.stationId,
      tenantId,
      OCPPVersion.OCPP2_0_1,
      OCPP2_0_1_CallAction.CostUpdated,
      {
        totalCost: currentCost,
        transactionId: request.transactionInfo.transactionId,
      },
    );
  }
}
```

#### **3. Configuration Management**

**OCPP 1.6 Configuration:**

```typescript
// 1.6 uses simple key-value configuration
async function configureOCPP16Station(stationId: string): Promise<void> {
  // Simple key-value pairs
  const configs = [
    { key: 'AuthorizeRemoteTxRequests', value: 'true' },
    { key: 'LocalAuthorizeOffline', value: 'true' },
    { key: 'HeartbeatInterval', value: '30' },
    { key: 'MeterValueSampleInterval', value: '60' },
  ];

  for (const config of configs) {
    await this._module.sendCall(
      stationId,
      tenantId,
      OCPPVersion.OCPP1_6,
      OCPP1_6_CallAction.ChangeConfiguration,
      {
        key: config.key,
        value: config.value,
      },
    );
  }
}
```

**OCPP 2.0.1 Configuration:**

```typescript
// 2.0.1 uses structured device model
async function configureOCPP201Station(stationId: string): Promise<void> {
  // Structured variable configuration
  await this._module.sendCall(
    stationId,
    tenantId,
    OCPPVersion.OCPP2_0_1,
    OCPP2_0_1_CallAction.SetVariables,
    {
      setVariableData: [
        {
          component: { name: 'AuthCacheCtrlr' },
          variable: { name: 'Enabled' },
          attributeValue: 'true',
        },
        {
          component: { name: 'AuthCacheCtrlr' },
          variable: { name: 'LifeTime' },
          attributeValue: '86400',
        },
        {
          component: { name: 'TxCtrlr' },
          variable: { name: 'TxStartPoint' },
          attributeValue: 'PowerPathClosed',
        },
      ],
    },
  );
}
```

---

## 🎯 **Yatri Implementation Recommendations**

### **Protocol-Specific Service Architecture**

```typescript
// Multi-protocol service pattern
abstract class YatriChargingService {
  abstract sendLocalAuthList(stationId: string, authList: AuthorizationData[]): Promise<void>;
  abstract handleTransaction(request: any): Promise<any>;
  abstract calculateCost(transactionData: any): Promise<number>;
  abstract sendCostUpdate(stationId: string, transactionId: string, cost: number): Promise<void>;
}

class YatriOCPP16Service extends YatriChargingService {
  async sendLocalAuthList(stationId: string, authList: AuthorizationData[]): Promise<void> {
    // Convert to 1.6 format
    const ocpp16List = authList.map((auth) => ({
      idTag: auth.idToken.idToken,
      idTagInfo: {
        status: this.mapStatusTo16(auth.idTokenInfo?.status),
        expiryDate: auth.idTokenInfo?.cacheExpiryDateTime,
        parentIdTag: auth.idTokenInfo?.groupIdToken?.idToken,
      },
    }));

    // Send via 1.6 API
    await this.sendOCPP16LocalList(stationId, ocpp16List);
  }

  async sendCostUpdate(stationId: string, transactionId: string, cost: number): Promise<void> {
    // 1.6 doesn't support CostUpdated - use alternative notification
    this._logger.warn(`OCPP 1.6 station ${stationId} cannot receive real-time cost updates`);

    // Alternative: Store cost for end-of-transaction notification
    await this.storePendingCost(stationId, transactionId, cost);
  }
}

class YatriOCPP201Service extends YatriChargingService {
  async sendLocalAuthList(stationId: string, authList: AuthorizationData[]): Promise<void> {
    // Use rich 2.0.1 format directly
    await this._module.sendCall(
      stationId,
      tenantId,
      OCPPVersion.OCPP2_0_1,
      OCPP2_0_1_CallAction.SendLocalAuthorizationList,
      {
        versionNumber: await this.getNextVersion(stationId),
        updateType: 'FullUpdate',
        localAuthorizationList: authList,
      },
    );
  }

  async sendCostUpdate(stationId: string, transactionId: string, cost: number): Promise<void> {
    // Full 2.0.1 cost update support
    await this._module.sendCall(
      stationId,
      tenantId,
      OCPPVersion.OCPP2_0_1,
      OCPP2_0_1_CallAction.CostUpdated,
      {
        totalCost: cost,
        transactionId: transactionId,
      },
    );
  }
}
```

### **Protocol Detection and Routing**

```typescript
class YatriProtocolManager {
  private ocpp16Service: YatriOCPP16Service;
  private ocpp201Service: YatriOCPP201Service;

  async getServiceForStation(stationId: string): Promise<YatriChargingService> {
    const stationInfo = await this._locationRepository.readByKey(tenantId, stationId);

    switch (stationInfo?.ocppVersion) {
      case '1.6':
        return this.ocpp16Service;
      case '2.0.1':
        return this.ocpp201Service;
      default:
        throw new Error(`Unknown OCPP version for station ${stationId}`);
    }
  }

  async broadcastToAllStations(operation: string, data: any): Promise<void> {
    const allStations = await this._locationRepository.readAll(tenantId);

    const results = await Promise.allSettled(
      allStations.map(async (station) => {
        const service = await this.getServiceForStation(station.id);

        try {
          switch (operation) {
            case 'sendLocalAuthList':
              await service.sendLocalAuthList(station.id, data);
              break;
            case 'sendCostUpdate':
              await service.sendCostUpdate(station.id, data.transactionId, data.cost);
              break;
            default:
              this._logger.warn(`Unknown operation: ${operation}`);
          }
        } catch (error) {
          this._logger.error(`Failed ${operation} for ${station.id}:`, error);
        }
      }),
    );

    // Log results summary
    const successful = results.filter((r) => r.status === 'fulfilled').length;
    const failed = results.filter((r) => r.status === 'rejected').length;

    this._logger.info(`${operation} completed: ${successful} successful, ${failed} failed`);
  }
}
```

---

## 📋 **Testing Strategy for Mixed Environment**

### **Test Station Configuration**

```typescript
const yatriTestSetup = {
  ocpp16Stations: [
    {
      stationId: 'yatri-test-16-001',
      simulator: 'EVerest-1.6',
      testCapabilities: ['BasicCharging', 'RemoteStart', 'LocalAuthList', 'StatusNotification'],
      limitations: ['NoOfflineTransactions', 'NoRealTimeCosts', 'BasicAuthorizationOnly'],
    },
  ],

  ocpp201Stations: [
    {
      stationId: 'yatri-test-201-001',
      simulator: 'EVerest-2.0.1',
      testCapabilities: [
        'AdvancedCharging',
        'TransactionEvents',
        'OfflineOperations',
        'RealTimeCosts',
        'AdvancedAuthorization',
        'MultiLanguageSupport',
      ],
      limitations: [],
    },
  ],
};
```

### **Protocol-Specific Test Scenarios**

```typescript
describe('OCPP Version Compatibility Tests', () => {
  describe('Local Authorization Lists', () => {
    it('should handle 1.6 simple idTag format', async () => {
      const auth16 = {
        idTag: 'RFID123456789',
        idTagInfo: {
          status: 'Accepted',
          expiryDate: '2025-12-31T23:59:59.000Z',
        },
      };

      await yatriOCPP16Service.sendLocalAuthList('yatri-test-16-001', [auth16]);
      // Verify 1.6 station receives simple format
    });

    it('should handle 2.0.1 rich authorization format', async () => {
      const auth201 = {
        idToken: {
          idToken: 'RFID123456789',
          type: 'ISO14443',
        },
        idTokenInfo: {
          status: 'Accepted',
          cacheExpiryDateTime: '2025-12-31T23:59:59.000Z',
          chargingPriority: 5,
          language1: 'ne',
          personalMessage: {
            format: 'UTF8',
            language: 'ne',
            content: 'स्वागतम्!',
          },
        },
      };

      await yatriOCPP201Service.sendLocalAuthList('yatri-test-201-001', [auth201]);
      // Verify 2.0.1 station receives rich format
    });
  });

  describe('Cost Updates', () => {
    it('should handle 1.6 limitation gracefully', async () => {
      // 1.6 cannot receive real-time cost updates
      const result = await yatriOCPP16Service.sendCostUpdate('yatri-test-16-001', 'TXN_001', 150.5);

      expect(result.limitation).toBe('RealTimeCostUpdatesNotSupported');
    });

    it('should send real-time cost updates to 2.0.1', async () => {
      const result = await yatriOCPP201Service.sendCostUpdate(
        'yatri-test-201-001',
        'TXN_001',
        150.5,
      );

      expect(result.success).toBe(true);
    });
  });
});
```

---

## 🚨 **Critical Implementation Notes**

### **1. Offline Transaction Handling**

- **OCPP 1.6**: Limited offline capability - transactions may be lost during network outages
- **OCPP 2.0.1**: Full offline support with sequence tracking and data integrity
- **Yatri Impact**: Revenue protection requires 2.0.1 stations for critical locations

### **2. Real-Time Cost Notifications**

- **OCPP 1.6**: No built-in support - requires alternative notification mechanisms
- **OCPP 2.0.1**: Native CostUpdated message support
- **Yatri Impact**: Customer experience varies based on station OCPP version

### **3. Authorization Complexity**

- **OCPP 1.6**: Simple string-based idTag
- **OCPP 2.0.1**: Rich token types with metadata
- **Yatri Impact**: Mobile app integration limited on 1.6 stations

### **4. Multi-Language Support**

- **OCPP 1.6**: Not supported
- **OCPP 2.0.1**: Native Nepali language support
- **Yatri Impact**: Localization only available on 2.0.1 stations

---

## 📈 **Migration Strategy**

### **Phase 1: Dual Support Implementation** _(Current)_

- Implement both protocol versions simultaneously
- Feature parity where possible, graceful degradation where not
- Document limitations clearly for business stakeholders

### **Phase 2: Advanced Feature Rollout** _(Next 6 months)_

- Deploy 2.0.1 features to compatible stations
- Maintain 1.6 support for legacy equipment
- Monitor feature adoption and business impact

### **Phase 3: Gradual Migration** _(12-18 months)_

- Upgrade critical stations to 2.0.1 equipment
- Retire 1.6 support as fleet modernizes
- Focus innovation on 2.0.1 exclusive features

---

This compatibility guide ensures Yatri can deploy both OCPP versions successfully while understanding the trade-offs and limitations of each approach. Test thoroughly with both protocol versions before production deployment.
