# OCPP Troubleshooting Guide

**Created**: September 24, 2025
**Purpose**: Debug OCPP communication issues, authorization failures, and transaction problems
**Context**: Real charging station integration with CitrineOS CSMS

## 🚨 **Critical Authorization Issues**

### **Issue 1: Authorization Failures - "Found invalid authorizations [] for idToken"**

**Symptoms:**

```
2025-09-15 10:52:49.647 ERROR [TransactionService] Found invalid authorizations [] for idToken: 1
```

**Root Cause Analysis:**

- **Location**: `TransactionService.ts:173-178` in `authorizeOcpp16IdToken` method
- **Problem**: Authorization repository query returns empty array instead of exactly 1 authorization
- **Database Structure**: CitrineOS uses 3-table authorization model:
  ```
  IdTokens → Authorizations → IdTokenInfos
  ```

**Query Logic:**

```typescript
const authorizations = await this._authorizeRepository.readAllByQuerystring(tenantId, {
  idToken: idToken,
  type: null, // OCPP 1.6 doesn't have token types
});
if (authorizations.length !== 1) {
  this._logger.error(
    `Found invalid authorizations ${JSON.stringify(authorizations)} for idToken: ${idToken}`,
  );
  return response; // Status: Invalid
}
```

**Database Query Construction** (`Authorization.ts:80-107`):

```typescript
private _constructQuery(queryParams: AuthorizationQuerystring): object {
  const idTokenWhere: any = {};
  if (queryParams.idToken) {
    idTokenWhere.idToken = queryParams.idToken; // Exact match
  }
  if (queryParams.type) {
    idTokenWhere.type = queryParams.type;
  }
  return {
    where: {},
    include: [
      {
        model: IdToken,
        where: idTokenWhere,
        required: true, // Inner join - only Authorizations with matching IdToken
      },
      { model: IdTokenInfo, include: [{ model: IdToken, include: [AdditionalInfo] }] },
    ],
  };
}
```

**Solution:**
Create proper authorization entries using the 3-table model. Reference `RFID_CARD_CREATION_GUIDE.md` for exact process.

### **Issue 2: Empty StationId Fields**

**Symptoms:**

```
2025-09-15 10:52:36.786 DEBUG [CallApi] Searching for charging station with stationId:
2025-09-15 10:52:36.786 WARN [CallApi] Charging station not found for tenantId: 1
```

**Root Cause:**

- OCPP messages arriving with empty `stationId` field
- Charging station configuration or WebSocket URL format issue
- Message parsing or routing problem

**Investigation Points:**

1. Check charging station WebSocket connection URL format
2. Verify charging station configuration files
3. Analyze `WebsocketNetworkConnection.ts` message parsing logic

### **Issue 3: Concurrent Call Errors ("Call already in progress")**

**Symptoms:**

```
2026-01-14 06:15:05.278 ERROR [MessageRouterImpl] Failed to process Call message 4:Anari001 [
  2,
  '07da6c77-b15b-4b79-9901-affbe23a064a',
  'StatusNotification',
  { connectorId: 2, errorCode: 'NoError', status: 'Unavailable', timestamp: '2026-01-14T06:15:04.292Z' }
]
OcppError Call already in progress, OcppError, 07da6c77-b15b-4b79-9901-affbe23a064a, RpcFrameworkError
```

**Affected Chargers:** Anari (confirmed), potentially other multi-connector chargers

**Root Cause Analysis:**

The charger sends multiple CALL messages simultaneously without waiting for responses. This commonly occurs on **multi-connector chargers** when:

1. User starts charging on connector 1 → `StartTransaction` sent
2. Connector 2 status changes → `StatusNotification` sent at the same time
3. CitrineOS rejects the second message because the first is still being processed

**OCPP Specification Reference (OCPP-J 1.6, Section 4.1.1 Synchronicity):**

