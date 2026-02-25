# CitrineOS CSMS - Complete API Reference

**Last Updated**: December 29, 2025

> ⚠️ **Note**: Some examples in this document use `tenantId=2`. The correct production value is **`tenantId=1`**.
> See **[CLAUDE.md](./CLAUDE.md)** for authoritative values and tested API examples.

---

## 🎯 Phase 2 Goal Achievement

**Objective**: Enable creation of multiple CPOs, locations, chargers, EV driver authentication, charging operations, transaction management, and detailed monitoring.

## 📋 API Categories

### 1. **CPO Infrastructure Management**

### 2. **Charging Station Operations**

### 3. **EV Driver Authentication & Authorization**

### 4. **Transaction & Billing Management**

### 5. **Monitoring & Device Management**

### 6. **Real-time Operations**

---

## 1. CPO Infrastructure Management APIs

### 1.1 Tenant (CPO) Management

#### Create New CPO Tenant

```http
POST /tenant/create
Content-Type: application/json
```

**Request:**

```json
{
  "name": "Yatri Motorcycles",
  "description": "EV charging network for Nepal"
}
```

**Response:**

```json
{
  "tenantId": 2,
  "name": "Yatri Motorcycles",
  "createdAt": "2025-01-01T00:00:00Z"
}
```

### 1.2 Location Management

#### Create Location with Charging Stations

```http
POST /data/location?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "name": "Kathmandu Mall Charging Hub",
  "address": "Ring Road, Kathmandu",
  "city": "Kathmandu",
  "postalCode": "44600",
  "state": "Bagmati",
  "country": "Nepal",
  "coordinates": {
    "type": "Point",
    "coordinates": [85.324, 27.7172]
  },
  "chargingPool": [
    {
      "id": "cp001",
      "chargePointVendor": "Yatri",
      "chargePointModel": "YatriCharge-Pro",
      "chargePointSerialNumber": "YC2025001",
      "firmwareVersion": "1.0.0",
      "connectors": [
        {
          "connectorId": 1,
          "connectorType": "cType2",
          "status": "Available",
          "maxPower": 22000
        }
      ]
    }
  ]
}
```

**Response:**

```json
{
  "id": 1,
  "name": "Kathmandu Mall Charging Hub",
  "tenantId": 2,
  "chargingPool": [
    {
      "id": "cp001",
      "locationId": 1,
      "isOnline": false,
      "protocol": null,
      "connectors": [...]
    }
  ]
}
```

#### List All Locations for CPO

```http
GET /data/location?tenantId=2
```

**Response:**

```json
{
  "locations": [
    {
      "id": 1,
      "name": "Kathmandu Mall Charging Hub",
      "address": "Ring Road, Kathmandu",
      "chargingPool": [...]
    }
  ]
}
```

#### Update Location

```http
PUT /data/location/{locationId}?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "name": "Updated Location Name",
  "coordinates": {
    "type": "Point",
    "coordinates": [85.3241, 27.7173]
  }
}
```

### 1.3 Charging Station Management

#### Add Individual Charging Station

```http
POST /data/charging-station?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "id": "cp002",
  "locationId": 1,
  "chargePointVendor": "Yatri",
  "chargePointModel": "YatriCharge-Fast",
  "chargePointSerialNumber": "YC2025002",
  "firmwareVersion": "1.0.0",
  "connectors": [
    {
      "connectorId": 1,
      "connectorType": "cCCS2",
      "status": "Available",
      "maxPower": 50000
    }
  ]
}
```

#### Update Charging Station Configuration

```http
PUT /configuration/station-config?stationId=cp001&tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "heartbeatInterval": 30,
  "resetRetries": 3,
  "networkProfileId": 1
}
```

---

## 2. Charging Station Operations APIs

### 2.1 OCPP Message Endpoints

#### Remote Start Transaction

```http
POST /evdriver/2.0.1/RequestStartTransaction
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "idToken": {
      "idToken": "RFID123456",
      "type": "ISO14443"
    },
    "evseId": 1,
    "chargingProfile": {
      "id": 1,
      "chargingProfilePurpose": "TxProfile",
      "chargingProfileKind": "Absolute",
      "chargingSchedule": [
        {
          "id": 1,
          "chargingRateUnit": "W",
          "chargingSchedulePeriod": [
            {
              "startPeriod": 0,
              "limit": 22000.0
            }
          ]
        }
      ]
    }
  },
  "tenantId": 2
}
```

**Response:**

```json
{
  "success": true,
  "payload": {
    "transactionId": "TXN001",
    "status": "Accepted"
  }
}
```

#### Remote Stop Transaction

