# System Configuration API Documentation

## Overview

The CitrineOS system configuration API provides runtime access to view and modify the complete system configuration. This API allows administrators to update settings without restarting the server.

## API Endpoints

### GET `/data/configuration/systemConfig`

**Purpose**: Retrieve the current system configuration

**Method**: `GET`
**Authentication**: Required (user/admin roles)
**Response**: Complete `SystemConfig` object

**Example Request**:

```bash
curl -s "http://localhost:8080/data/configuration/systemConfig" | jq '.'
```

**Example Response**:

```json
{
  "env": "development",
  "centralSystem": {
    "host": "0.0.0.0",
    "port": 8080
  },
  "util": {
    "networkConnection": {
      "websocketServers": [...]
    },
    "messageBroker": {...},
    "cache": {...}
  },
  "modules": {...},
  "yatriEnergy": {
    "baseUrl": "http://13.235.140.91",
    "apiKey": "",
    "timeout": 10000,
    "minimumBalance": 100,
    "enabled": "true"
  }
}
```

### PUT `/data/configuration/systemConfig`

**Purpose**: Update the system configuration

**Method**: `PUT`
**Authentication**: Required (user/admin roles)
**Content-Type**: `application/json`
**Body**: Complete `SystemConfig` object (validated against Zod schema)

**Example Request**:

```bash
# Get current config, modify, and save back
curl -s "http://localhost:8080/data/configuration/systemConfig" > /tmp/config.json

# Edit the config file as needed
jq '.yatriEnergy.enabled = "false"' /tmp/config.json > /tmp/config_modified.json

# Save updated config
curl -X PUT "http://localhost:8080/data/configuration/systemConfig" \
  -H "Content-Type: application/json" \
  -d @/tmp/config_modified.json
```

## Implementation Details

### Location in Codebase

The system config API is implemented in:

- **File**: `00_Base/src/interfaces/api/AbstractModuleApi.ts`
- **Method**: `registerSystemConfigRoutes(module: T)`
- **Lines**: 389-417

### Code Implementation

```typescript
protected registerSystemConfigRoutes(module: T) {
  // GET endpoint - returns current in-memory config
  this._addDataRoute.call(
    this,
    OCPP2_0_1_Namespace.SystemConfig,
    () => new Promise((resolve) => resolve(module.config)),
    HttpMethod.Get,
  );

  // PUT endpoint - saves to storage and updates memory
  this._addDataRoute.call(
    this,
    OCPP2_0_1_Namespace.SystemConfig,
    async (request: FastifyRequest<{ Body: SystemConfig }>) => {
      await ConfigStoreFactory.getInstance().saveConfig(request.body);
      module.config = request.body;
    },
    HttpMethod.Put,
    undefined,
    undefined,
    undefined,
    systemConfigJsonSchema,
  );
}
```

## Storage Mechanism

### Configuration Storage Flow

```
Client PUT Request
       ↓
ConfigStoreFactory.getInstance().saveConfig(config)
       ↓
Storage Implementation (LocalStorage/S3Storage/DirectusUtil)
       ↓
Persistent Storage (file/S3/database)
       ↓
In-Memory Update (module.config = config)
```

### Storage Types

#### 1. Local Storage (Docker Default)

**Configuration**:

```typescript
fileAccess: {
  type: 'local',
  local: {
    defaultFilePath: '/usr/local/apps/citrineos/Server/data'
  }
}
```

**Storage Location**:

- **Container Path**: `/usr/local/apps/citrineos/Server/data/config.json`
- **Host Path**: `./Server/data/config.json` (via Docker volume)
- **Implementation**: `LocalStorage` class

#### 2. S3 Storage (Production Option)

**Configuration**:

```typescript
fileAccess: {
  type: 's3',
  s3: {
    bucket: 'citrineos-config',
    accessKeyId: '...',
    secretAccessKey: '...',
    region: 'us-east-1'
  }
}
```

**Storage Location**: AWS S3 bucket
**Implementation**: `S3Storage` class

#### 3. Directus Storage (CMS Option)

**Configuration**:

```typescript
fileAccess: {
  type: 'directus',
  directus: {
    url: 'https://directus.example.com',
    token: '...'
  }
}
```

**Storage Location**: Directus CMS database
**Implementation**: `DirectusUtil` class

## Configuration Lifecycle

### 1. Server Startup

```typescript
// 1. Load bootstrap config from environment
// 2. Create appropriate ConfigStore
const configStore = createConfigStore(bootstrapConfig);
ConfigStoreFactory.setConfigStore(configStore);

// 3. Load config from storage or create default
let config: SystemConfig | null = await configStore.fetchConfig();

// 4. Validate config against Zod schema
const validatedConfig = defineConfig(config);
```

### 2. Runtime Access

- **GET API**: Returns current `module.config` (in-memory)
- **In-memory**: Configuration is held in memory for fast access
- **No disk reads**: GET requests don't read from storage

### 3. Configuration Updates

