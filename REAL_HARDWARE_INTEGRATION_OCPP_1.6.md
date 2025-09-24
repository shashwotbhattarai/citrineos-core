# Real Hardware Integration - OCPP 1.6 Charging Station

**Session Date**: September 8, 2025  
**Objective**: Connect and configure real OCPP 1.6 charging station with CitrineOS CSMS  
**Status**: 🔄 In Progress

## 🎯 Session Overview

This session focuses on integrating a physical OCPP 1.6 charging station with the running CitrineOS CSMS, building on the successful OCPP 2.0.1 integration. We'll explore the differences, limitations, and specific configuration requirements for OCPP 1.6 hardware integration.

## 📋 Prerequisites Completed

### Existing Infrastructure (From Previous Sessions)

- ✅ CitrineOS CSMS running on Docker
- ✅ Yatri Motorcycles tenant configured (ID: 3)
- ✅ Yatri Kathmandu Charging Hub location (ID: 2)
- ✅ Authorization tokens created:
  - `YATRI-WALK-001234` (ISO14443, RFID)
  - `YATRI-APP-5678` (KeyCode, Mobile App)
  - `D6A3FA03` (Physical RFID card)
- ✅ Billing system configured (NPR currency)
- ✅ Database schema with proper authorization model
- ✅ OCPP 2.0.1 IoCharger working as reference

## 🔧 OCPP 1.6 Hardware Configuration

### Charging Station Details

- **Model**: [To be determined during testing]
- **OCPP Version**: 1.6 compliant
- **Station ID**: `yatri-legacy-16-001`
- **Network**: WiFi/Ethernet connection to local network
- **Web Interface**: [To be determined]

### Network Configuration

- **Server IP**: 192.168.1.136 (main WiFi network)
- **OCPP Port**: 8081 (WebSocket)
- **Connection URL**: `ws://192.168.1.136:8081/yatri-legacy-16-001`
- **Security Profile**: 0 (No Security - for testing)

## 🚀 Implementation Steps

### 1. Database Setup

Create OCPP 1.6 charging station entry in CitrineOS database:

```sql
-- Charging Station Configuration for OCPP 1.6
Station ID: yatri-legacy-16-001
Tenant ID: 1 (Yatri Motorcycles)
OCPP Version: 1.6
Location: Yatri Kathmandu Charging Hub
Protocol Limitations: Basic features only
```

### 2. OCPP 1.6 vs 2.0.1 Key Differences

#### **Message Structure Differences**

| Feature | OCPP 1.6 | OCPP 2.0.1 |
|---------|----------|------------|
| **Transaction Start** | `StartTransaction` | `TransactionEvent(Started)` |
| **Transaction Stop** | `StopTransaction` | `TransactionEvent(Ended)` |
| **Meter Values** | `MeterValues` | `TransactionEvent(Updated)` |
| **Authorization** | `Authorize` | `TransactionEvent` with idToken |
| **Configuration** | `ChangeConfiguration` | `SetVariables` |
| **ID Token Format** | Simple `idTag` string | Rich `IdToken` object |
| **Offline Support** | Limited | Full offline flag support |
| **Real-time Costs** | ❌ Not supported | ✅ `CostUpdated` messages |

### 3. OCPP 1.6 Charger Web Configuration

#### Basic OCPP Settings

**⚠️ Critical**: Use main WiFi network IP, similar to 2.0.1 setup

```
OCPP Server URL: ws://192.168.1.136:8081/yatri-legacy-16-001
OCPP Version: 1.6 (NOT 2.0.1)
Charge Point Identity: yatri-legacy-16-001
Security Profile: 0 (No Security)
Username: [leave empty for Profile 0]
Password: [leave empty for Profile 0]
```

#### OCPP 1.6 Specific Configuration

```
HeartbeatInterval: 60 (seconds)
LocalAuthorizeOffline: true
LocalPreAuthorize: true
StopTransactionOnEVSideDisconnect: true
StopTransactionOnInvalidId: true
UnlockConnectorOnEVSideDisconnect: true
MeterValueSampleInterval: 60
ClockAlignedDataInterval: 900
MeterValuesSampledData: Energy.Active.Import.Register
StopTxnSampledData: Energy.Active.Import.Register
NumberOfConnectors: 1
```

### 4. Authorization Setup for OCPP 1.6

#### Local Authorization List Format (1.6)

**Critical Difference**: OCPP 1.6 uses simple `idTag` strings instead of rich `IdToken` objects.

