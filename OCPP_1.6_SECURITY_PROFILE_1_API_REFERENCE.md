# OCPP 1.6 Security Profile 1 API Reference

**Created**: September 24, 2025
**Purpose**: Production-ready API patterns for OCPP 1.6 with Basic Authentication
**Context**: Tested and validated with physical IoCharger hardware

## 🔐 Security Profile 1 Configuration

### WebSocket Server Configuration
```json
{
  "id": "4",
  "host": "0.0.0.0",
  "port": 8092,
  "protocol": "ocpp1.6",
  "securityProfile": 1,
  "allowUnknownChargingStations": false,
  "tenantId": 1
}
```

### Authentication Credentials
- **WebSocket URL**: `ws://13.204.177.82:8092/{CHARGER_ID}`
- **Username**: `{CHARGER_ID}` (charging station identifier)
- **Password**: Configured per charging station (e.g., `YatriSecure2025_Test`)
- **Pre-registration**: Required in ChargingStations table

---

## 🔌 Charging Operations API

### Remote Start Transaction
**Endpoint**: `POST /ocpp/1.6/evdriver/remoteStartTransaction`

**Parameters**:
- `identifier`: Charging station ID
- `tenantId`: Tenant identifier (default: 1)

**Request Body**:
```json
{
  "connectorId": 1,
  "idTag": "D6A3FA03"
}
```

**cURL Example**:
```bash
curl -X POST "http://13.204.177.82:8080/ocpp/1.6/evdriver/remoteStartTransaction?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"connectorId": 1, "idTag": "D6A3FA03"}'
```

**Response**:
```json
[{"success": true}]
```

### Remote Stop Transaction
**Endpoint**: `POST /ocpp/1.6/evdriver/remoteStopTransaction`

**Parameters**:
- `identifier`: Charging station ID
- `tenantId`: Tenant identifier

**Request Body**:
```json
{
  "transactionId": 1
}
```

**cURL Example**:
```bash
curl -X POST "http://13.204.177.82:8080/ocpp/1.6/evdriver/remoteStopTransaction?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": 1}'
```

**Response**:
```json
[{"success": true}]
```

---

## 📊 Configuration Management API

### Get System Configuration
**Endpoint**: `GET /data/configuration/systemConfig`

**cURL Example**:
```bash
curl -s "http://13.204.177.82:8080/data/configuration/systemConfig" | jq '.util.networkConnection.websocketServers'
```

### Update System Configuration
**Endpoint**: `PUT /data/configuration/systemConfig`

**Update Security Profile Example**:
```bash
curl -s "http://13.204.177.82:8080/data/configuration/systemConfig" | \
  jq '.util.networkConnection.websocketServers |= map(if .id == "4" then . + {"securityProfile": 1, "allowUnknownChargingStations": false} else . end)' > /tmp/config.json

curl -X PUT "http://13.204.177.82:8080/data/configuration/systemConfig" \
  -H "Content-Type: application/json" \
  -d @/tmp/config.json
```

### Trigger Message
**Endpoint**: `POST /ocpp/1.6/configuration/triggerMessage`

**StatusNotification Example**:
```bash
curl -X POST "http://13.204.177.82:8080/ocpp/1.6/configuration/triggerMessage?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"requestedMessage": "StatusNotification", "connectorId": 1}'
```

**Heartbeat Example**:
```bash
curl -X POST "http://13.204.177.82:8080/ocpp/1.6/configuration/triggerMessage?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"requestedMessage": "Heartbeat"}'
```

---

## 📡 Real-time Monitoring API

### Create Webhook Subscription
**Endpoint**: `POST /data/ocpprouter/subscription`

**Request Body**:
```json
{
  "url": "https://your-webhook-endpoint.com/log-webhook",
  "stationId": "yatri-1-ioc-1-sec1",
  "tenantId": 1,
  "onConnect": true,
  "onClose": true,
  "onMessage": true,
  "sentMessage": true
}
```

**cURL Example**:
```bash
curl -X POST "http://13.204.177.82:8080/data/ocpprouter/subscription" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://6k69sjzq-3000.inc1.devtunnels.ms/log-webhook",
    "stationId": "yatri-1-ioc-1-sec1",
    "tenantId": 1,
    "onConnect": true,
    "onClose": true,
    "onMessage": true,
    "sentMessage": true
  }'
```

**Response**: Subscription ID (integer)

### Get Active Subscriptions
**Endpoint**: `GET /data/ocpprouter/subscription`

**cURL Example**:
```bash
curl -s "http://13.204.177.82:8080/data/ocpprouter/subscription?stationId=yatri-1-ioc-1-sec1&tenantId=1" | jq '.'
```

---

## 🗃️ Database Management (GraphQL)

### Create Charging Station
**Endpoint**: `POST http://13.204.177.82:8090/v1/graphql`

**Request Body**:
```json
{
  "query": "mutation { insert_ChargingStations_one(object: {id: \"yatri-1-ioc-1-sec1\", tenantId: 1, createdAt: \"2025-09-24T12:00:00.000Z\", updatedAt: \"2025-09-24T12:00:00.000Z\"}) { id tenantId } }"
}
```

**cURL Example**:
```bash
curl -s "http://13.204.177.82:8090/v1/graphql" \
  -H "Content-Type: application/json" \
  -d '{"query": "mutation { insert_ChargingStations_one(object: {id: \"yatri-1-ioc-1-sec1\", tenantId: 1, createdAt: \"2025-09-24T12:00:00.000Z\", updatedAt: \"2025-09-24T12:00:00.000Z\"}) { id tenantId } }"}'
```