> "A Charge Point or Central System **SHOULD NOT** send a CALL message to the other party unless all the CALL messages it sent before have been responded to or have timed out."

Key points:

- The spec uses **"SHOULD NOT"** (recommendation), not **"MUST NOT"** (requirement)
- The spec explicitly acknowledges: _"Such a situation is difficult to prevent because CALL messages from both sides can always cross each other."_

**Why StatusNotification Is Most Affected:**

- `StatusNotification` is "fire and forget" - charger sends it whenever status changes
- Multi-connector chargers have simultaneous status changes on different connectors
- `StartTransaction`/`StopTransaction` are sequential by nature (wait for response)
- `StatusNotification` is informational and doesn't require strict ordering

**Code Location:** `03_Modules/OcppRouter/src/module/router.ts:494-502`

```typescript
// Ensure only one call is processed at a time
const successfullySet = await this._cache.setIfNotExist(
  identifier, // Cache key is just tenantId:stationId
  `${action}:${messageId}`,
  CacheNamespace.Transactions,
  this._config.maxCallLengthSeconds,
);

if (!successfullySet) {
  throw new OcppError(messageId, ErrorCode.RpcFrameworkError, 'Call already in progress', {});
}
```

**Proposed Fix (Not Yet Implemented):**

Allow concurrent processing for informational actions by using message-specific cache keys:

```typescript
// Informational actions that can be processed concurrently
const CONCURRENT_ALLOWED_ACTIONS = ['StatusNotification', 'Heartbeat', 'MeterValues'];

const isInformational = CONCURRENT_ALLOWED_ACTIONS.includes(action);
// For informational actions, use messageId in cache key to allow concurrency
const cacheKey = isInformational ? `${identifier}:${messageId}` : identifier;

const successfullySet = await this._cache.setIfNotExist(
  cacheKey, // Different key for informational actions
  `${action}:${messageId}`,
  CacheNamespace.Transactions,
  this._config.maxCallLengthSeconds,
);
```

This fix would also require updates to `sendCallResult` and `sendCallError` to use the same cache key logic.

**Current Workarounds:**

1. **Contact charger vendor** (Anari) to update firmware to serialize OCPP messages
2. **Increase `maxCallLengthSeconds`** - won't fix the issue but reduces window (not recommended)
3. **Accept the errors** - StatusNotification failures are non-critical; charger will send updated status on next change

**Impact Assessment:**

- **Low severity** - StatusNotification failures don't affect charging operations
- The charger will send fresh status on the next change
- Critical messages (StartTransaction, StopTransaction) are not affected

## 📋 **OCPP Message Flow Analysis**

### **Architecture Overview:**

```
Charging Station → WebSocket → CitrineOS Router → RabbitMQ → Module Processing → Response
```

### **Key Components:**

1. **WebsocketNetworkConnection.ts**

   - Handles OCPP WebSocket connections
   - Routes messages based on protocol version and message type
   - Manages ping/pong and connection lifecycle

2. **TransactionService.ts**

   - Processes transaction-related OCPP messages
   - Handles authorization validation
   - Manages meter values and billing calculations

3. **Authorization Repository**
   - 3-table relational model for token management
   - Supports both OCPP 1.6 and 2.0.1 token formats
   - Complex query construction with joins

### **OCPP 1.6 vs 2.0.1 Authorization Differences:**

**OCPP 1.6:**

```typescript
// TransactionService.ts:169-172
const authorizations = await this._authorizeRepository.readAllByQuerystring(tenantId, {
  idToken: idToken,
  type: null, // No token types in 1.6
});
```

**OCPP 2.0.1:**

```typescript
// TransactionService.ts:73-75
const authorizations = await this._authorizeRepository.readAllByQuerystring(tenantId, {
  ...idToken, // Includes idToken and type fields
});
```

## 🔧 **Debugging Commands**

### **Check Authorization Database:**