```bash
# Create authorization for OCPP 1.6 station
curl -X POST "http://localhost:8080/data/authorization?tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{
    "idToken": "YATRI-WALK-001234",
    "tokenType": "ISO14443",
    "stationId": "yatri-legacy-16-001",
    "ocppVersion": "1.6",
    "idTokenInfo": {
      "status": "Accepted",
      "expiryDate": "2025-12-31T23:59:59.000Z",
      "parentIdTag": null
    },
    "limitations": [
      "No real-time cost updates",
      "Basic authorization only", 
      "Limited offline support"
    ]
  }'
```

#### Send Local List to OCPP 1.6 Station

```bash
# OCPP 1.6 Local Authorization List API
curl -X POST "http://localhost:8080/ocpp/1.6/sendLocalList" \
  -H "Content-Type: application/json" \
  -d '{
    "stationId": "yatri-legacy-16-001",
    "tenantId": 1,
    "listVersion": 1,
    "updateType": "Full",
    "localAuthorizationList": [
      {
        "idTag": "YATRI-WALK-001234",
        "idTagInfo": {
          "status": "Accepted",
          "expiryDate": "2025-12-31T23:59:59.000Z"
        }
      },
      {
        "idTag": "D6A3FA03", 
        "idTagInfo": {
          "status": "Accepted",
          "expiryDate": "2025-12-31T23:59:59.000Z"
        }
      }
    ]
  }'
```

## 🔍 Testing Procedures

### 1. Basic Connectivity Test

```bash
# Monitor CitrineOS logs for OCPP 1.6 connection
docker logs server-citrine-1 --follow | grep -i "yatri-legacy-16-001\|1.6"

# Expected log patterns:
# [INFO] Connection established for 1:yatri-legacy-16-001
# [DEBUG] OCPP 1.6 BootNotification received
# [DEBUG] Heartbeat received from yatri-legacy-16-001
```

### 2. OCPP 1.6 Transaction Testing

#### Remote Start Transaction (OCPP 1.6)

```bash
# OCPP 1.6 Remote Start API
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["yatri-legacy-16-001"],
    "request": {
      "idTag": "YATRI-WALK-001234",
      "connectorId": 1,
      "chargingProfile": {
        "chargingProfileId": 1,
        "chargingProfilePurpose": "TxProfile",
        "chargingProfileKind": "Absolute",
        "chargingSchedule": {
          "chargingRateUnit": "W",
          "chargingSchedulePeriod": [
            {
              "startPeriod": 0,
              "limit": 22000.0
            }
          ]
        }
      }
    },
    "tenantId": 1
  }'
```

#### Remote Stop Transaction (OCPP 1.6)

```bash
# OCPP 1.6 Remote Stop API
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStopTransaction" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["yatri-legacy-16-001"],
    "request": {
      "transactionId": 1
    },
    "tenantId": 1
  }'
```

### 3. Configuration Testing (OCPP 1.6)

#### Get Configuration

```bash
# Get OCPP 1.6 configuration values
curl -X POST "http://localhost:8080/ocpp/1.6/configuration/getConfiguration" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["yatri-legacy-16-001"],
    "request": {
      "key": ["HeartbeatInterval", "LocalAuthorizeOffline", "NumberOfConnectors"]
    },
    "tenantId": 1
  }'
```

#### Change Configuration

```bash
# Change OCPP 1.6 configuration
curl -X POST "http://localhost:8080/ocpp/1.6/configuration/changeConfiguration" \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": ["yatri-legacy-16-001"],
    "request": {
      "key": "HeartbeatInterval",
      "value": "30"
    },
    "tenantId": 1
  }'
```

## 🔄 OCPP 1.6 Limitations vs 2.0.1

### ❌ Features NOT Available in OCPP 1.6

1. **Real-time Cost Updates**
   - No `CostUpdated` message support
   - Must calculate costs at transaction end only

2. **Advanced Offline Support**
   - No `offline` flag in transactions
   - Limited offline transaction recovery

3. **Rich Authorization Data**
   - Simple string `idTag` only
   - No multi-language support
   - No charging priority levels

4. **Advanced Device Management**
   - No device model/variable system
   - Basic key-value configuration only

5. **Transaction Events**
   - Separate Start/Stop/MeterValue messages
   - No unified transaction lifecycle

### ✅ Features Available in OCPP 1.6

1. **Basic Charging Operations**
   - Start/Stop transactions
   - Authorization validation
   - Meter value collection

