# CitrinOS Development Setup - CLAUDE.md

## Project Overview

This is a OCPP 2.0.1 and 1.6 compliant Charging Station Management System (CSMS) for Yatri Motorcycles' EV charging infrastructure. The system runs on an OCPI layer and manages a fleet of charging stations as the primary CPO (Charge Point Operator).

## Current Setup Status

✅ **CitrinOS Core Running Successfully**

- All Docker services are healthy and operational
- Fixed TypeScript compilation issues
- Node.js v22.18.0 compatibility verified

## Services Running

- **CitrinOS API**: http://localhost:8080/docs (Swagger UI)
- **RabbitMQ Management**: http://localhost:15672 (guest/guest)
- **PostgreSQL Database**: localhost:5432 (citrine/citrine)
- **MinIO S3 Storage**: http://localhost:9001 (minioadmin/minioadmin)
- **Hasura GraphQL**: http://localhost:8090

## Development Environment

- **Platform**: macOS (Darwin 24.5.0)
- **Node.js**: v22.18.0 (managed via nvm)
- **Docker**: v27.4.0
- **Architecture**: x86_64

## Key Files Modified

- `02_Util/src/util/directus.ts:139` - Fixed Buffer to Blob conversion for TypeScript compatibility

## Docker Compose Commands

```bash
# Start all services
cd Server
docker compose -f docker-compose.yml up -d

# Stop all services
docker compose -f docker-compose.yml down

# View logs
docker logs server-citrine-1
docker logs server-amqp-broker-1
```

## Future RAG System Plans

- **Goal**: Enhance Claude Code with OCPP/OCPI documentation context
- **Components**:
  - Vector database (Chroma/FAISS) for document storage
  - OCPP 2.0.1/1.6 white papers ingestion
  - CitrinOS codebase indexing
  - Claude Code integration for enhanced context

## OCPP/OCPI Documentation Sources

- OCPP 2.0.1 white papers (to be loaded)
- OCPP 1.6 specifications (to be loaded)
- OCPI white papers (to be loaded)
- CitrinOS documentation and codebase

## Architecture Notes

- CitrinOS uses TypeScript with Fastify web framework
- WebSocket connections for OCPP communication
- PostgreSQL for persistence with Sequelize ORM
- RabbitMQ for message brokering
- Docker containerized deployment

## Development Workflow

1. Make code changes in the mounted volumes
2. Docker will auto-rebuild on significant changes
3. Use `docker logs` to monitor application output
4. Access APIs via Swagger UI for testing

## API Documentation Access

### Swagger UI & API Exploration

- **Swagger UI**: http://localhost:8080/docs (visual interface)
- **Swagger JSON**: http://localhost:8080/docs/json (programmatic access)

### Programmatic API Documentation Commands

```bash
# Get all API endpoints
curl -s http://localhost:8080/docs/json | jq '.paths | keys[]'

# Find specific endpoints (e.g., OCPP 1.6 remote operations)
curl -s http://localhost:8080/docs/json | jq '.paths | keys[]' | grep -i remote

# Get detailed endpoint schema
curl -s http://localhost:8080/docs/json | jq '.paths."/ocpp/1.6/evdriver/remoteStartTransaction".post'

# Get request body schema
curl -s http://localhost:8080/docs/json | jq '.components.schemas.RemoteStartTransactionRequest'

# Get all OCPP 1.6 endpoints
curl -s http://localhost:8080/docs/json | jq '.paths | keys[]' | grep "1.6"

# Get all OCPP 2.0.1 endpoints  
curl -s http://localhost:8080/docs/json | jq '.paths | keys[]' | grep "2.0.1"
```

### API Endpoint Patterns

**OCPP 1.6 Format:**
```
POST /ocpp/1.6/evdriver/remoteStartTransaction?identifier=STATION_ID&tenantId=1
Content-Type: application/json
{
  "connectorId": 1,
  "idTag": "RFID_TOKEN"
}
```

**OCPP 2.0.1 Format:**
```
POST /ocpp/2.0.1/evdriver/requestStartTransaction?identifier=STATION_ID&tenantId=1
Content-Type: application/json
{
  "evseId": 1, 
  "idToken": {"idToken": "RFID_TOKEN", "type": "ISO14443"}
}
```

## 📚 Session Documentation & Context

### Technical Deep Dive Documentation

- **ADVANCED_OPERATIONS.md** - August 22, 2025 session covering:
  - Local Authorization Lists for offline charging
  - Offline transaction handling and data synchronization
  - Wallet balance integration patterns
  - Billing and tariffs configuration with high-precision calculations
  - Business implementation strategies for Yatri
  - Technical implementation details and monitoring
