# CitrineOS Core Architecture Analysis

## System Overview

CitrineOS is a modular OCPP 2.0.1/1.6 compliant Charging Station Management System (CSMS) built with Node.js, TypeScript, and Fastify. It follows a layered architecture with clear separation of concerns.

## Core Architecture Layers

### 1. Presentation Layer (Server/src/index.ts)

```
┌─────────────────────────────────────────────────────────────┐
│                    CitrineOSServer                         │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │   Fastify       │ │   WebSocket     │ │   Swagger UI    │ │
│  │   REST APIs     │ │   OCPP Server   │ │   /docs         │ │
│  │   Port 8080     │ │   Ports 8081-92 │ │                 │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Key Components:**

- **Fastify Server**: High-performance HTTP server with JSON schema validation
- **WebSocket Network Connection**: OCPP protocol handler for real-time charging station communication
- **Plugin System**: CORS, Authentication, AJV validation, Swagger documentation

### 2. Module Layer (03_Modules/)

```
┌─────────────────────────────────────────────────────────────┐
│                      Module System                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│  │Certificates │ │Configuration│ │  EVDriver   │ │Monitoring│ │
│  │   Module    │ │   Module    │ │   Module    │ │  Module │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │ Reporting   │ │SmartCharging│ │Transactions │            │
│  │   Module    │ │   Module    │ │   Module    │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

**Module Architecture Pattern:**
Each module follows a consistent structure:

- **MessageApi**: OCPP 2.0.1/1.6 protocol endpoints (`@AsMessageEndpoint`)
- **DataApi**: CRUD operations for module entities
- **Service Classes**: Business logic (e.g., `LocalAuthListService`, `TransactionService`)
- **Repository Pattern**: Data access abstraction

### 3. Data Access Layer (01_Data/)

```
┌─────────────────────────────────────────────────────────────┐
│                    Data Access Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │  Repositories   │ │   Sequelize     │ │   PostgreSQL    │ │
│  │  (Interfaces)   │ │   ORM Models    │ │   Database      │ │
│  │                 │ │                 │ │   + PostGIS     │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

**Repository Pattern:**

- Abstract repository interfaces in `01_Data/src/interfaces/repositories.ts`
- Sequelize implementations in `01_Data/src/layers/sequelize/repository/`
- Multi-tenant support with `BaseModelWithTenant`

### 4. Utility Layer (02_Util/)

```
┌─────────────────────────────────────────────────────────────┐
│                     Utility Services                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────┐ │
│  │   Network   │ │   Cache     │ │    Queue    │ │   Auth  │ │
│  │ Connection  │ │(Redis/Mem)  │ │ (RabbitMQ)  │ │ (OIDC)  │ │
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────┘ │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐            │
│  │Certificates │ │File Storage │ │ Validation  │            │
│  │(PKI/ACME)   │ │(S3/Local)   │ │(AJV/OCPP)   │            │
│  └─────────────┘ └─────────────┘ └─────────────┘            │
└─────────────────────────────────────────────────────────────┘
```

### 5. Base Layer (00_Base/)

```
┌─────────────────────────────────────────────────────────────┐
│                     Foundation Layer                       │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐ │
│  │   OCPP Types    │ │   Interfaces    │ │   Config        │ │
│  │   (2.0.1/1.6)   │ │   (Abstract)    │ │   Management    │ │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Core Data Model Relationships

### Entity Relationship Diagram

```
┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│   Tenant    │←────→│    Location     │←────→│ChargingSttn │
│             │  1:N │                 │  1:N │             │
└─────────────┘      └─────────────────┘      └─────────────┘
                                                      │
                     ┌─────────────────┐              │ 1:N
                     │   Connector     │←─────────────┘
                     │                 │
                     └─────────────────┘
                              │
                              │ 1:N
                              ▼
                     ┌─────────────────┐      ┌─────────────┐
                     │  Transaction    │────→│    Evse     │
                     │                 │  N:1 │             │
                     └─────────────────┘      └─────────────┘
                              │
                              │ 1:N
                              ▼
                     ┌─────────────────┐
                     │TransactionEvent │
                     │                 │
                     └─────────────────┘
                              │
                              │ 1:N
                              ▼
                     ┌─────────────────┐
                     │   MeterValue    │
                     │                 │
                     └─────────────────┘

┌─────────────┐      ┌─────────────────┐      ┌─────────────┐
│IdToken      │────→│  Authorization  │←────→│IdTokenInfo  │
│             │  1:1 │                 │  N:1 │             │
└─────────────┘      └─────────────────┘      └─────────────┘
```