2. **Remote Control**
   - Remote start/stop
   - Connector unlock
   - Reset operations

3. **Local Authorization**
   - Local authorization lists
   - Offline authorization (limited)

4. **Status Reporting**
   - Status notifications
   - Heartbeat monitoring

## 🧪 Test Scenarios

### Scenario 1: Walk-up Customer (OCPP 1.6)

```
1. Customer taps RFID card (D6A3FA03) on OCPP 1.6 charger
2. Charger sends Authorize request to CitrineOS
3. CitrineOS responds with accepted authorization
4. Customer plugs in EV cable
5. Charger sends StartTransaction request
6. Charging begins, MeterValues sent periodically
7. Customer unplugs → StopTransaction sent
8. Manual cost calculation (no real-time updates)
```

### Scenario 2: Remote Fleet Management (OCPP 1.6)

```bash
# 1. Remote start for fleet vehicle (OCPP 1.6)
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction" \
  -d '{"identifier": ["yatri-legacy-16-001"], "request": {"idTag": "YATRI-WALK-001234", "connectorId": 1}, "tenantId": 1}'

# 2. Monitor transaction (manual polling required)
docker logs server-citrine-1 --follow | grep -E "StartTransaction|StopTransaction|MeterValues"

# 3. Remote stop when needed
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStopTransaction" \
  -d '{"identifier": ["yatri-legacy-16-001"], "request": {"transactionId": 1}, "tenantId": 1}'
```

## 📊 Expected Message Flow (OCPP 1.6)

### Boot Sequence

```
1. BootNotification → CitrineOS
2. BootNotification Response ← CitrineOS (Accepted)
3. StatusNotification (Available) → CitrineOS
4. Heartbeat → CitrineOS (every 60 seconds)
```

### Transaction Sequence

```
1. Authorize (idTag) → CitrineOS
2. IdTagInfo Response ← CitrineOS (Accepted)
3. StartTransaction → CitrineOS
4. StartTransaction Response ← CitrineOS (transactionId: 1)
5. MeterValues → CitrineOS (periodic during charging)
6. StopTransaction → CitrineOS
7. StopTransaction Response ← CitrineOS
```

## 🛠 Troubleshooting OCPP 1.6

### Common Issues

1. **Connection Refused**
   - Check OCPP Server URL format: `ws://IP:PORT/STATION_ID`
   - Verify OCPP version set to 1.6 (not 2.0.1)
   - Ensure no extra path elements in URL

2. **Authorization Failures**
   - Verify `idTag` format (simple string, not object)
   - Check Local Authorization List sync
   - Ensure `LocalAuthorizeOffline=true` for offline auth

3. **Transaction Issues**
   - Integer transaction IDs only (OCPP 1.6)
   - No UUID transaction IDs like 2.0.1
   - Separate Start/Stop messages required

4. **Configuration Problems**
   - Use key-value pairs, not component/variable model
   - Standard OCPP 1.6 keys only
   - No custom device model variables

### Monitoring Commands

```bash
# Monitor OCPP 1.6 specific messages
docker logs server-citrine-1 --follow | grep -E "(StartTransaction|StopTransaction|Authorize|MeterValues)"

# Check connection status
docker logs server-citrine-1 --tail 20 | grep "yatri-legacy-16-001"

# Monitor heartbeats (should be every 60 seconds)
docker logs server-citrine-1 --follow | grep -E "Heartbeat.*yatri-legacy-16-001"
```

## 🔧 Configuration Templates

### OCPP 1.6 Charger Configuration Template

```
# Network Settings
WiFi Mode: Client (connect to main network)
WiFi SSID: [YOUR_MAIN_WIFI_NETWORK]
WiFi Password: [YOUR_MAIN_WIFI_PASSWORD]

# Basic OCPP 1.6 Settings
OCPP Server URL: ws://192.168.1.136:8081/yatri-legacy-16-001
OCPP Version: 1.6
Charge Point Identity: yatri-legacy-16-001
Security Profile: 0

# OCPP 1.6 Configuration Keys
HeartbeatInterval: 60
LocalAuthorizeOffline: true
LocalPreAuthorize: true
NumberOfConnectors: 1
MeterValueSampleInterval: 60
ClockAlignedDataInterval: 900
StopTransactionOnEVSideDisconnect: true
UnlockConnectorOnEVSideDisconnect: true
```

### CitrineOS OCPP 1.6 API Endpoints

