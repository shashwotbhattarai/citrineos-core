# CitrineOS Glossary

**Last Updated**: December 29, 2025
**Purpose**: Standardized terminology for all documentation
**For Claude**: Use these exact terms when discussing the project

---

## Core OCPP Terminology

### Protocol Entities

| Term                 | Definition                                                                             | Example               |
| -------------------- | -------------------------------------------------------------------------------------- | --------------------- |
| **CSMS**             | Charging Station Management System - the backend server that manages charging stations | CitrineOS is our CSMS |
| **Charging Station** | Physical hardware device that charges EVs. Contains EVSEs and Connectors               | IoCharger AC station  |
| **EVSE**             | Electric Vehicle Supply Equipment - a single charging point within a station           | EVSE ID 1 on station  |
| **Connector**        | Physical plug/socket on an EVSE (Type 1, Type 2, CCS, CHAdeMO)                         | Connector ID 1        |
| **CPO**              | Charge Point Operator - company that owns/operates charging stations                   | Yatri Motorcycles     |
| **eMSP**             | e-Mobility Service Provider - provides charging services to EV drivers                 | Yatri Energy app      |

### Authorization Terms

| Term                         | Definition                                        | OCPP Version | Example                                       |
| ---------------------------- | ------------------------------------------------- | ------------ | --------------------------------------------- |
| **idTag**                    | Authorization identifier (OCPP 1.6 term)          | 1.6 only     | `"D6A3FA03"`                                  |
| **IdToken**                  | Authorization identifier object (OCPP 2.0.1 term) | 2.0.1 only   | `{"idToken": "D6A3FA03", "type": "ISO14443"}` |
| **idToken** (lowercase)      | The actual token value within IdToken object      | 2.0.1        | `"D6A3FA03"`                                  |
| **Authorization**            | Database record linking IdToken to IdTokenInfo    | Both         | Authorization table entry                     |
| **IdTokenInfo**              | Authorization status and metadata                 | Both         | Status, expiry, priority                      |
| **Local Authorization List** | Cached tokens stored on the charging station      | Both         | Enables offline charging                      |

**Usage Rule**:

- When discussing OCPP 1.6: Use `idTag`
- When discussing OCPP 2.0.1: Use `IdToken` (object) or `idToken` (value)
- When discussing database: Use `Authorization`, `IdToken`, `IdTokenInfo` (table names)

### Transaction Terms

| Term                    | Definition                                               | Notes                    |
| ----------------------- | -------------------------------------------------------- | ------------------------ |
| **Transaction**         | A charging session from start to stop                    | Has unique ID            |
| **TransactionEvent**    | OCPP 2.0.1 message for transaction updates               | Started/Updated/Ended    |
| **StartTransaction**    | OCPP 1.6 message to begin charging                       | Returns transactionId    |
| **StopTransaction**     | OCPP 1.6 message to end charging                         | Contains meter data      |
| **MeterValue**          | Energy consumption reading                               | In Wh or kWh             |
| **Offline Transaction** | Transaction that occurred while station was disconnected | Data synced on reconnect |

### Status Terms

| Term              | Meaning                                    | When Used                  |
| ----------------- | ------------------------------------------ | -------------------------- |
| **Available**     | Connector ready for charging               | No vehicle connected       |
| **Preparing**     | Vehicle connected, awaiting authorization  | Cable plugged in           |
| **Charging**      | Active energy transfer                     | Charging in progress       |
| **SuspendedEV**   | Charging paused by vehicle                 | Vehicle battery management |
| **SuspendedEVSE** | Charging paused by station                 | Station limit reached      |
| **Finishing**     | Charging complete, vehicle still connected | Ready to unplug            |
| **Faulted**       | Error condition                            | Requires attention         |
| **Unavailable**   | Station offline or disabled                | Maintenance mode           |

---

## CitrineOS-Specific Terms

### Architecture Terms

| Term           | Definition                                           | Location                                   |
| -------------- | ---------------------------------------------------- | ------------------------------------------ |
| **Module**     | Functional component handling specific OCPP features | `03_Modules/`                              |
| **Repository** | Data access layer for database operations            | `01_Data/src/layers/sequelize/repository/` |
| **Handler**    | Function that processes incoming OCPP messages       | `@AsHandler` decorator                     |
| **MessageApi** | REST API endpoints for sending OCPP commands         | `@AsMessageEndpoint` decorator             |
| **Tenant**     | Multi-tenant isolation unit (CPO)                    | Database `tenantId` field                  |

### Database Terms

| Term                | Table Name         | Purpose                |
| ------------------- | ------------------ | ---------------------- |
| **Tenant**          | `Tenants`          | CPO organization       |
| **Location**        | `Locations`        | Physical charging site |
| **ChargingStation** | `ChargingStations` | Registered station     |
| **EVSE**            | `Evses`            | Charging point         |
| **Connector**       | `Connectors`       | Physical plug          |
| **IdToken**         | `IdTokens`         | Authorization token    |
| **IdTokenInfo**     | `IdTokenInfos`     | Token metadata         |
| **Authorization**   | `Authorizations`   | Token-to-info link     |
| **Transaction**     | `Transactions`     | Charging session       |
| **Tariff**          | `Tariffs`          | Pricing configuration  |

### Configuration Terms

| Term                 | Definition                   | Example                               |
| -------------------- | ---------------------------- | ------------------------------------- |
| **Security Profile** | Authentication level (0-3)   | Profile 1 = Basic Auth                |
| **SystemConfig**     | Central configuration object | `systemConfig.util.networkConnection` |
| **WebSocket Server** | OCPP connection endpoint     | Port 8092 for OCPP 1.6                |

---

## Yatri Energy-Specific Terms