### Key Entity Details

**ChargingStation**

- Primary identifier for OCPP communication
- Supports both OCPP 2.0.1 and 1.6 protocols
- Tracks online status and device characteristics
- Multi-tenant isolation

**Transaction**

- Represents charging sessions
- Links to specific EVSE and connector
- Contains meter readings and billing data
- Supports concurrent transactions per authorization

**Authorization**

- Token-based access control
- Connector type restrictions
- EVSE prefix filtering
- Concurrent transaction limits

**Component/Variable Model (OCPP 2.0.1)**

- Hierarchical device configuration
- Runtime monitoring and control
- Standards-compliant variable management

## OCPP Protocol Handling

### WebSocket Communication Flow

```
Charging Station ←→ WebSocketNetworkConnection ←→ MessageRouter ←→ Module APIs

1. Station connects to ws://host:port/{stationId}
2. Authentication via Authenticator filter chain
3. OCPP messages routed to appropriate module
4. Responses sent back through WebSocket
5. Message persistence and webhooks triggered
```

### Security Profiles

- **Profile 0**: No security (development/testing)
- **Profile 1**: Basic authentication
- **Profile 2**: TLS encryption
- **Profile 3**: Mutual TLS (mTLS) with client certificates

### Message Processing Pipeline

```
WebSocket Message → JSON Validation → Route to Module → Business Logic → Database → Response
```

## Configuration Management

### Environment-Specific Configs

- **Local**: Development with local services
- **Docker**: Containerized deployment
- **Directus**: CMS integration mode

### Key Configuration Areas

- **Module Settings**: Endpoint prefixes and OCPP actions
- **Network Profiles**: WebSocket server configurations
- **Security**: Certificate authorities and authentication
- **Storage**: File storage and caching backends

## Multi-Tenancy Architecture

### Tenant Isolation

- All entities inherit from `BaseModelWithTenant`
- Database-level tenant filtering
- Isolated WebSocket connections per tenant
- Configurable security profiles per tenant

### Benefits

- Multiple organizations on single deployment
- Data privacy and security
- Independent scaling and configuration

## Integration Points

### External System Interfaces

- **Hasura GraphQL**: Database API for frontend applications
- **RabbitMQ**: Asynchronous message processing
- **MinIO S3**: File storage for certificates and logs
- **OCPI Endpoints**: E-mobility service provider integration

### API Architecture

- **Message APIs**: OCPP protocol endpoints (WebSocket + HTTP)
- **Data APIs**: CRUD operations for entities
- **Admin APIs**: System management and monitoring

## Development Patterns

### Decorator-Based Endpoints

```typescript
@AsMessageEndpoint(OCPP2_0_1_CallAction.RequestStartTransaction, RequestStartTransactionSchema)
async requestStartTransaction(identifier: string[], request: RequestStartTransactionRequest): Promise<IMessageConfirmation[]>
```

### Repository Pattern

```typescript
interface IAuthorizationRepository extends CrudRepository<Authorization> {
  findByIdToken(idToken: string, tenantId: number): Promise<Authorization | null>;
}
```

### Module Interface

```typescript
export interface IEVDriverModuleApi {
  requestStartTransaction(
    identifier: string[],
    request: RequestStartTransactionRequest,
  ): Promise<IMessageConfirmation[]>;
  requestStopTransaction(
    identifier: string[],
    request: RequestStopTransactionRequest,
  ): Promise<IMessageConfirmation[]>;
}
```

## Deployment Architecture

### Docker Services

```
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│ CitrineOS   │  │ PostgreSQL  │  │ RabbitMQ    │  │ MinIO S3    │
│ Core API    │  │ Database    │  │ Message     │  │ File        │
│ :8080       │  │ :5432       │  │ Broker      │  │ Storage     │
│             │  │             │  │ :5672       │  │ :9000       │
└─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘
       │                │                │                │
       └────────────────┼────────────────┼────────────────┘
                        │                │
                ┌─────────────┐  ┌─────────────┐
                │ Hasura      │  │ Operator    │
                │ GraphQL     │  │ UI          │
                │ :8090       │  │ :3000       │
                └─────────────┘  └─────────────┘
```

### Network Topology

- **Internal Docker Network**: Service-to-service communication
- **Port Mapping**: External access to key services
- **Health Checks**: Service dependency management
- **Volume Mounts**: Data persistence and hot reloading

This architecture provides a robust, scalable foundation for managing EV charging infrastructure with full OCPP compliance and multi-tenant support.