```bash
# Authorization Management
POST /ocpp/1.6/sendLocalList
POST /ocpp/1.6/getLocalListVersion
POST /ocpp/1.6/clearCache

# Remote Control
POST /ocpp/1.6/evdriver/remoteStartTransaction
POST /ocpp/1.6/evdriver/remoteStopTransaction
POST /ocpp/1.6/evdriver/unlockConnector

# Configuration
POST /ocpp/1.6/configuration/getConfiguration
POST /ocpp/1.6/configuration/changeConfiguration
POST /ocpp/1.6/configuration/reset

# Monitoring
POST /ocpp/1.6/monitoring/getDiagnostics
POST /ocpp/1.6/monitoring/triggerMessage
```

## 📈 Success Criteria

### ✅ Connection & Communication
- [ ] OCPP 1.6 WebSocket connection established
- [ ] BootNotification successful with "Accepted" status
- [ ] Regular heartbeats every 60 seconds
- [ ] StatusNotification messages received

### ✅ Authorization System
- [ ] Local Authorization List successfully sent
- [ ] RFID card authorization working
- [ ] Authorize messages handled correctly
- [ ] IdTag validation functional

### ✅ Transaction Management
- [ ] Remote start transaction successful
- [ ] StartTransaction message received
- [ ] MeterValues periodic reporting
- [ ] Remote stop transaction working
- [ ] StopTransaction message with final meter reading

### ✅ Configuration Management
- [ ] GetConfiguration returning correct values
- [ ] ChangeConfiguration updating settings
- [ ] Key-value configuration system working

## 🔄 Protocol Comparison Results

### OCPP 1.6 vs 2.0.1 Test Results

| Test Scenario | OCPP 1.6 Result | OCPP 2.0.1 Result | Notes |
|---------------|-----------------|-------------------|-------|
| **Basic Connection** | ✅ / ❌ | ✅ Working | - |
| **Authorization** | ✅ / ❌ | ✅ Working | 1.6 uses simple idTag |
| **Remote Start** | ✅ / ❌ | ✅ Working | Different message format |
| **Transactions** | ✅ / ❌ | ✅ Working | Separate messages vs unified |
| **Real-time Costs** | ❌ Not supported | ✅ Working | Major limitation |
| **Offline Support** | ⚠️ Limited | ✅ Full support | Business impact |
| **Configuration** | ✅ / ❌ | ✅ Working | Key-value vs device model |

## 💡 Business Impact Analysis

### For Yatri Motorcycles Fleet

#### OCPP 1.6 Stations - Suitable For:
- ✅ **Basic AC charging locations**
- ✅ **Cost-effective deployments**
- ✅ **Simple walk-up charging**
- ✅ **Fleet vehicle charging**

#### OCPP 1.6 Limitations - Not Suitable For:
- ❌ **Premium customer experience** (no real-time costs)
- ❌ **Network-unreliable locations** (limited offline support)
- ❌ **Multi-language markets** (no localization support)
- ❌ **Advanced billing scenarios** (manual cost calculation only)

#### Recommended Strategy:
1. **OCPP 2.0.1 for premium locations** (malls, airports, city centers)
2. **OCPP 1.6 for basic locations** (rural, employee parking, fleet depots)
3. **Gradual migration path** from 1.6 to 2.0.1 as business grows

## 🎯 Next Steps

### Immediate Testing Actions
1. **Connect OCPP 1.6 hardware** using configuration templates
2. **Verify basic connectivity** and message exchange
3. **Test authorization flows** with existing RFID cards
4. **Compare transaction behavior** with OCPP 2.0.1 IoCharger
5. **Document limitations** and workarounds

### Documentation Updates
1. **Update OCPP_VERSION_COMPATIBILITY.md** with real test results
2. **Create deployment decision matrix** (1.6 vs 2.0.1)
3. **Document mixed-network operational procedures**

## 📚 Related Documentation

- **OCPP_VERSION_COMPATIBILITY.md**: Detailed protocol differences
- **REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md**: 2.0.1 reference implementation
- **ADVANCED_OPERATIONS.md**: Advanced features (mostly 2.0.1 only)
- **GOING_TO_PRODUCTION_V2.md**: Multi-protocol deployment guide

---

**Session Status**: 🔄 Ready to Begin OCPP 1.6 Hardware Integration  
**Next Action**: Connect OCPP 1.6 charging station and configure connection  
**Expected Outcome**: Working OCPP 1.6 integration with documented limitations

_Generated by Claude Code - OCPP 1.6 Hardware Integration Session_