- **OCPP_VERSION_COMPATIBILITY.md** - Critical reference for OCPP 1.6 vs 2.0.1 differences
  - Feature compatibility matrix and limitations
  - Protocol-specific implementation patterns
  - Mixed environment testing strategy

### Previous Session Context

- **ARCHITECTURE.md** - Complete system architecture analysis
- **SEQUENCE_DIAGRAMS.md** - OCPP flow documentation with mermaid diagrams
- **API_REFERENCE.md** - Complete API documentation with curl examples
- **GOING_TO_PRODUCTION.md** - Original implementation guide
- **GOING_TO_PRODUCTION_V2.md** - **UPDATED** - Advanced implementation guide with OCPP compatibility

## Latest Session Progress & Context (August 22, 2025)

### ✅ Advanced Concepts Deep Dive Completed

1. **Local Authorization Lists Analysis**

   - OCPP 2.0.1 offline charging mechanisms
   - Business use cases for Yatri's network resilience
   - CitrineOS implementation patterns and database design

2. **Offline Transaction Handling**

   - Complete protocol flow for CSMS disconnection scenarios
   - Data synchronization and sequence validation
   - Revenue protection and billing accuracy for offline operations

3. **Wallet Balance Integration Strategy**

   - Authorization hold model for transaction start
   - Real-time monitoring and automatic transaction stopping
   - Final settlement and reconciliation patterns

4. **Billing and Tariffs Configuration** _(Extended Session)_

   - High-precision Money class financial calculations
   - Multi-tier pricing strategy (AC/DC Fast/Ultra-Fast)
   - Real-time cost calculation engine implementation
   - Revenue analytics and dynamic pricing optimization
   - API integration patterns and best practices

5. **OCPP Version Compatibility Analysis** _(Critical Update)_

   - Complete feature compatibility matrix for OCPP 1.6 vs 2.0.1
   - Protocol-specific implementation patterns and limitations
   - Mixed environment testing and deployment strategies
   - Business impact analysis for version differences

6. **Production Implementation Guide Update** _(Complete Revision)_

   - Updated GOING_TO_PRODUCTION_V2.md with all advanced concepts
   - Protocol-aware implementation steps and testing procedures
   - Advanced billing, offline operations, and wallet integration
   - Comprehensive monitoring and business intelligence setup

7. **Technical Documentation Created**
   - **ADVANCED_OPERATIONS.md** - Comprehensive deep dive with technical implementation details
   - **OCPP_VERSION_COMPATIBILITY.md** - Critical reference for protocol differences and limitations
   - **GOING_TO_PRODUCTION_V2.md** - Complete updated implementation guide with advanced features
   - Business patterns specific to Yatri Motorcycles use cases
   - Complete billing system architecture with high-precision calculations
   - Protocol-aware service architectures and testing strategies
   - Next session preparation and action items

## Previous Session Context (August 20, 2025)

### ✅ Session Achievements

1. **CitrinOS Setup Complete**

   - Fixed TypeScript compilation error in `directus.ts`
   - All Docker services running and healthy
   - Hasura metadata consistency issues resolved
   - Operator interface accessible at localhost:8090

2. **Documentation Discovery**
   - Located comprehensive OCPP docs in `/Desktop/Ocpp/`
   - OCPP 2.0.1 complete specs with JSON schemas
   - OCPP 1.6 documentation and schemas
   - OCPI 2.2.1 and 2.3.0 specifications
   - Decision: Keep docs local for immediate access

### 🗺️ Comprehensive Development Roadmap

**Phase 1: Foundation & Architecture**

- [ ] Explore Fastify architecture and APIs in CitrinOS
- [ ] Understand envs, configs, and db seeds setup
- [ ] Document data models and variables structure
- [ ] Create class diagrams and explain CitrinOS codebase

**Phase 2: Core CSMS Features**

- [ ] At the end of this session i must able to start creating multiple cpos, add locations and chargers into them, allow ev drivers to authenticate and charge their vehicle, transaction and billing management and deatiled monitoring.
- [ ] Understand essential CSMS features (CPOs, locations, fleet management)
- [ ] Understand charger authentication system
- [ ] Understand evdriver auth and id token mangement
- [ ] Understand charging operations (start/pause/stop)
- [ ] Understand remote charging operations (start/pause/stop)
- [ ] Understand transaction and billing system
- [ ] Create sequence diagrams for all features with OCPP context till database layer
- [ ] List out all the required apis and data payloads sequencially, this goes hand in hand with creating sequence diagrams

