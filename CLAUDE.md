# CitrineOS Core - CSMS Backend Documentation

**Last Updated**: February 2, 2026
**For Claude**: This is the entry point. Reference supporting docs for details.

> **ECOSYSTEM CONTEXT**: See [../CLAUDE.md](../CLAUDE.md) for complete ecosystem overview including yatri-energy-dash-frontend, yatri-energy-app, and citrineos-payment.

---

## Quick Reference

### Supporting Documentation

| Document                                                         | Purpose               | When to Use              |
| ---------------------------------------------------------------- | --------------------- | ------------------------ |
| [INDEX.md](./INDEX.md)                                           | Navigation            | Find the right doc       |
| [GLOSSARY.md](./GLOSSARY.md)                                     | Terminology           | Clarify idTag vs IdToken |
| [STATUS.md](./STATUS.md)                                         | Implementation status | Know what's working      |
| [DEPLOYMENT.md](./DEPLOYMENT.md)                                 | AWS RDS/S3/CI-CD      | Infrastructure setup     |
| [API_REFERENCE.md](./API_REFERENCE.md)                           | API documentation     | All endpoints            |
| [OCPP_TROUBLESHOOTING_GUIDE.md](./OCPP_TROUBLESHOOTING_GUIDE.md) | Debug issues          | Common problems          |

### Standard Values (Use These in All Examples)

```yaml
tenantId: 1
ocpp16Station: 'yatri-1-ioc-1-sec1'
ocpp201Station: 'yatri-ac-hw-001'
rfidToken: 'D6A3FA03'
ocpp16Port: 8092
ocpp201Port: 8081
apiPort: 8080
graphqlPort: 8090
productionServer: '13.204.177.82'
currency: 'NPR'
vatRate: 0.13
```

### Quick API Examples

```bash
# OCPP 1.6 Remote Start
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"connectorId": 1, "idTag": "D6A3FA03"}'

# OCPP 1.6 Remote Stop
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStopTransaction?identifier=yatri-1-ioc-1-sec1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"transactionId": 1}'

# Send Local Auth List
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/sendLocalList?identifier=charger1&tenantId=1" \
  -H "Content-Type: application/json" \
  -d '{"listVersion": 1, "updateType": "Full", "localAuthorizationList": [{"idTag": "D6A3FA03", "idTagInfo": {"status": "Accepted"}}]}'
```

---

## Critical: Multi-Tenant Enforcement

**As of January 2026**, all database operations REQUIRE explicit `tenantId`. Missing tenantId throws an error.

**File**: `01_Data/src/layers/sequelize/model/BaseModelWithTenant.ts`

```bash
# CORRECT
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction?identifier=charger-1&tenantId=1"

# WRONG - will fail
curl -X POST "http://localhost:8080/ocpp/1.6/evdriver/remoteStartTransaction?identifier=charger-1"
```

```graphql
# CORRECT
mutation {
  insert_Locations_one(object: { name: "New Location", tenantId: 1 }) {
    id
  }
}

# WRONG - will fail
mutation {
  insert_Locations_one(object: { name: "New Location" }) {
    id
  }
}
```

### WebSocket Tenant Routing

Each WebSocket server is configured with a specific `tenantId`. Chargers on that port authenticate against that tenant.

**Config**: `Server/src/config/envs/*.ts` → `websocketServers` array

```json
[
  { "port": 8092, "tenantId": 1, "protocol": "ocpp1.6", "securityProfile": 1 },
  { "port": 8093, "tenantId": 2, "protocol": "ocpp1.6", "securityProfile": 1 }
]
```

---

## API Authentication

The HTTP API (port 8080) supports three authentication providers, configured via `util.authProvider` in `config.json`. Only one should be active at a time.

### Provider Options

| Provider         | Config Key    | Use Case                                                     |
| ---------------- | ------------- | ------------------------------------------------------------ |
| **API Key**      | `apiKey`      | Production — service-to-service auth (mid-layer → CitrineOS) |
| **OIDC**         | `oidc`        | Multi-user auth via OpenID Connect provider                  |
| **Local Bypass** | `localByPass` | Development only — skips all auth                            |

### API Key Authentication (Recommended for Production)

Validates requests using a shared secret sent via the `X-API-Key` header. Designed for service-to-service communication where only the mid-layer (yatri-energy-backend) calls CitrineOS APIs.

**Config** (`config.json`):

```json
"authProvider": {
  "apiKey": "your-strong-secret-key-here"
}
```

**Client usage** (mid-layer sends this header with every request):

```
X-API-Key: your-strong-secret-key-here
```

**Swagger UI**: Click the "Authorize" button → paste the API key → all requests include the header automatically.

**Excluded routes** (no auth required): `/health`, `/docs`

### Key Files

