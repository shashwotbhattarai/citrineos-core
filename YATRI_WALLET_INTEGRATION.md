# Yatri Energy Wallet Integration - Implementation Guide

**Implementation Date**: December 16, 2025
**Status**: Ready for Testing
**CitrineOS Version**: OCPP 1.6/2.0.1

## 🎯 **Integration Overview**

Complete wallet integration for CitrineOS charging operations with Yatri Energy backend. Provides minimum balance validation before charging and automatic payment settlement after transaction completion.

### **🔄 Transaction Flow**

```
1. User initiates charging (RFID tap OR API remote start)
2. CitrineOS checks wallet minimum balance via Yatri Energy API
3. If sufficient balance: Allow charging | If insufficient: Block charging
4. Charging proceeds with real-time energy monitoring
5. User stops charging (RFID tap, remote stop, or automatic)
6. CitrineOS calculates final cost and processes payment via Yatri Energy API
```

---

## 🏗️ **Architecture Implementation**

### **Components Created/Modified**

#### **1. YatriEnergyClient (NEW)**

**Location**: `02_Util/src/yatri/YatriEnergyClient.ts`
**Purpose**: HTTP client for Yatri Energy backend communication

**Key Methods**:

- `checkMinimumBalance(idToken, minimumRequired)` - Wallet balance validation
- `makePayment(paymentRequest)` - Payment processing after charging
- `healthCheck()` - Backend connectivity verification

#### **2. Configuration Schema (MODIFIED)**

**Location**: `00_Base/src/config/types.ts`
**Purpose**: TypeScript configuration schema for Yatri Energy settings

```typescript
yatriEnergy: {
  baseUrl: string;           // Default: 'http://13.235.140.91'
  apiKey?: string;           // Optional authentication
  timeout: number;           // Default: 10000ms
  minimumBalance: number;    // Default: 100.0 NPR
  enabled: boolean;          // Default: false
}
```

#### **3. Integration Points (MODIFIED)**

##### **A. RFID Authorization Check**

**File**: `03_Modules/Transactions/src/module/TransactionService.ts:224-229`
**Trigger**: Physical RFID card tap
**Method**: `_checkYatriWalletBalance()`
**Failure Response**: `OCPP1_6.StartTransactionResponseStatus.Blocked`

##### **B. Remote Start Authorization**

**File**: `03_Modules/EVDriver/src/module/1.6/MessageApi.ts:47-67`
**Trigger**: `POST /ocpp/1.6/evdriver/remoteStartTransaction`
**Method**: `_checkYatriWalletBalance()`
**Failure Response**: `RemoteStartTransactionResponseStatus.Rejected`

##### **C. Remote Stop Logging**

**File**: `03_Modules/EVDriver/src/module/1.6/MessageApi.ts:92-98`
**Trigger**: `POST /ocpp/1.6/evdriver/remoteStopTransaction`
**Action**: Enhanced logging for transaction tracking

##### **D. Payment Settlement**

**File**: `03_Modules/Transactions/src/module/module.ts:734-735`
**Trigger**: Any `StopTransaction` OCPP message (covers all stop scenarios)
**Method**: `_processYatriPaymentSettlement()`
**Behavior**: Non-blocking payment processing

---

## ⚙️ **Configuration Setup**

### **Environment Variables**

```bash
# Required
YATRI_WALLET_INTEGRATION_ENABLED=true
YATRI_ENERGY_BASE_URL=http://13.235.140.91

# Optional
YATRI_ENERGY_API_KEY=your_api_key_here
YATRI_ENERGY_TIMEOUT=10000
YATRI_MINIMUM_BALANCE=100.0
```

### **Local Configuration**

**File**: `Server/src/config/envs/local.ts:246-252`

```typescript
yatriEnergy: {
  baseUrl: process.env.YATRI_ENERGY_BASE_URL || 'http://13.235.140.91',
  apiKey: process.env.YATRI_ENERGY_API_KEY,
  timeout: parseInt(process.env.YATRI_ENERGY_TIMEOUT || '10000', 10),
  minimumBalance: parseFloat(process.env.YATRI_MINIMUM_BALANCE || '100.0'),
  enabled: process.env.YATRI_WALLET_INTEGRATION_ENABLED === 'true',
}
```

---

## 📡 **API Integration Details**

### **Yatri Energy Backend APIs Used**

#### **1. Wallet Balance Check**