**Phase 3: Standards Integration**

- [ ] Integrate OCPI layer and EMSP functionality

**Phase 4: Testing & Production**

- [ ] Test with actual OCPP 1.6 and 2.0.1 chargers
- [ ] Build custom operator UI and EMSP app with Hasura integration

### 🎯 Current Goal

Connect one OCPP 2.0.1 and one OCPP 1.6 charger to the running CitrinOS server and manage through operator interface.

### 🔧 Key Technical Details Discovered

**Fastify Implementation:**

- TypeScript-first with `JsonSchemaToTsProvider`
- Automatic JSON schema validation via AJV
- Plugin architecture (CORS, Auth, etc.)
- Decorator-based endpoints with `@AsMessageEndpoint`

**API Structure:**

- OCPP 2.0.1 APIs: Certificates, Configuration, EVDriver, Monitoring, Reporting, SmartCharging, Transactions
- OCPP 1.6 APIs: Configuration, EVDriver (legacy support)
- Data Management APIs: CRUD operations for all entities
- Admin APIs: System administration

**Current Services:**

- CitrinOS API: http://localhost:8080/docs
- RabbitMQ Management: http://localhost:15672
- PostgreSQL: localhost:5432 (citrine/citrine)
- Hasura GraphQL: http://localhost:8090
- MinIO S3: http://localhost:9001

## 🚀 **PRODUCTION IMPLEMENTATION COMPLETED** (August 25, 2025)

### ✅ **Real Hardware Integration Completed** (Latest Session - August 25, 2025)

**🎯 Major Milestone**: Successfully integrated physical IoCharger AC station with CitrineOS CSMS!

#### **Real Hardware Integration Achievements:**

- ✅ **Physical IoCharger AC Station**: `yatri-ac-hw-001` connected via OCPP 2.0.1
- ✅ **Stable WebSocket Connection**: `ws://192.168.10.158:8081/yatri-ac-hw-001`
- ✅ **OCPP Communication**: Regular heartbeats (60s), WebSocket pings (30s)
- ✅ **Transaction Testing**: Start/stop transactions with real hardware
- ✅ **Authorization Validated**: Both RFID and mobile tokens working
- ✅ **Connection Stability**: Multiple rapid requests handled without disconnection
- ✅ **Physical RFID Integration**: Real RFID card `D6A3FA03` added and operational
- ✅ **One-Tap Charging**: Direct tap-to-charge functionality working
- ✅ **Configuration Documented**: Complete IoCharger setup guide with RFID templates

**Critical Issue Resolved**:

- **Root Cause**: `HeartbeatInterval=0` and `OCPPCommCtrlr=False` causing disconnections
- **Solution**: Proper OCPP communication parameters configured
- **Result**: Stable 15+ minute continuous operation with full transaction support

**📋 Documentation**: Complete session documented in `REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md`

### ✅ **OCPP 1.6 Hardware Integration Completed** (Latest Session - September 8, 2025)

**🎯 Major Milestone**: Successfully integrated physical IoCharger AC station with OCPP 1.6 protocol!

#### **OCPP 1.6 Integration Achievements:**

- ✅ **Protocol Configuration**: IoCharger firmware switched from 2.0.1 to 1.6
- ✅ **WebSocket Connection**: `ws://192.168.1.136:8092/yatri-legacy-16-001` (port 8092 for 1.6)
- ✅ **OCPP 1.6 Communication**: BootNotification, Heartbeat (60s), StatusNotification
- ✅ **RFID Authorization**: Physical card `12DD941C` working with "Accepted" status
- ✅ **Remote Operations**: RemoteStartTransaction API endpoint functional
- ✅ **Database Integration**: Same 3-table authorization model as OCPP 2.0.1
- ✅ **API Documentation**: Complete Swagger JSON access methods documented

**Critical Discovery**:

- **Port Separation**: OCPP 1.6 uses port 8092, OCPP 2.0.1 uses port 8081
- **Protocol Detection**: CitrineOS automatically detects and routes based on WebSocket port
- **Dual Protocol Support**: Single CitrineOS instance supports both protocols simultaneously

**Key Differences Identified:**
```
OCPP 1.6: RemoteStartTransaction (connectorId, idTag)
OCPP 2.0.1: RequestStartTransaction (evseId, idToken object)
```

**📋 Documentation**: Session documented in `REAL_HARDWARE_INTEGRATION_OCPP_1.6.md`

### ✅ **Yatri CSMS Infrastructure Successfully Deployed**

**Real Database Structure Discovered & Implemented:**

#### **Authorization System (3-Table Relational Model)**