| File                                                            | Purpose                                  |
| --------------------------------------------------------------- | ---------------------------------------- |
| `02_Util/src/authorization/provider/ApiKeyAuthProvider.ts`      | API Key provider implementation          |
| `02_Util/src/authorization/provider/OIDCAuthProvider.ts`        | OIDC provider implementation             |
| `02_Util/src/authorization/provider/LocalByPassAuthProvider.ts` | Development bypass provider              |
| `02_Util/src/authorization/ApiAuthPlugin.ts`                    | Fastify plugin — global `onRequest` hook |
| `00_Base/src/config/types.ts`                                   | Zod schema for `authProvider` config     |
| `Server/src/index.ts` → `initApiAuthProvider()`                 | Provider selection logic                 |

---

## Critical Fixes Reference

### IdToken Case Normalization (Jan 15, 2026)

All idTokens are normalized to **lowercase** at entry points. Store tokens in lowercase in database.

**Files Changed**:

- `03_Modules/EVDriver/src/module/module.ts` - Authorize handlers
- `03_Modules/Transactions/src/module/module.ts` - Transaction handlers
- `03_Modules/EVDriver/src/module/1.6/MessageApi.ts` - RemoteStart API
- `02_Util/src/yatri/YatriEnergyClient.ts` - Wallet API calls

### Cross-Tenant Security Fix (Jan 13, 2026)

**File**: `01_Data/src/layers/sequelize/repository/Base.ts`

All repository methods now properly filter by `tenantId`. IdTokens from tenant 1 no longer work on tenant 4 chargers.

### Tariff-Connector Relationship (Critical for Billing)

**Key Distinction**:

- `Connector.connectorId` = OCPP connector number (1, 2) - what charger sends
- `Connector.id` = Database primary key - what Tariff references

When creating Tariff, set `connectorId` to **Connector.id (database ID)**, NOT the OCPP connector number.

**File**: `01_Data/src/layers/sequelize/repository/TransactionEvent.ts`

```graphql
# Step 1: Create/Get Connector
mutation {
  insert_Connectors_one(object: { tenantId: 4, stationId: "Anari001", connectorId: 1 }) {
    id
  }
}
# Returns: { "id": 6 }

# Step 2: Create Tariff with database ID
mutation {
  insert_Tariffs_one(
    object: { tenantId: 4, stationId: "Anari001", connectorId: 6, pricePerKwh: 50 }
  ) {
    id
  }
}
```

### Multi-Tenant Unique Constraints (Jan 13, 2026)

Components and Variables tables now include `tenantId` in unique constraints, allowing multiple tenants to have same component/variable names.

**Migration Files**:

- `migrations/20260113080000-fix-components-unique-constraint.ts`
- `migrations/20260113091800-fix-variables-unique-constraint.ts`

---

## Project Overview

OCPP 2.0.1 and 1.6 compliant Charging Station Management System (CSMS) for Yatri Motorcycles.

**Production Status**:

- Multi-Protocol: OCPP 1.6 (port 8092), OCPP 2.0.1 (port 8081)
- Security Profile 1: Basic Authentication on AWS (13.204.177.82)
- Real Hardware: IoCharger AC stations with RFID cards
- Billing: High-precision NPR calculations with 13% VAT

**Ecosystem Integration**:

- Yatri Energy Backend: Mid-layer API gateway (primary interface)
- yatri-energy-dash-frontend: Multi-CPO admin dashboard
- yatri-energy-app: Customer EMSP mobile application

---

## Development Environment

### Docker Commands

```bash
cd Server

# Production (AWS RDS + S3)
docker compose up -d

# Local Development (PostgreSQL + MinIO)
docker compose -f docker-compose-local.yml up -d

# View logs
docker compose logs -f citrine

# Check status
docker compose ps
```

### Services

| Service        | URL                        | Credentials           |
| -------------- | -------------------------- | --------------------- |
| CitrineOS API  | http://localhost:8080/docs | -                     |
| Hasura GraphQL | http://localhost:8090      | -                     |
| RabbitMQ       | http://localhost:15672     | guest/guest           |
| PostgreSQL     | localhost:5432             | citrine/citrine       |
| MinIO S3       | http://localhost:9001      | minioadmin/minioadmin |

### Environment Files

| File                       | Purpose                             |
| -------------------------- | ----------------------------------- |
| `.env`                     | Production credentials (gitignored) |
| `.env.example`             | Template for new deployments        |
| `docker-compose.yml`       | Production (RDS + S3 + Watchtower)  |
| `docker-compose-local.yml` | Local development                   |

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed AWS RDS, S3, and CI/CD setup.

---

## Architecture Overview

```
Server/src/index.ts          - Fastify HTTP + WebSocket OCPP servers
03_Modules/                   - Feature modules (EVDriver, Transactions, etc.)
01_Data/                      - Sequelize ORM, repositories, models
02_Util/                      - WebSocket, RabbitMQ, S3, caching
00_Base/                      - OCPP types, Money class, interfaces
```