```bash
GET /wallet/idToken/{idToken}

# Example Response:
{
  "idToken": "D6A3FA03",
  "balance": 9931.0,
  "currency": "NPR",
  "status": "ACTIVE",
  "minimumBalance": 100.0,
  "lastUpdated": "2025-12-16T10:30:00Z"
}
```

#### **2. Payment Processing**

```bash
POST /wallet/make-payment
Content-Type: application/json

# Example Request:
{
  "idToken": "D6A3FA03",
  "amount": 45.50,
  "currency": "NPR",
  "transactionId": 123,
  "stationId": "yatri-1-ioc-1",
  "description": "EV Charging - Station yatri-1-ioc-1 - 2.15kWh"
}

# Example Response:
{
  "success": true,
  "transactionId": "pay_12345",
  "amount": 45.50,
  "currency": "NPR",
  "balance": 9885.50,
  "timestamp": "2025-12-16T11:15:30Z",
  "status": "SUCCESS"
}
```

---

## 🧪 **Testing Scenarios**

### **Test Environment Setup**

1. Set environment variables for Yatri Energy integration
2. Ensure Yatri Energy backend is accessible at configured URL
3. Create test RFID token with known wallet balance
4. Configure minimum balance threshold for testing

### **Test Cases**

#### **Scenario 1: RFID Authorization - Sufficient Balance**

```bash
# Setup: Wallet balance > minimum balance (e.g., 500 NPR > 100 NPR)
1. Tap RFID card on charging station
2. Expected: Authorization accepted, charging starts
3. Verify: Logs show wallet check passed
```

#### **Scenario 2: RFID Authorization - Insufficient Balance**

```bash
# Setup: Wallet balance < minimum balance (e.g., 50 NPR < 100 NPR)
1. Tap RFID card on charging station
2. Expected: Authorization blocked, charging rejected
3. Verify: Logs show wallet check failed with balance details
```

#### **Scenario 3: Remote Start - Sufficient Balance**

```bash
# API Test
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction?identifier=yatri-1-ioc-1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"connectorId": 1, "idTag": "D6A3FA03"}'

# Expected: HTTP 200, charging starts
# Verify: Wallet check logs and charging station response
```

#### **Scenario 4: Remote Start - Insufficient Balance**

```bash
# Use same API call with low-balance token
# Expected: HTTP 200 with status "Rejected"
# Verify: Wallet check failure logs
```

#### **Scenario 5: Payment Settlement - Physical Stop**

```bash
# Setup: Complete charging session initiated by RFID
1. Start charging with RFID tap
2. Allow charging for measurable duration (e.g., 2-3 minutes)
3. Stop charging with RFID tap
4. Expected: Payment deducted from wallet
5. Verify: Payment API call logs and wallet balance reduction
```

#### **Scenario 6: Payment Settlement - Remote Stop**

```bash
# Setup: Complete charging session initiated remotely
1. Start charging via remote start API
2. Allow charging for measurable duration
3. Stop charging via remote stop API
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStopTransaction?identifier=yatri-1-ioc-1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": 123}'
4. Expected: Payment deducted from wallet
5. Verify: Payment API call logs and wallet balance reduction
```

#### **Scenario 7: Integration Disabled**

```bash
# Setup: Set YATRI_WALLET_INTEGRATION_ENABLED=false
1. Attempt any charging operation
2. Expected: Normal CitrineOS behavior, no wallet checks
3. Verify: Logs show "wallet integration disabled" messages
```

#### **Scenario 8: Network Error Handling**

```bash
# Setup: Make Yatri Energy backend unreachable
1. Attempt charging operations
2. Expected: Fail-safe behavior - charging allowed despite wallet check failure
3. Verify: Error logs but charging not blocked
```

### **Expected Log Patterns**

#### **Successful Wallet Check:**

```
DEBUG: Wallet balance check passed for idToken: D6A3FA03 {
  minimumRequired: 100.0,
  stationId: "yatri-1-ioc-1"
}
```

#### **Failed Wallet Check:**

```
WARN: Wallet balance check failed for idToken: D6A3FA03 {
  minimumRequired: 100.0,
  stationId: "yatri-1-ioc-1"
}
```

#### **Payment Settlement:**

```
INFO: Payment settlement completed successfully {
  transactionId: "123",
  idToken: "D6A3FA03",
  amount: 45.50,
  newBalance: 9885.50,
  paymentTransactionId: "pay_12345"
}
```

#### **Integration Disabled:**

```
DEBUG: Yatri Energy wallet integration is disabled, skipping wallet check
```

---