```
IdTokens → IdTokenInfos → Authorizations
```

**Discovery**: CitrineOS uses sophisticated relational authorization model, NOT single-table approach initially assumed.

- **IdTokens Table**: Stores actual tokens (`idToken`, `type`, `tenantId`)
- **IdTokenInfos Table**: Authorization metadata (`status`, `chargingPriority`, `language1/2`, `cacheExpiryDateTime`)
- **Authorizations Table**: Links tokens to metadata (`idTokenId`, `idTokenInfoId`, `concurrentTransaction`)

#### **Complete Infrastructure Created:**

**✅ Tenant**: Yatri Motorcycles (ID: 3)  
**✅ Location**: Yatri Kathmandu Charging Hub (ID: 2)

- Address: New Baneshwor, Kathmandu, 44600, Nepal

**✅ Charging Stations**:

- `yatri-ktm-001` (OCPP 2.0.1 capable)
- `yatri-legacy-001` (OCPP 1.6 legacy support)

**✅ Authorization Tokens Created**:

- **Walk-in RFID**: `YATRI-WALK-001234` (ISO14443, Nepali language, Priority 5)
- **Mobile App**: `YATRI-APP-5678` (KeyCode, English language, Priority 3)

**✅ Billing System Configured**:

- **Energy Cost**: NPR 15.00/kWh
- **Time Cost**: NPR 1.00/minute
- **Session Fee**: NPR 25.00
- **Pre-Authorization**: NPR 500.00
- **Payment Processing**: NPR 10.00
- **Tax Rate**: 13% VAT (Nepal standard)
- **Currency**: NPR (Nepalese Rupee)

#### **Critical Implementation Notes:**

1. **GraphQL Direct Access**: REST APIs not accessible - used Hasura GraphQL for all database operations
2. **Real vs Planned Structure**: Production guide assumptions updated with actual CitrineOS database schema
3. **Multi-Protocol Ready**: Infrastructure supports both OCPP 1.6 and 2.0.1 protocols
4. **Production Ready**: Complete CSMS foundation ready for charging station connections

### 📝 **Current Status & Next Steps**

**✅ CSMS Foundation**: Complete infrastructure with real hardware integration
**✅ Real Hardware**: IoCharger AC station connected and operational
**🔄 Next**: Physical EV charging test with real vehicle
**📋 Completed**: Real hardware integration fully documented

## 🚀 Next Session Preparation

### 🎯 Immediate Action Items

1. **Physical EV Charging Test** - Connect actual electric vehicle for end-to-end validation
2. **Production Security** - Implement TLS/mTLS security profiles for production deployment
3. **Advanced OCPP Features** - Test smart charging, diagnostics, and monitoring capabilities
4. **Load Testing** - Multiple simultaneous transactions and connection stress testing
5. **Monitoring Integration** - Dashboard integration for real-time charger monitoring
6. **Billing End-to-End** - Complete transaction flow with actual energy consumption billing
7. **Fleet Expansion** - Add additional charging stations to the network
8. **OCPI Integration** - E-Mobility Service Provider functionality implementation

### 📖 Key Files to Review

- `/citrineos-core/REAL_HARDWARE_INTEGRATION_OCPP_2.0.1.md` - **NEW** - Complete IoCharger integration guide
- `/citrineos-core/ADVANCED_OPERATIONS.md` - Technical deep dive documentation
- `/citrineos-core/OCPP_VERSION_COMPATIBILITY.md` - **CRITICAL** - OCPP 1.6 vs 2.0.1 differences
- `/citrineos-core/GOING_TO_PRODUCTION_V2.md` - **UPDATED** - Complete implementation guide
- `/citrineos-core/03_Modules/Transactions/src/module/CostCalculator.ts` - Cost calculation logic
- `/citrineos-core/03_Modules/Transactions/src/module/CostNotifier.ts` - Real-time cost notifications
- `/citrineos-core/03_Modules/EVDriver/src/module/module.ts` - Authorization handling
- `/citrineos-core/03_Modules/EVDriver/src/module/1.6/MessageApi.ts` - OCPP 1.6 specific APIs
- `/citrineos-core/03_Modules/EVDriver/src/module/2.0.1/MessageApi.ts` - OCPP 2.0.1 specific APIs
- `/citrineos-core/01_Data/src/layers/sequelize/model/Authorization/` - Database models
- `/citrineos-core/01_Data/src/layers/sequelize/model/Tariff/Tariffs.ts` - Tariff model structure
- `/citrineos-core/01_Data/src/layers/sequelize/repository/Tariff.ts` - Tariff repository operations
- `/citrineos-core/00_Base/src/money/Money.ts` - High-precision financial calculations
- `/citrineos-core/00_Base/src/ocpp/model/1.6/` - OCPP 1.6 protocol definitions
- `/citrineos-core/00_Base/src/ocpp/model/2.0.1/` - OCPP 2.0.1 protocol definitions