```typescript
// PUT API Handler
async (request: FastifyRequest<{ Body: SystemConfig }>) => {
  // 1. Validate against Zod schema (automatic)
  // 2. Save to persistent storage
  await ConfigStoreFactory.getInstance().saveConfig(request.body);
  // 3. Update in-memory config
  module.config = request.body;
  // 4. Return success (automatic)
};
```

### 4. Persistence Across Restarts

- **Storage**: Configuration persists in storage layer
- **Restart**: Server reads from storage on next startup
- **No Loss**: Changes survive container restarts, deployments

## Authentication & Authorization

### RBAC Configuration

**File**: `Server/rbac-rules.json`

```json
{
  "/data/configuration/systemConfig": {
    "GET": ["user", "admin"],
    "PUT": ["user", "admin"]
  }
}
```

### Required Headers

```bash
# If using OIDC authentication
Authorization: Bearer <jwt_token>

# If using local bypass (development)
# No authentication required
```

## Schema Validation

### Zod Schema

The system configuration is validated against the Zod schema defined in:

- **File**: `00_Base/src/config/types.ts`
- **Schema**: `systemConfigSchema`

### Validation Process

1. **Automatic**: Fastify validates request body against JSON schema
2. **Derived**: JSON schema generated from Zod schema via `zodToJsonSchema`
3. **Strict**: Invalid configurations are rejected with validation errors
4. **Type Safe**: TypeScript ensures type safety at compile time

### Example Validation Error

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "body should have required property 'yatriEnergy'"
}
```

## Troubleshooting

### Common Issues

#### 1. Schema Validation Errors

**Problem**: New required fields cause validation failures

**Solution**:

```bash
# Remove old config file to force regeneration
rm /path/to/citrineos/Server/data/config.json

# Restart server to regenerate with new schema
docker compose restart citrine
```

#### 2. Permission Errors

**Problem**: Unable to write config file

**Solution**:

```bash
# Check Docker volume permissions
docker exec -it server-citrine-1 ls -la /usr/local/apps/citrineos/Server/data/

# Fix permissions if needed
sudo chown -R $USER:$USER ./Server/data/
```

#### 3. Invalid Configuration

**Problem**: PUT request rejected due to invalid data

**Solution**:

```bash
# Validate against schema first
curl -s "http://localhost:8080/data/configuration/systemConfig" | \
  jq '.yatriEnergy.timeout = "invalid"' | \
  curl -X PUT "http://localhost:8080/data/configuration/systemConfig" \
    -H "Content-Type: application/json" \
    -d @-
# This will fail with validation error

# Fix: Use correct data types
jq '.yatriEnergy.timeout = 5000' # number, not string
```

## Security Considerations

### 1. Authentication Required

- **Production**: Always use OIDC authentication
- **Development**: Local bypass acceptable
- **Never**: Expose without authentication in production

### 2. Sensitive Data

**Problem**: Configuration may contain secrets

```json
{
  "yatriEnergy": {
    "apiKey": "secret-key-here"
  }
}
```

**Best Practice**: Use environment variables for secrets, not stored config

### 3. Backup Before Changes

```bash
# Always backup current config before changes
curl -s "http://localhost:8080/data/configuration/systemConfig" > backup_$(date +%Y%m%d_%H%M%S).json
```

## Integration Examples

### Update WebSocket Server Configuration

```bash
# Get current config
CONFIG=$(curl -s "http://localhost:8080/data/configuration/systemConfig")

# Update security profile for websocket server
UPDATED_CONFIG=$(echo "$CONFIG" | jq '
  .util.networkConnection.websocketServers |= map(
    if .id == "4" then
      . + {"securityProfile": 1, "allowUnknownChargingStations": false}
    else
      .
    end
  )'
)

# Save updated config
echo "$UPDATED_CONFIG" | curl -X PUT "http://localhost:8080/data/configuration/systemConfig" \
  -H "Content-Type: application/json" \
  -d @-
```

### Update Yatri Energy Configuration

```bash
# Enable wallet integration
curl -s "http://localhost:8080/data/configuration/systemConfig" | \
  jq '.yatriEnergy.enabled = "true" | .yatriEnergy.minimumBalance = 200' | \
  curl -X PUT "http://localhost:8080/data/configuration/systemConfig" \
    -H "Content-Type: application/json" \
    -d @-
```

### Monitor Configuration Changes

```bash
# Watch config file for changes (local storage)
watch -n 5 'curl -s "http://localhost:8080/data/configuration/systemConfig" | jq ".yatriEnergy"'

# Check last modification time
stat /path/to/citrineos/Server/data/config.json
```

## Related Documentation

- **System Configuration Types**: `00_Base/src/config/types.ts`
- **Bootstrap Configuration**: `Server/src/config/config.loader.ts`
- **Storage Implementations**: `02_Util/src/files/`
- **Authentication**: `Server/src/auth/`
- **API Reference**: `OCPP_1.6_SECURITY_PROFILE_1_API_REFERENCE.md`

---

**Last Updated**: December 17, 2025
**CitrineOS Version**: 1.8.0
**API Version**: OCPP 2.0.1 Namespace