## 🔍 **Debugging & Troubleshooting**

### **Common Issues & Solutions**

#### **Issue 1: "Yatri Energy wallet integration is disabled"**

**Solution**: Check environment variable `YATRI_WALLET_INTEGRATION_ENABLED=true`

#### **Issue 2: "Wallet balance request failed: 404"**

**Solution**: Verify idToken exists in Yatri Energy backend, check base URL configuration

#### **Issue 3: "Connection refused" errors**

**Solution**: Verify Yatri Energy backend accessibility, check network connectivity

#### **Issue 4: Payment settlement not triggered**

**Solution**: Verify transaction reaches StopTransaction OCPP message, check OCPP logs

#### **Issue 5: TypeScript compilation errors**

**Solution**: Ensure all imports are correct, particularly `YatriEnergyClient` from `@citrineos/util`

### **Debug Commands**

#### **Check Configuration:**

```bash
# View current system configuration
curl -s "http://localhost:8080/data/configuration/systemConfig" | jq '.yatriEnergy'
```

#### **Monitor Real-time Logs:**

```bash
# CitrineOS container logs
docker logs server-citrine-1 --follow | grep -i yatri

# Filter wallet-specific logs
docker logs server-citrine-1 --follow | grep -E "(wallet|payment|balance)"
```

#### **Test Yatri Energy Connectivity:**

```bash
# Health check
curl -v http://13.235.140.91/health

# Test wallet API directly
curl -v "http://13.235.140.91/wallet/idToken/D6A3FA03"
```

---

## 📋 **Testing Checklist**

### **Pre-Testing Setup**

- [ ] Environment variables configured
- [ ] Yatri Energy backend accessible
- [ ] Test RFID token with known balance
- [ ] CitrineOS running with latest integration code
- [ ] Charging station connected and operational

### **Core Functionality Tests**

- [ ] RFID start with sufficient balance ✅/❌
- [ ] RFID start with insufficient balance ✅/❌
- [ ] Remote start with sufficient balance ✅/❌
- [ ] Remote start with insufficient balance ✅/❌
- [ ] Payment settlement via RFID stop ✅/❌
- [ ] Payment settlement via remote stop ✅/❌
- [ ] Integration disabled behavior ✅/❌
- [ ] Network error fail-safe behavior ✅/❌

### **Log Verification**

- [ ] Wallet check success logs ✅/❌
- [ ] Wallet check failure logs ✅/❌
- [ ] Payment settlement logs ✅/❌
- [ ] Error handling logs ✅/❌
- [ ] Integration disabled logs ✅/❌

### **API Response Verification**

- [ ] Authorization rejection responses ✅/❌
- [ ] Remote start rejection responses ✅/❌
- [ ] Proper HTTP status codes ✅/❌
- [ ] Complete error messages ✅/❌

---

## 📄 **Implementation Files Summary**

### **New Files Created:**

1. `02_Util/src/yatri/YatriEnergyClient.ts` - HTTP client utility

### **Files Modified:**

1. `00_Base/src/config/types.ts` - Configuration schema
2. `02_Util/src/index.ts` - Export YatriEnergyClient
3. `Server/src/config/envs/local.ts` - Local configuration
4. `03_Modules/Transactions/src/module/TransactionService.ts` - RFID authorization
5. `03_Modules/Transactions/src/module/module.ts` - Payment settlement
6. `03_Modules/EVDriver/src/module/1.6/MessageApi.ts` - Remote start/stop

### **Total Lines Added**: ~200 lines

### **Integration Points**: 4 core integration points

### **API Endpoints**: 2 Yatri Energy APIs integrated

---

## 🚀 **Production Deployment Notes**

### **Environment Variables for Production:**

```bash
YATRI_WALLET_INTEGRATION_ENABLED=true
YATRI_ENERGY_BASE_URL=https://production.api.yatri.energy
YATRI_ENERGY_API_KEY=prod_api_key_here
YATRI_MINIMUM_BALANCE=50.0
YATRI_ENERGY_TIMEOUT=5000
```

### **Monitoring Recommendations:**

- Monitor wallet API response times
- Alert on payment settlement failures
- Track wallet check success/failure rates
- Monitor Yatri Energy backend connectivity

### **Rollback Plan:**

Set `YATRI_WALLET_INTEGRATION_ENABLED=false` to disable integration without code changes.

---

**Ready for Testing**: December 17, 2025 🧪
**Implemented by**: Claude Code Assistant
**Architecture**: Production-ready with fail-safe behavior