### Get Charging Station
**Request Body**:
```json
{
  "query": "query { ChargingStations(where: {id: {_eq: \"yatri-1-ioc-1-sec1\"}}) { id tenantId createdAt updatedAt } }"
}
```

---

## 📨 OCPP Message Flow Examples

### StatusNotification (from Charger)
```json
{
  "message": "[2,\"17587390271539194\",\"StatusNotification\",{\"connectorId\":1,\"errorCode\":\"NoError\",\"status\":\"Preparing\",\"timestamp\":\"2025-09-24T18:37:07.593Z\"}]",
  "info": {
    "correlationId": "17587390271539194",
    "origin": "cs",
    "protocol": "ocpp1.6",
    "action": "StatusNotification"
  }
}
```

### MeterValues (during charging)
```json
{
  "message": "[2,\"17587392651776962\",\"MeterValues\",{\"connectorId\":1,\"transactionId\":1,\"meterValue\":[{\"timestamp\":\"2025-09-24T18:41:05.374Z\",\"sampledValue\":[{\"value\":\"6.8041\",\"measurand\":\"Energy.Active.Import.Register\",\"unit\":\"kWh\"},{\"value\":\"219.3\",\"measurand\":\"Voltage\",\"unit\":\"V\"},{\"value\":\"14.4\",\"measurand\":\"Current.Import\",\"unit\":\"A\"},{\"value\":\"32.0\",\"measurand\":\"Current.Offered\",\"unit\":\"A\"},{\"value\":\"34.0\",\"measurand\":\"Temperature\",\"unit\":\"Celsius\"}]}]}]",
  "info": {
    "correlationId": "17587392651776962",
    "origin": "cs",
    "protocol": "ocpp1.6",
    "action": "MeterValues"
  }
}
```

### StopTransaction (session end)
```json
{
  "message": "[2,\"17587395022014073\",\"StopTransaction\",{\"idTag\":\"D6A3FA03\",\"meterStop\":7013,\"timestamp\":\"2025-09-24T18:45:01.787Z\",\"transactionId\":1,\"reason\":\"Remote\"}]",
  "info": {
    "correlationId": "17587395022014073",
    "origin": "cs",
    "protocol": "ocpp1.6",
    "action": "StopTransaction"
  }
}
```

---

## 🔑 Authorization System

### RFID Token Management
The system uses a 3-table authorization model:

1. **IdTokens** → Store token values and types
2. **IdTokenInfos** → Store authorization metadata
3. **Authorizations** → Link tokens to metadata

**Working Token**: `D6A3FA03` (ISO14443 RFID card)

### Authorization Flow
1. Charger sends `Authorize` message with `idTag`
2. CSMS queries authorization database
3. Response includes `idTagInfo` with status and expiry
4. Transaction can proceed if status is "Accepted"

---

## 🎯 Integration Patterns

### Mobile App Integration
```typescript
// Remote Start Example
const startCharging = async (chargerId: string, rfidToken: string) => {
  const response = await fetch(`${CSMS_BASE_URL}/ocpp/1.6/evdriver/remoteStartTransaction?identifier=${chargerId}&tenantId=1`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ connectorId: 1, idTag: rfidToken })
  });
  return response.json();
};
```

### Dashboard Integration
```typescript
// Real-time Monitoring
const subscribeToCharger = async (chargerId: string, webhookUrl: string) => {
  const response = await fetch(`${CSMS_BASE_URL}/data/ocpprouter/subscription`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      url: webhookUrl,
      stationId: chargerId,
      tenantId: 1,
      onConnect: true,
      onClose: true,
      onMessage: true,
      sentMessage: true
    })
  });
  return response.json();
};
```

---

## 🚨 Error Handling

### Common Error Responses
```json
{"statusCode": 400, "error": "Bad Request", "message": "Must specify at least one of onConnect, onClose, onMessage, sentMessage to true."}
{"message": "Route POST:/data/chargingStation not found", "error": "Not Found", "statusCode": 404}
[{"success": false, "payload": "No connection found for identifier: 1:yatri-1-ioc-1-sec1"}]
```

### Connection Issues
- **Authentication Failed**: Check username/password format
- **Charger Not Found**: Ensure charging station is pre-registered
- **Transaction Failed**: Verify RFID token is authorized

---

## 📈 Performance Metrics

### Tested Configuration
- **Charger**: IoCharger AC Station
- **Protocol**: OCPP 1.6
- **Security**: Profile 1 (Basic Auth)
- **Connection**: Stable WebSocket on port 8092
- **Latency**: < 1 second for API calls
- **Throughput**: 60-second heartbeat intervals
- **Energy Delivery**: 0.213 kWh in 4 minutes (~3.2 kW)

### Production Readiness
- ✅ Authentication implemented and tested
- ✅ Real-time monitoring operational
- ✅ Transaction flow validated
- ✅ Error handling documented
- ✅ Integration patterns established

---

## 🔄 Next Steps

1. **Scale Testing**: Multiple simultaneous chargers
2. **Load Testing**: High-frequency transaction processing
3. **Security Enhancement**: TLS/mTLS implementation
4. **Multi-tenant**: Beyond default tenant ID 1
5. **Advanced Features**: Smart charging, load balancing

---

**Last Updated**: September 24, 2025
**Status**: Production-ready for mobile and dashboard integration
**Validation**: End-to-end tested with physical hardware