# CitrineOS Implementation Status

**Last Updated**: January 8, 2026
**Purpose**: Single source of truth for what's implemented vs planned
**For Claude**: Check this before suggesting implementations

---

## Status Legend

| Symbol | Status               | Meaning                                           |
| ------ | -------------------- | ------------------------------------------------- |
| ✅     | **Production Ready** | Tested with real hardware, deployed to production |
| 🔄     | **In Development**   | Code exists, needs testing or refinement          |
| 📋     | **Planned**          | Documented but not implemented                    |
| ❌     | **Not Supported**    | Won't be implemented or not applicable            |

---

## Core CSMS Features

### OCPP Protocol Support

| Feature              | OCPP 1.6     | OCPP 2.0.1          | Notes           |
| -------------------- | ------------ | ------------------- | --------------- |
| WebSocket Connection | ✅ Port 8092 | ✅ Port 8081        | Both active     |
| BootNotification     | ✅           | ✅                  |                 |
| Heartbeat            | ✅           | ✅                  |                 |
| StatusNotification   | ✅           | ✅                  |                 |
| Authorize            | ✅           | ✅                  |                 |
| StartTransaction     | ✅           | ✅ TransactionEvent |                 |
| StopTransaction      | ✅           | ✅ TransactionEvent |                 |
| MeterValues          | ✅           | ✅                  |                 |
| RemoteStart          | ✅           | ✅ RequestStart     |                 |
| RemoteStop           | ✅           | ✅ RequestStop      |                 |
| GetConfiguration     | ✅           | ✅ GetVariables     |                 |
| ChangeConfiguration  | ✅           | ✅ SetVariables     |                 |
| SendLocalList        | ✅           | ✅                  | Batch supported |
| GetLocalListVersion  | ✅           | ✅                  |                 |

### Security Profiles

| Profile                | OCPP 1.6 | OCPP 2.0.1 | Notes            |
| ---------------------- | -------- | ---------- | ---------------- |
| Profile 0 (No Auth)    | ✅       | ✅         | Development only |
| Profile 1 (Basic Auth) | ✅       | ✅         | Production ready |
| Profile 2 (TLS)        | 📋       | 📋         | Not implemented  |
| Profile 3 (mTLS)       | 📋       | 📋         | Not implemented  |

### Transaction Management

| Feature               | Status | Notes                             |
| --------------------- | ------ | --------------------------------- |
| Transaction Creation  | ✅     | StartTransaction/TransactionEvent |
| Transaction Tracking  | ✅     | Real-time status                  |
| Meter Value Recording | ✅     | Wh precision                      |
| Cost Calculation      | ✅     | High-precision Money class        |
| Offline Transactions  | ✅     | OCPP 1.6 via transactionData[]    |
| Transaction History   | ✅     | GraphQL queries                   |

### Authorization System

| Feature                  | Status | Notes                                    |
| ------------------------ | ------ | ---------------------------------------- |
| 3-Table Auth Model       | ✅     | IdTokens → IdTokenInfos → Authorizations |
| RFID Card Support        | ✅     | ISO14443 tested                          |
| Mobile App Tokens        | ✅     | KeyCode type                             |
| Local Authorization List | ✅     | Full + Differential updates              |
| Concurrent Transactions  | ✅     | Configurable per token                   |
| Token Expiry             | ✅     | cacheExpiryDateTime                      |

### Billing System

| Feature              | Status | Notes               |
| -------------------- | ------ | ------------------- |
| Tariff Configuration | ✅     | Per-station tariffs |
| Energy-based Pricing | ✅     | NPR per kWh         |
| Time-based Pricing   | ✅     | NPR per minute      |
| Session Fees         | ✅     | Flat connection fee |
| VAT Calculation      | ✅     | 13% Nepal VAT       |
| High-Precision Math  | ✅     | Big.js Money class  |

### Multi-Tenant Architecture

| Feature                        | Status | Notes                                      |
| ------------------------------ | ------ | ------------------------------------------ |
| Tenant Model                   | ✅     | `Tenants` table with OCPI fields           |
| Default Tenant                 | ✅     | ID: 1, created by migration                |
| **Explicit tenantId Required** | ✅     | **Enforced Jan 2026** - no auto-assignment |
| Tenant-aware Models            | ✅     | 42+ models extend `BaseModelWithTenant`    |
| Per-tenant WebSocket Servers   | ✅     | Each server assigned to specific tenant    |
| TenantPartner (OCPI Roaming)   | ✅     | For eMSP roaming partners                  |
| Tenant Isolation Validation    | 📋     | Needs testing                              |
| Multi-tenant Dashboard         | 📋     | Planned for yatri-energy-dash-frontend     |