### 🔄 Development Continuity

Continue with practical implementation of:

- **Protocol-aware service architecture** for OCPP 1.6 and 2.0.1 compatibility
- Local Authorization List synchronization (version-specific formats)
- Offline transaction processing queues (2.0.1 advanced features)
- Wallet service integration patterns
- Real-time monitoring and alerting systems
- Multi-tier billing and tariff management
- High-precision financial calculations using Money class
- Dynamic pricing optimization algorithms
- **Dual-protocol testing strategy** for mixed charger environments

### 💡 Important Notes

- **Context Preserved**: ADVANCED_OPERATIONS.md contains complete session context
- **Critical Reference**: OCPP_VERSION_COMPATIBILITY.md for protocol differences
- **Documentation Access**: Local OCPP/OCPI docs in `/Desktop/Ocpp/`
- **Resume Method**: Use `claude-code chat --resume` to continue session
- **Testing Strategy**: Always test with both OCPP 1.6 and 2.0.1 simulators

## EMSP Development TODO

- [ ] Implement E-Mobility Service Provider functionality
- [ ] Build OCPI layer integration
- [ ] Create charging station fleet management UI
- [ ] Implement billing and payment processing
- [ ] Add monitoring and analytics dashboard

## Git Configuration

See [git.md](./git.md) for detailed git configuration, remote setup, and branch management commands.

## Contact & Support

- Primary Developer: Shashwot Bhattarai (Yatri Motorcycles)
- CitrinOS Documentation: https://citrineos.github.io
- OCPP Specifications: https://www.openchargealliance.org

## Latest Session Context (September 24, 2025)

### 🔍 **OCPP Message Flow Analysis & Authorization Debugging**

**Session Focus**: Deep analysis of OCPP 1.6 transaction logs revealing critical authorization failures

**Key Findings**:
- **Critical Issue**: Authorization database missing entries for common test tokens (e.g., idToken "1")
- **Architecture Analysis**: Traced complete OCPP message flow from WebSocket → RabbitMQ → Module Processing
- **Database Structure**: Confirmed 3-table authorization model (IdTokens → Authorizations → IdTokenInfos)
- **Code Locations**: Identified exact authorization validation logic in TransactionService.ts:173-178

**Technical Analysis Completed**:
```
TransactionService.ts:169-172 - OCPP 1.6 authorization query
Authorization.ts:80-107 - Database query construction with joins
WebsocketNetworkConnection.ts - Message routing and connection handling
Configuration/module.ts - Heartbeat processing and debug logging
```

**Issues Documented**:
1. **Authorization Failures**: `Found invalid authorizations [] for idToken: 1`
2. **Empty StationId**: Causing "Charging station not found" errors
3. **Concurrent Calls**: "OcppError Call already in progress" conflicts
4. **Log Verbosity**: DEBUG level (logLevel: 2) causing excessive output

### 📋 **New Documentation Created**

**OCPP_TROUBLESHOOTING_GUIDE.md** - Comprehensive debugging guide including:
- Root cause analysis for authorization failures
- Database query logic explanation
- Step-by-step solutions for common issues
- Debugging commands and monitoring tools
- OCPP 1.6 vs 2.0.1 authorization differences

### 🎯 **Next Session Priorities**

1. **Fix Authorization Database**: Create proper entries for test tokens
2. **Resolve StationId Issues**: Investigate empty field sources
3. **Implement Solutions**: Apply fixes and test transaction flow
4. **Monitor Improvements**: Track authorization success rates

## Troubleshooting

### System Issues
- **Docker not starting**: Ensure Docker Desktop is running
- **Port conflicts**: Check for services running on ports 8080, 5672, 5432, 9000-9001
- **Build failures**: Verify Node.js v22.18.0+ is active (`nvm use 22.18.0`)
- **TypeScript errors**: Check for Buffer/Blob type compatibility issues

### OCPP Issues
- **Authorization failures**: See `OCPP_TROUBLESHOOTING_GUIDE.md` for complete analysis
- **Empty stationId**: Check charging station WebSocket URL configuration
- **Concurrent calls**: Review charging station firmware settings
- **High log verbosity**: Adjust logLevel in Server/data/config.json

---

_Generated by Claude Code - Last updated: August 20, 2025_