```http
POST /evdriver/2.0.1/RequestStopTransaction
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "transactionId": "TXN001"
  },
  "tenantId": 2
}
```

#### Get Transaction Status

```http
POST /transactions/2.0.1/GetTransactionStatus
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "transactionId": "TXN001"
  },
  "tenantId": 2
}
```

### 2.2 Station Control Operations

#### Change Availability

```http
POST /configuration/2.0.1/ChangeAvailability
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "evseId": 1,
    "operationalStatus": "Inoperative"
  },
  "tenantId": 2
}
```

#### Trigger Message (for diagnostics)

```http
POST /configuration/2.0.1/TriggerMessage
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "requestedMessage": "StatusNotification",
    "evse": {
      "id": 1,
      "connectorId": 1
    }
  },
  "tenantId": 2
}
```

#### Reset Charging Station

```http
POST /configuration/2.0.1/Reset
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "type": "Immediate"
  },
  "tenantId": 2
}
```

---

## 3. EV Driver Authentication & Authorization APIs

### 3.1 ID Token Management

#### Create Authorization Record

```http
POST /data/authorization?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "idToken": {
    "idToken": "RFID123456",
    "type": "ISO14443"
  },
  "idTokenInfo": {
    "status": "Accepted",
    "cacheExpiryDateTime": "2025-12-31T23:59:59Z",
    "groupIdToken": {
      "idToken": "GROUP001",
      "type": "ISO14443"
    }
  },
  "allowedConnectorTypes": ["cType2", "cCCS2"],
  "disallowedEvseIdPrefixes": ["MAINT"],
  "concurrentTransaction": false
}
```

#### Update Authorization Status

```http
PUT /data/authorization/{authorizationId}?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "idTokenInfo": {
    "status": "Invalid",
    "cacheExpiryDateTime": "2025-01-01T00:00:00Z"
  }
}
```

#### Bulk Authorization Import

```http
POST /data/authorization/bulk?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "authorizations": [
    {
      "idToken": { "idToken": "RFID001", "type": "ISO14443" },
      "idTokenInfo": { "status": "Accepted", "cacheExpiryDateTime": "2025-12-31T23:59:59Z" }
    },
    {
      "idToken": { "idToken": "RFID002", "type": "ISO14443" },
      "idTokenInfo": { "status": "Accepted", "cacheExpiryDateTime": "2025-12-31T23:59:59Z" }
    }
  ]
}
```

### 3.2 Local Authorization List Management

#### Send Local Authorization List to Station

```http
POST /evdriver/2.0.1/SendLocalList
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "listVersion": 1,
    "updateType": "Full",
    "localAuthorizationList": [
      {
        "idToken": {
          "idToken": "RFID123456",
          "type": "ISO14443"
        },
        "idTokenInfo": {
          "status": "Accepted",
          "cacheExpiryDateTime": "2025-12-31T23:59:59Z"
        }
      }
    ]
  },
  "tenantId": 2
}
```

#### Get Local List Version

```http
POST /evdriver/2.0.1/GetLocalListVersion
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {},
  "tenantId": 2
}
```

#### Clear Local Authorization Cache

```http
POST /evdriver/2.0.1/ClearCache
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {},
  "tenantId": 2
}
```

---

## 4. Transaction & Billing Management APIs

### 4.1 Tariff Management

#### Create Tariff for Charging Station

```http
POST /data/tariff?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "stationId": "cp001",
  "currency": "NPR",
  "pricePerKwh": 12.5,
  "pricePerMin": 0.5,
  "pricePerSession": 10.0,
  "authorizationAmount": 100.0,
  "paymentFee": 5.0,
  "taxRate": 0.13
}
```

#### Update Tariff Rates

```http
PUT /data/tariff/{tariffId}?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "pricePerKwh": 15.0,
  "pricePerMin": 0.75,
  "currency": "NPR"
}
```

#### Get Tariff by Station

```http
GET /data/tariff/station/{stationId}?tenantId=2
```

**Response:**

```json
{
  "id": 1,
  "stationId": "cp001",
  "currency": "NPR",
  "pricePerKwh": 12.5,
  "pricePerMin": 0.5,
  "effectiveDate": "2025-01-01T00:00:00Z"
}
```

### 4.2 Transaction Management

#### Get Transaction Details

```http
GET /data/transaction/{transactionId}?tenantId=2
```

**Response:**

```json
{
  "id": 123,
  "transactionId": "TXN001",
  "stationId": "cp001",
  "evseId": 1,
  "idToken": "RFID123456",
  "startedAt": "2025-01-01T10:00:00Z",
  "endedAt": "2025-01-01T11:30:00Z",
  "totalKwh": 25.5,
  "totalCost": 318.75,
  "currency": "NPR",
  "isActive": false
}
```