#### Multi-Tenant Enforcement Details

**File Modified**: `01_Data/src/layers/sequelize/model/BaseModelWithTenant.ts`

**Behavior Change** (January 2026):

- ❌ **Before**: Missing `tenantId` → Auto-assigned to `DEFAULT_TENANT_ID` (1)
- ✅ **After**: Missing `tenantId` → **Error thrown**, operation rejected

**Error Message**:

```
tenantId is required and must be explicitly provided.
Model: [ModelName].
Operation rejected to prevent data being assigned to wrong tenant.
```

**Impact**: All create/update operations on tenant-aware models require explicit `tenantId` in:

- REST API calls (`?tenantId=1`)
- GraphQL mutations (`tenantId: 1`)
- Direct repository calls

---

## Hardware Integration

### Tested Hardware

| Hardware        | Protocol   | Status                | Last Tested |
| --------------- | ---------- | --------------------- | ----------- |
| IoCharger AC    | OCPP 1.6   | ✅ Production         | Sept 2025   |
| IoCharger AC    | OCPP 2.0.1 | ✅ Tested             | Sept 2025   |
| Tonhe Chargers  | OCPP 1.6   | 🔄 Connected, limited | Sept 2025   |
| Exicom Chargers | OCPP 1.6   | 🔄 Connected, limited | Sept 2025   |

### IoCharger Features Tested

| Feature          | OCPP 1.6        | OCPP 2.0.1 |
| ---------------- | --------------- | ---------- |
| BootNotification | ✅              | ✅         |
| Heartbeat        | ✅ 60s interval | ✅         |
| Physical RFID    | ✅ D6A3FA03     | ✅         |
| Remote Start     | ✅              | ✅         |
| Remote Stop      | ✅              | ✅         |
| MeterValues      | ✅              | ✅         |
| Local Auth List  | ✅              | ✅         |

---

## Yatri Integration

### Wallet Integration

| Feature                 | Status | File Location                            |
| ----------------------- | ------ | ---------------------------------------- |
| YatriEnergyClient       | 🔄     | `02_Util/src/yatri/YatriEnergyClient.ts` |
| Minimum Balance Check   | 🔄     | TransactionService.ts:224-229            |
| Remote Start Validation | 🔄     | MessageApi.ts:47-67                      |
| Payment Settlement      | 🔄     | module.ts:734-735                        |
| Configuration Schema    | 🔄     | types.ts (yatriEnergy section)           |

**Integration Status**:

- Code structure defined
- Configuration schema added
- HTTP client patterns documented
- **Needs**: End-to-end testing with Yatri Energy backend

### Local Auth List Sync

| Feature                  | Status | Notes                       |
| ------------------------ | ------ | --------------------------- |
| Batch SendLocalList      | ✅     | CitrineOS native            |
| LocalAuthListSyncService | 📋     | Documented, not implemented |
| Wallet Balance Triggers  | 📋     | Documented pattern          |
| Cron Job Sync            | 📋     | Documented pattern          |
| New Charger Sync         | 📋     | Documented pattern          |

**Implementation Location**: yatri-energy-backend (not CitrineOS)

---

## API Endpoints

### OCPP 1.6 APIs - Tested

| Endpoint                                           | Status | Last Tested |
| -------------------------------------------------- | ------ | ----------- |
| `POST /ocpp/1.6/evdriver/remoteStartTransaction`   | ✅     | Sept 2025   |
| `POST /ocpp/1.6/evdriver/remoteStopTransaction`    | ✅     | Sept 2025   |
| `POST /ocpp/1.6/configuration/getConfiguration`    | ✅     | Sept 2025   |
| `POST /ocpp/1.6/configuration/changeConfiguration` | ✅     | Sept 2025   |
| `POST /ocpp/1.6/evdriver/sendLocalList`            | ✅     | Sept 2025   |
| `POST /ocpp/1.6/evdriver/getLocalListVersion`      | ✅     | Sept 2025   |

### OCPP 2.0.1 APIs - Tested