```bash
# Via Hasura GraphQL (localhost:8090)
curl -s http://localhost:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { IdTokens(where: {idToken: {_eq: \"1\"}}) { id idToken type tenantId } }"}' | jq '.'

# Check complete authorization chain
curl -s http://localhost:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "query { Authorizations { id idTokenId idTokenInfoId idToken { idToken type } idTokenInfo { status chargingPriority } } }"}' | jq '.'
```

### **Monitor OCPP Message Flow:**

```bash
# Follow CitrineOS logs in real-time
docker logs -f server-citrine-1

# Filter for specific message types
docker logs server-citrine-1 2>&1 | grep -E "(StartTransaction|Authorize|Heartbeat)"

# Check WebSocket connections
docker logs server-citrine-1 2>&1 | grep -E "(WebSocket|stationId)"
```

### **Reduce Log Verbosity:**

```bash
# Current config location: Server/data/config.json
# Change logLevel from 2 (DEBUG) to 3 (INFO) or 4 (WARN)
```

## 🎯 **Common Solutions**

### **Create Missing Authorization for idToken "1":**

```bash
# Step 1: Create IdToken
curl -s http://localhost:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_IdTokens_one(object: {idToken: \"1\", type: \"ISO14443\", tenantId: 1, createdAt: \"2025-09-24T12:00:00.000Z\", updatedAt: \"2025-09-24T12:00:00.000Z\"}) { id idToken type tenantId } }"}' | jq '.'

# Step 2: Create IdTokenInfo
curl -s http://localhost:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_IdTokenInfos_one(object: {status: \"Accepted\", chargingPriority: 3, language1: \"en\", cacheExpiryDateTime: \"2025-12-31T23:59:59.000Z\", createdAt: \"2025-09-24T12:00:00.000Z\", updatedAt: \"2025-09-24T12:00:00.000Z\"}) { id status chargingPriority } }"}' | jq '.'

# Step 3: Create Authorization Link (use returned IDs from steps 1&2)
curl -s http://localhost:8090/v1/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_Authorizations_one(object: {idTokenId: ID_FROM_STEP_1, idTokenInfoId: ID_FROM_STEP_2, concurrentTransaction: true, createdAt: \"2025-09-24T12:00:00.000Z\", updatedAt: \"2025-09-24T12:00:00.000Z\"}) { id idTokenId idTokenInfoId } }"}' | jq '.'
```

### **Force Disconnect Charging Station:**

```bash
# Via Swagger UI (localhost:8080/docs)
# Method 1: Reset via Configuration endpoint
POST /ocpp/1.6/configuration/reset?identifier=STATION_ID&tenantId=1
{
  "type": "Soft"
}

# Method 2: Change availability
POST /ocpp/1.6/configuration/changeAvailability?identifier=STATION_ID&tenantId=1
{
  "connectorId": 0,
  "type": "Inoperative"
}
```

## 📚 **Related Documentation**

- `RFID_CARD_CREATION_GUIDE.md` - Complete authorization creation process
- `REAL_HARDWARE_INTEGRATION_OCPP_1.6.md` - Physical hardware setup and troubleshooting
- `OCPP_VERSION_COMPATIBILITY.md` - Protocol differences and limitations
- `ARCHITECTURE.md` - System architecture and message flow patterns

## 🔄 **Next Session Action Items**

1. **Immediate Fixes**:

   - Create authorization for idToken "1"
   - Investigate empty stationId field source
   - Test transaction flow after authorization fix

2. **System Improvements**:

   - Implement request deduplication for concurrent calls
   - Add better error messages for authorization failures
   - Consider log level optimization for production

3. **Monitoring Enhancements**:
   - Set up alerting for authorization failures
   - Monitor charging station connection stability
   - Track transaction success/failure rates

---

**Last Updated**: September 24, 2025
**Session Context**: OCPP 1.6 transaction debugging and authorization analysis
**Status**: Issues identified, solutions documented, ready for implementation