#### List Active Transactions

```http
GET /data/transaction/active?tenantId=2
```

**Response:**

```json
{
  "activeTransactions": [
    {
      "transactionId": "TXN002",
      "stationId": "cp001",
      "startedAt": "2025-01-01T12:00:00Z",
      "currentKwh": 5.2,
      "currentCost": 65.0,
      "duration": "00:30:15"
    }
  ]
}
```

#### Generate Transaction Report

```http
POST /data/transaction/report?tenantId=2
Content-Type: application/json
```

**Request:**

```json
{
  "startDate": "2025-01-01T00:00:00Z",
  "endDate": "2025-01-31T23:59:59Z",
  "stationIds": ["cp001", "cp002"],
  "format": "csv"
}
```

### 4.3 Cost Management

#### Send Cost Update to Station

```http
POST /transactions/2.0.1/CostUpdated
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "totalCost": 125.5,
    "transactionId": "TXN001"
  },
  "tenantId": 2
}
```

#### Calculate Transaction Cost

```http
POST /data/transaction/calculate-cost
Content-Type: application/json
```

**Request:**

```json
{
  "stationId": "cp001",
  "transactionId": "TXN001",
  "totalKwh": 25.5,
  "tenantId": 2
}
```

**Response:**

```json
{
  "totalCost": 318.75,
  "breakdown": {
    "energyCost": 318.75,
    "timeCost": 45.0,
    "sessionFee": 10.0,
    "tax": 48.6,
    "total": 422.35
  },
  "currency": "NPR"
}
```

---

## 5. Monitoring & Device Management APIs

### 5.1 Device Model Configuration (OCPP 2.0.1)

#### Set Variable Values

```http
POST /monitoring/2.0.1/SetVariables
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "setVariableData": [
      {
        "component": {
          "name": "ClockCtrlr"
        },
        "variable": {
          "name": "DateTime"
        },
        "attributeValue": "2025-01-01T00:00:00Z"
      },
      {
        "component": {
          "name": "ChargingStation"
        },
        "variable": {
          "name": "SupplyPhases"
        },
        "attributeValue": "3"
      }
    ]
  },
  "tenantId": 2
}
```

#### Get Variable Values

```http
POST /monitoring/2.0.1/GetVariables
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "getVariableData": [
      {
        "component": {
          "name": "EVSECtrlr",
          "evse": { "id": 1 }
        },
        "variable": {
          "name": "Power"
        }
      }
    ]
  },
  "tenantId": 2
}
```

#### Set Variable Monitoring

```http
POST /monitoring/2.0.1/SetVariableMonitoring
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "setMonitoringData": [
      {
        "id": 1,
        "transaction": false,
        "value": 25000.0,
        "type": "UpperThreshold",
        "severity": 5,
        "component": {
          "name": "EVSECtrlr",
          "evse": { "id": 1 }
        },
        "variable": {
          "name": "Power"
        }
      }
    ]
  },
  "tenantId": 2
}
```

### 5.2 Reporting & Diagnostics

#### Get Station Report

```http
POST /reporting/2.0.1/GetReport
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "requestId": 123,
    "componentCriteria": ["Active", "Available"],
    "componentVariable": [
      {
        "component": { "name": "EVSECtrlr" },
        "variable": { "name": "Power" }
      }
    ]
  },
  "tenantId": 2
}
```

#### Get Log Files

```http
POST /reporting/2.0.1/GetLog
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "logType": "DiagnosticsLog",
    "requestId": 456,
    "retries": 3,
    "retryInterval": 300
  },
  "tenantId": 2
}
```

#### Get Base Report (Device Model)

```http
POST /reporting/2.0.1/GetBaseReport
Content-Type: application/json
```

**Request:**

```json
{
  "identifier": ["cp001"],
  "request": {
    "requestId": 789,
    "reportBase": "FullInventory"
  },
  "tenantId": 2
}
```

---

## 6. Real-time Operations APIs

### 6.1 WebSocket Subscriptions (via Hasura GraphQL)

#### Subscribe to Station Status Updates

```graphql
subscription StationStatusUpdates($tenantId: Int!) {
  charging_stations(where: { tenantId: { _eq: $tenantId } }) {
    id
    isOnline
    protocol
    connectors {
      connectorId
      status
      lastStatusUpdate
    }
  }
}
```

#### Subscribe to Active Transactions

```graphql
subscription ActiveTransactions($tenantId: Int!) {
  transactions(where: { tenantId: { _eq: $tenantId }, isActive: { _eq: true } }) {
    transactionId
    stationId
    evseId
    startedAt
    totalKwh
    totalCost
    currency
  }
}
```

#### Subscribe to Real-time Meter Values