| Endpoint                                            | Status | Last Tested |
| --------------------------------------------------- | ------ | ----------- |
| `POST /ocpp/2.0.1/evdriver/requestStartTransaction` | ✅     | Sept 2025   |
| `POST /ocpp/2.0.1/evdriver/requestStopTransaction`  | ✅     | Sept 2025   |
| `POST /ocpp/2.0.1/configuration/getVariables`       | ✅     | Sept 2025   |
| `POST /ocpp/2.0.1/configuration/setVariables`       | ✅     | Sept 2025   |

### Data APIs

| Endpoint                               | Status | Notes                |
| -------------------------------------- | ------ | -------------------- |
| `GET /data/configuration/systemConfig` | ✅     | Read config          |
| `PUT /data/configuration/systemConfig` | ✅     | Update config        |
| `POST /data/ocpprouter/subscription`   | ✅     | Webhook subscription |
| GraphQL (Hasura)                       | ✅     | Port 8090            |

---

## Production Deployment

### AWS Infrastructure

| Component         | Status | Details              |
| ----------------- | ------ | -------------------- |
| EC2 Instance      | ✅     | 13.204.177.82        |
| Docker Compose    | ✅     | All services running |
| OCPP 1.6 (8092)   | ✅     | Security Profile 1   |
| OCPP 2.0.1 (8081) | ✅     | Security Profile 1   |
| API (8080)        | ✅     | Swagger UI available |
| PostgreSQL        | ✅     | citrine database     |
| RabbitMQ          | ✅     | Message broker       |

### Connected Stations (Production)

| Station ID         | Protocol | Security  | Status    |
| ------------------ | -------- | --------- | --------- |
| yatri-1-ioc-1-sec1 | OCPP 1.6 | Profile 1 | ✅ Active |

---

## Documentation Status

| Document                               | Status | Last Updated |
| -------------------------------------- | ------ | ------------ |
| CLAUDE.md                              | ✅     | Dec 2025     |
| INDEX.md                               | ✅     | Dec 2025     |
| GLOSSARY.md                            | ✅     | Dec 2025     |
| STATUS.md                              | ✅     | Dec 2025     |
| OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md | ✅     | Dec 2025     |
| YATRI_WALLET_INTEGRATION.md            | ✅     | Dec 2025     |
| GOING_TO_PRODUCTION_V2.md              | ✅     | Sept 2025    |
| REAL_HARDWARE_INTEGRATION_OCPP_1.6.md  | ✅     | Sept 2025    |
| API_REFERENCE.md                       | ⚠️     | Needs update |

---

## Upcoming Work

### Priority 1: Wallet Integration Testing

- [ ] Test YatriEnergyClient with real backend
- [ ] Validate minimum balance check flow
- [ ] Test payment settlement flow
- [ ] Handle error scenarios

### Priority 2: LocalAuthListSyncService

- [ ] Implement in yatri-energy-backend
- [ ] Add wallet balance triggers
- [ ] Set up hourly cron sync
- [ ] Test with multiple chargers

### Priority 3: Security Profile 2

- [ ] Configure TLS certificates
- [ ] Test WSS connections
- [ ] Update charger firmware
- [ ] Document setup process

### Priority 4: Multi-CPO Support

- [x] **Enforce explicit tenantId** (Jan 2026) ✅
- [ ] Test tenant isolation
- [ ] Implement tenant switching
- [ ] Configure per-tenant billing
- [ ] Test cross-tenant security

---

## Known Issues

| Issue                     | Severity | Workaround             |
| ------------------------- | -------- | ---------------------- |
| Tonhe remote start fails  | Medium   | Use physical RFID      |
| Exicom remote start fails | Medium   | Use physical RFID      |
| No TLS support yet        | Low      | Use VPN for production |

---

## Version Information

| Component  | Version | Notes        |
| ---------- | ------- | ------------ |
| CitrineOS  | Latest  | Custom fork  |
| Node.js    | 22.18.0 | Required     |
| Docker     | 27.4.0  |              |
| PostgreSQL | 15      | In container |
| RabbitMQ   | 3.x     | In container |

---

**For Claude**: When implementing features, check this file first to:

1. Know what's already working (don't re-implement)
2. Know what's planned (follow documented patterns)
3. Know what's not supported (don't suggest)
4. Find correct file locations for modifications
