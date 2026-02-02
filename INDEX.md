# CitrineOS Documentation Index

**Last Updated**: February 2, 2026
**Purpose**: Central navigation for all CitrineOS documentation
**For Claude**: Start here to understand documentation structure

---

## Quick Navigation

### By Task

| I want to...                       | Read this                                                                          |
| ---------------------------------- | ---------------------------------------------------------------------------------- |
| **Understand the project**         | [CLAUDE.md](./CLAUDE.md)                                                           |
| **Set up development environment** | [README.md](./README.md) → Docker Compose section                                  |
| **Deploy to production**           | [GOING_TO_PRODUCTION_V2.md](./GOING_TO_PRODUCTION_V2.md)                           |
| **AWS RDS/S3/CI-CD setup**         | [DEPLOYMENT.md](./DEPLOYMENT.md)                                                   |
| **Connect real hardware**          | [REAL_HARDWARE_INTEGRATION_OCPP_1.6.md](./REAL_HARDWARE_INTEGRATION_OCPP_1.6.md)   |
| **Create RFID cards**              | [RFID_CARD_CREATION_GUIDE.md](./RFID_CARD_CREATION_GUIDE.md)                       |
| **Integrate wallet payments**      | [YATRI_WALLET_INTEGRATION.md](./YATRI_WALLET_INTEGRATION.md)                       |
| **Payment queue (RabbitMQ)**       | [PAYMENT_QUEUE_INTEGRATION.md](./PAYMENT_QUEUE_INTEGRATION.md)                     |
| **Handle offline charging**        | [OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md](./OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md) |
| **Debug OCPP issues**              | [OCPP_TROUBLESHOOTING_GUIDE.md](./OCPP_TROUBLESHOOTING_GUIDE.md)                   |
| **Understand OCPP 1.6 vs 2.0.1**   | [OCPP_VERSION_COMPATIBILITY.md](./OCPP_VERSION_COMPATIBILITY.md)                   |
| **Find API endpoints**             | [API_REFERENCE.md](./API_REFERENCE.md)                                             |
| **Understand system config**       | [SYSTEM_CONFIG_API_DOCUMENTATION.md](./SYSTEM_CONFIG_API_DOCUMENTATION.md)         |

---

## Document Hierarchy

```
CLAUDE.md                          [ENTRY POINT - Read First]
│
├── Core Documentation
│   ├── INDEX.md                   [This file - Navigation]
│   ├── GLOSSARY.md                [Terminology definitions]
│   ├── STATUS.md                  [Implementation status]
│   └── ARCHITECTURE.md            [System design]
│
├── Setup & Deployment
│   ├── README.md                  [Official CitrineOS setup]
│   ├── DEPLOYMENT.md              [AWS RDS/S3/CI-CD] ⭐
│   └── GOING_TO_PRODUCTION_V2.md  [Production deployment]
│
├── Protocol Guides
│   ├── OCPP_VERSION_COMPATIBILITY.md     [1.6 vs 2.0.1 differences]
│   ├── OCPP_1.6_SECURITY_PROFILE_1_API_REFERENCE.md  [Security Profile 1]
│   └── SEQUENCE_DIAGRAMS.md              [Message flows]
│
├── Hardware Integration
│   ├── REAL_HARDWARE_INTEGRATION_OCPP_1.6.md    [IoCharger OCPP 1.6]
│   ├── REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md  [IoCharger OCPP 2.0.1]
│   └── RFID_CARD_CREATION_GUIDE.md              [Authorization setup]
│
├── Feature Guides
│   ├── YATRI_WALLET_INTEGRATION.md              [Wallet balance & payments]
│   ├── OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md   [Offline charging]
│   └── ADVANCED_OPERATIONS.md                   [Billing, tariffs, offline]
│
├── API Reference
│   ├── API_REFERENCE.md                         [All endpoints]
│   └── SYSTEM_CONFIG_API_DOCUMENTATION.md       [Configuration APIs]
│
├── Troubleshooting
│   └── OCPP_TROUBLESHOOTING_GUIDE.md            [Common issues]
│
└── Reference
    └── ocpp-2.0.1-whitepaper.md   [OCPP spec summary]
```

---

## Document Relationships

### Authorization & RFID

```
RFID_CARD_CREATION_GUIDE.md
    ↓ uses
YATRI_WALLET_INTEGRATION.md (wallet balance check)
    ↓ enables
OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md (Local Auth List)
```

### Hardware Integration