| Term                         | Definition                             | Context                    |
| ---------------------------- | -------------------------------------- | -------------------------- |
| **Yatri Energy Backend**     | Mid-layer API gateway                  | Between apps and CitrineOS |
| **Wallet**                   | User payment balance                   | NPR currency               |
| **Minimum Balance**          | Required balance for offline charging  | Default: NPR 100           |
| **LocalAuthListSyncService** | Service to sync auth lists to chargers | In yatri-energy-backend    |
| **Settlement**               | Payment deduction after charging       | Wallet debit               |

---

## Protocol Version Differences

### Message Names

| Concept             | OCPP 1.6                               | OCPP 2.0.1                   |
| ------------------- | -------------------------------------- | ---------------------------- |
| Start charging      | `RemoteStartTransaction`               | `RequestStartTransaction`    |
| Stop charging       | `RemoteStopTransaction`                | `RequestStopTransaction`     |
| Authorization check | `Authorize`                            | `Authorize` (same)           |
| Station boot        | `BootNotification`                     | `BootNotification` (same)    |
| Status update       | `StatusNotification`                   | `StatusNotification` (same)  |
| Transaction event   | `StartTransaction` / `StopTransaction` | `TransactionEvent`           |
| Send auth list      | `SendLocalList`                        | `SendLocalAuthorizationList` |

### Request Fields

| Field              | OCPP 1.6                  | OCPP 2.0.1                                   |
| ------------------ | ------------------------- | -------------------------------------------- |
| Station identifier | `identifier` query param  | `identifier` query param                     |
| Charging point     | `connectorId` (integer)   | `evseId` (integer)                           |
| Auth token         | `idTag` (string)          | `idToken` (object with `idToken` and `type`) |
| Transaction ref    | `transactionId` (integer) | `transactionId` (string)                     |

---

## API Terminology

### Endpoint Patterns

| Pattern           | Meaning                     | Example                                        |
| ----------------- | --------------------------- | ---------------------------------------------- |
| `/ocpp/1.6/...`   | OCPP 1.6 command endpoint   | `/ocpp/1.6/evdriver/remoteStartTransaction`    |
| `/ocpp/2.0.1/...` | OCPP 2.0.1 command endpoint | `/ocpp/2.0.1/evdriver/requestStartTransaction` |
| `/data/...`       | Data management endpoint    | `/data/configuration/systemConfig`             |
| `?identifier=`    | Target charging station     | `?identifier=yatri-1-ioc-1-sec1`               |
| `?tenantId=`      | Multi-tenant context        | `?tenantId=1`                                  |

### Response Terms

| Term                | Meaning                              |
| ------------------- | ------------------------------------ |
| **Accepted**        | Request accepted by charging station |
| **Rejected**        | Request rejected (check reason)      |
| **NotSupported**    | Feature not supported by station     |
| **Pending**         | Request queued (station offline)     |
| **VersionMismatch** | Local list version conflict          |

---

## Abbreviations

| Abbreviation | Full Form                             |
| ------------ | ------------------------------------- |
| **OCPP**     | Open Charge Point Protocol            |
| **OCPI**     | Open Charge Point Interface (roaming) |
| **CSMS**     | Charging Station Management System    |
| **EVSE**     | Electric Vehicle Supply Equipment     |
| **CPO**      | Charge Point Operator                 |
| **eMSP**     | e-Mobility Service Provider           |
| **RFID**     | Radio Frequency Identification        |
| **NFC**      | Near Field Communication              |
| **TLS**      | Transport Layer Security              |
| **mTLS**     | Mutual TLS (client certificates)      |
| **WS**       | WebSocket                             |
| **WSS**      | WebSocket Secure (TLS)                |
| **NPR**      | Nepalese Rupee                        |
| **kWh**      | Kilowatt-hour                         |
| **Wh**       | Watt-hour                             |
| **VAT**      | Value Added Tax                       |

---

## Common Confusions Clarified

### idTag vs IdToken vs idToken

```
OCPP 1.6:
  idTag = "D6A3FA03"  (simple string)

OCPP 2.0.1:
  IdToken = {         (object)
    idToken: "D6A3FA03",  (the value)
    type: "ISO14443"      (the type)
  }

Database (CitrineOS):
  IdTokens table → stores idToken value and type
  IdTokenInfos table → stores status, expiry, priority
  Authorizations table → links IdToken to IdTokenInfo
```

### Charger vs Station vs EVSE vs Connector

```
ChargingStation (e.g., IoCharger unit)
  └── EVSE 1 (charging point)
        └── Connector 1 (Type 2 plug)
        └── Connector 2 (CCS plug)
  └── EVSE 2 (if dual-port)
        └── Connector 1

In OCPP 1.6: Use "connectorId" (directly references connector)
In OCPP 2.0.1: Use "evseId" + "connectorId" (hierarchical)
```

### Transaction vs Session vs Charging

```
Transaction = Database/billing record
Session = User-facing term for "charging session"
Charging = Physical act of energy transfer

A "charging session" creates a "transaction" which tracks "charging" events.
```

---

## Standard Values for Documentation

Always use these values in examples for consistency:

```yaml
# Tenant
tenantId: 1
tenantName: 'Yatri Motorcycles'

# Charging Stations
ocpp16Station: 'yatri-1-ioc-1-sec1'
ocpp201Station: 'yatri-ac-hw-001'

# Test RFID
rfidToken: 'D6A3FA03'

# Ports
ocpp16Port: 8092
ocpp201Port: 8081
apiPort: 8080
graphqlPort: 8090

# Servers
productionServer: '13.204.177.82'
developmentServer: 'localhost'

# Currency
currency: 'NPR'
vatRate: 0.13
minimumBalance: 100
```

---

**Next**: Read [STATUS.md](./STATUS.md) for implementation status