### Database Schema

```
Tenant → Location → ChargingStation → Evse → Connector
                          ↓
                    Transaction → TransactionEvent → MeterValue
                          ↓
                    IdToken → Authorization → IdTokenInfo
                          ↓
                        Tariff
```

### Authorization System (3-Table Model)

```
IdTokens (token value, type)
    → Authorizations (link table)
        → IdTokenInfos (status, priority, expiry)
```

See [RFID_CARD_CREATION_GUIDE.md](./RFID_CARD_CREATION_GUIDE.md) for complete creation process.

---

## Wallet Integration

CitrineOS operates as a **black box CSMS**. Yatri Energy Backend handles wallet logic.

**Integration Points**:

- `03_Modules/Transactions/src/module/TransactionService.ts:224-229` - RFID auth + wallet check
- `03_Modules/EVDriver/src/module/1.6/MessageApi.ts:47-67` - Remote start validation
- `03_Modules/Transactions/src/module/module.ts:734-735` - Transaction settlement
- `02_Util/src/yatri/YatriEnergyClient.ts` - HTTP client for wallet APIs

**Configuration**:

```typescript
yatriEnergy: {
  baseUrl: 'http://13.235.140.91/dev',
  apiKey: process.env.YATRI_ENERGY_API_KEY,
  timeout: 10000
}
```

See [YATRI_WALLET_INTEGRATION.md](./YATRI_WALLET_INTEGRATION.md) for detailed flow.

---

## Health Check API

**Endpoint**: `GET /health`

```json
// Healthy
{ "status": "healthy", "database": "connected", "rabbitmq": "connected", "s3": "connected" }

// Unhealthy
{ "status": "unhealthy", "database": "connected", "rabbitmq": "disconnected", "s3": "connected", "errors": ["RabbitMQ connection failed"] }
```

Used by Docker healthcheck to determine container readiness.

---

## Key Code Locations

| Component             | Path                                                       |
| --------------------- | ---------------------------------------------------------- |
| OCPP Message Handlers | `03_Modules/*/src/module/module.ts`                        |
| Transaction Service   | `03_Modules/Transactions/src/module/TransactionService.ts` |
| EVDriver APIs         | `03_Modules/EVDriver/src/module/1.6/MessageApi.ts`         |
| Data Models           | `01_Data/src/layers/sequelize/model/`                      |
| Repositories          | `01_Data/src/layers/sequelize/repository/`                 |
| Configuration         | `Server/src/config/envs/`                                  |
| WebSocket Config      | `Server/src/config/envs/*.ts` → `websocketServers`         |

---

## Common Troubleshooting

### Authorization Failures

**Error**: `Found invalid authorizations [] for idToken`

**Solution**: Create proper 3-table authorization entries. See [RFID_CARD_CREATION_GUIDE.md](./RFID_CARD_CREATION_GUIDE.md).

### "Call Already in Progress" Error

**Cause**: Multi-connector chargers send simultaneous OCPP messages.

**Impact**: Low - only affects StatusNotification (informational).

See [OCPP_TROUBLESHOOTING_GUIDE.md](./OCPP_TROUBLESHOOTING_GUIDE.md) for details.

### Migration Failures

**Error**: `Unknown constraint error`

**Solution**: Ensure PostGIS extension is installed:

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

Or reset database if migration failed partway:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
CREATE EXTENSION IF NOT EXISTS postgis;
```

---

## Git Configuration

**Main Branch**: `main`
**Active Branch**: `push-to-queue`
**CI/CD Branch**: `cicd` (triggers GitHub Actions → Docker Hub → Watchtower)

```bash
# Keep synchronized with upstream
git fetch upstream
git checkout main
git merge upstream/main
```

---

## Documentation Index

### Core Guides

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture
- [API_REFERENCE.md](./API_REFERENCE.md) - All API endpoints
- [GOING_TO_PRODUCTION_V2.md](./GOING_TO_PRODUCTION_V2.md) - Production deployment

### Protocol Guides

- [OCPP_VERSION_COMPATIBILITY.md](./OCPP_VERSION_COMPATIBILITY.md) - 1.6 vs 2.0.1 differences
- [OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md](./OCPP_1.6_OFFLINE_TRANSACTIONS_GUIDE.md) - Offline handling

### Hardware Integration

- [REAL_HARDWARE_INTEGRATION_OCPP_1.6.md](./REAL_HARDWARE_INTEGRATION_OCPP_1.6.md) - IoCharger 1.6
- [REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md](./REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md) - IoCharger 2.0.1
- [RFID_CARD_CREATION_GUIDE.md](./RFID_CARD_CREATION_GUIDE.md) - Authorization setup

### Troubleshooting

- [OCPP_TROUBLESHOOTING_GUIDE.md](./OCPP_TROUBLESHOOTING_GUIDE.md) - Debug guide
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Infrastructure issues