```
GOING_TO_PRODUCTION_V2.md (initial setup)
    ↓ then
REAL_HARDWARE_INTEGRATION_OCPP_1.6.md (connect charger)
    ↓ with
OCPP_1.6_SECURITY_PROFILE_1_API_REFERENCE.md (secure connection)
```

### Offline Operations

```
OCPP_VERSION_COMPATIBILITY.md (understand protocol differences)
    ↓ then
OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md (OCPP 1.6 specific)
    ↓ or
ADVANCED_OPERATIONS.md (OCPP 2.0.1 specific)
```

---

## Standard Identifiers (Use These in Examples)

To maintain consistency across all documentation:

| Entity                 | Standard Value       | Notes                             |
| ---------------------- | -------------------- | --------------------------------- |
| **Tenant ID**          | `1`                  | Default Yatri tenant              |
| **OCPP 1.6 Station**   | `yatri-1-ioc-1-sec1` | IoCharger with Security Profile 1 |
| **OCPP 2.0.1 Station** | `yatri-ac-hw-001`    | IoCharger OCPP 2.0.1              |
| **Test RFID Token**    | `D6A3FA03`           | Physical card for testing         |
| **OCPP 1.6 Port**      | `8092`               | WebSocket server                  |
| **OCPP 2.0.1 Port**    | `8081`               | WebSocket server                  |
| **API Port**           | `8080`               | REST/GraphQL                      |
| **GraphQL Port**       | `8090`               | Hasura                            |
| **AWS Server**         | `13.204.177.82`      | Production                        |
| **Local Server**       | `localhost`          | Development                       |

---

## API Quick Reference

### OCPP 1.6 Core APIs

```bash
# Remote Start
POST /ocpp/1.6/evdriver/remoteStartTransaction?identifier={station}&tenantId=1
Body: {"connectorId": 1, "idTag": "D6A3FA03"}

# Remote Stop
POST /ocpp/1.6/evdriver/remoteStopTransaction?identifier={station}&tenantId=1
Body: {"transactionId": 123}

# Get Configuration
POST /ocpp/1.6/configuration/getConfiguration?identifier={station}&tenantId=1
Body: {}

# Send Local Auth List
POST /ocpp/1.6/evdriver/sendLocalList?identifier={station}&tenantId=1
Body: {"listVersion": 1, "updateType": "Full", "localAuthorizationList": [...]}
```

### Data APIs (GraphQL)

```bash
# Hasura GraphQL endpoint
POST http://localhost:8090/v1/graphql
Content-Type: application/json

# Example: Get all charging stations
{"query": "query { ChargingStations { id stationId isOnline } }"}
```

---

## File Status Legend

| Symbol | Meaning                        |
| ------ | ------------------------------ |
| ⭐     | Recommended / Primary document |
| ✅     | Production ready, tested       |
| 🔄     | In development                 |
| ⚠️     | Needs update                   |
| ❌     | Deprecated                     |

---

## For Claude Code

When helping with this project:

1. **Start with CLAUDE.md** for project context
2. **Check STATUS.md** to know what's implemented vs planned
3. **Use GLOSSARY.md** for consistent terminology
4. **Reference this INDEX.md** to find relevant documentation
5. **Use standard identifiers** (tenant ID 1, port 8092, etc.)
6. **Check OCPP_VERSION_COMPATIBILITY.md** before suggesting OCPP code

### Key Code Locations

| Component             | Path                                                       |
| --------------------- | ---------------------------------------------------------- |
| OCPP Message Handlers | `03_Modules/*/src/module/module.ts`                        |
| Transaction Service   | `03_Modules/Transactions/src/module/TransactionService.ts` |
| EVDriver APIs         | `03_Modules/EVDriver/src/module/1.6/MessageApi.ts`         |
| Data Models           | `01_Data/src/layers/sequelize/model/`                      |
| Configuration         | `Server/src/config/envs/local.ts`                          |
| Server Entry          | `Server/src/index.ts`                                      |

---

## Related Documentation (External)

- **OCPP 1.6 Specification**: `../Ocpp Docs/OCPP_1.6_documentation_2019_12/`
- **OCPP 2.0.1 Specification**: `../Ocpp Docs/OCPP-2.0.1_all_files/`
- **OCPI 2.2.1**: `../Ocpp Docs/OCPI-2.2.1-d2.pdf`
- **Workspace Overview**: `../CLAUDE.md` (ecosystem-level documentation)

---

**Next**: Read [GLOSSARY.md](./GLOSSARY.md) for terminology definitions