```graphql
subscription MeterValues($stationId: String!, $tenantId: Int!) {
  meter_values(
    where: { transaction: { stationId: { _eq: $stationId }, tenantId: { _eq: $tenantId } } }
    order_by: { timestamp: desc }
    limit: 10
  ) {
    timestamp
    energyWh
    powerW
    voltageV
    currentA
    temperature
  }
}
```

### 6.2 Fleet Management Dashboards

#### Get Fleet Overview

```http
GET /data/fleet-overview?tenantId=2
```

**Response:**

```json
{
  "summary": {
    "totalStations": 25,
    "onlineStations": 23,
    "activeTransactions": 8,
    "totalEnergyDelivered": 1250.5,
    "totalRevenue": 15631.25,
    "currency": "NPR"
  },
  "stationStatus": [
    {
      "stationId": "cp001",
      "status": "Available",
      "connectors": [{ "id": 1, "status": "Charging", "power": 22000 }]
    }
  ]
}
```

#### Get Station Utilization Report

```http
GET /data/utilization-report?tenantId=2&period=week
```

**Response:**

```json
{
  "period": "2025-01-01 to 2025-01-07",
  "utilizationData": [
    {
      "stationId": "cp001",
      "totalSessions": 45,
      "totalEnergyKwh": 892.5,
      "totalRevenue": 11156.25,
      "averageSessionDuration": "02:15:30",
      "utilizationRate": 0.75
    }
  ]
}
```

---

## 🔑 Authentication & Security

### API Authentication

All API requests require authentication via one of these methods:

#### 1. JWT Bearer Token

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

#### 2. Local Bypass (Development)

```http
X-Tenant-ID: 2
```

### 3. OIDC Integration (Production)

```http
Authorization: Bearer <oidc_access_token>
```

---

## 📊 Error Responses

### Standard Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request payload",
    "details": {
      "field": "idToken",
      "reason": "Required field missing"
    },
    "timestamp": "2025-01-01T10:00:00Z"
  }
}
```

### Common HTTP Status Codes

- **200**: Success
- **201**: Created
- **400**: Bad Request (validation error)
- **401**: Unauthorized (invalid token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found (resource doesn't exist)
- **409**: Conflict (duplicate resource)
- **422**: Unprocessable Entity (business logic error)
- **500**: Internal Server Error

---

## 🚀 Phase 2 Complete Implementation Guide

### **Step 1: Create CPO Infrastructure**

```bash
# 1. Create tenant for Yatri Motorcycles
curl -X POST http://localhost:8080/tenant/create \
  -H "Content-Type: application/json" \
  -d '{"name": "Yatri Motorcycles"}'

# 2. Create first location with charging stations
curl -X POST "http://localhost:8080/data/location?tenantId=2" \
  -H "Content-Type: application/json" \
  -d @location_payload.json
```

### **Step 2: Configure EV Driver Authentication**

```bash
# 3. Create authorization records for RFID tokens
curl -X POST "http://localhost:8080/data/authorization?tenantId=2" \
  -H "Content-Type: application/json" \
  -d @authorization_payload.json

# 4. Send local auth list to stations
curl -X POST http://localhost:8080/evdriver/2.0.1/SendLocalList \
  -H "Content-Type: application/json" \
  -d @local_auth_payload.json
```

### **Step 3: Setup Billing System**

```bash
# 5. Configure tariffs for each station
curl -X POST "http://localhost:8080/data/tariff?tenantId=2" \
  -H "Content-Type: application/json" \
  -d @tariff_payload.json
```

### **Step 4: Test Charging Operations**

```bash
# 6. Remote start transaction
curl -X POST http://localhost:8080/evdriver/2.0.1/RequestStartTransaction \
  -H "Content-Type: application/json" \
  -d @start_transaction_payload.json

# 7. Monitor transaction status
curl -X GET "http://localhost:8080/data/transaction/active?tenantId=2"

# 8. Remote stop transaction
curl -X POST http://localhost:8080/evdriver/2.0.1/RequestStopTransaction \
  -H "Content-Type: application/json" \
  -d @stop_transaction_payload.json
```

### **Step 5: Monitor & Manage Fleet**

```bash
# 9. Get fleet overview
curl -X GET "http://localhost:8080/data/fleet-overview?tenantId=2"

# 10. Setup real-time monitoring via GraphQL subscriptions
# Connect to ws://localhost:8090/v1/graphql for live updates
```

---

**🎉 Phase 2 Achievement**: With these APIs, you can now create multiple CPOs, add locations and chargers, enable EV driver authentication, manage charging transactions, implement billing systems, and provide detailed monitoring - exactly as specified in your Phase 2 goals!
