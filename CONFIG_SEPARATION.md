# Config Separation: Bootstrap vs System

**Last Updated**: February 16, 2026

All CitrineOS configuration is split into two categories with no overlap. As of February 16, 2026, the configs are **never merged** — `BootstrapConfig` and `SystemConfig` are stored and passed separately throughout the codebase.

---

## Decision Rule

| Question                                | Answer | Where it goes          |
| --------------------------------------- | ------ | ---------------------- |
| Is it a secret or credential?           | Yes    | `.env` (Bootstrap)     |
| Is it infrastructure (host, port, URL)? | Yes    | `.env` (Bootstrap)     |
| Does the health check need it?          | Yes    | `.env` (Bootstrap)     |
| Is it application behavior?             | Yes    | `config.json` (System) |

**Examples**: DB password → `.env`. Wallet timeout → `config.json`. API key secret → `.env`. WebSocket server list → `config.json`.

---

## How It Works at Startup

```
1. Docker reads .env → injects BOOTSTRAP_* vars into container environment
2. loadBootstrapConfig() reads BOOTSTRAP_CITRINEOS_* from process.env → BootstrapConfig
   (Also reads AMQP_URL, CITRINEOS_API_KEY, YATRI_ENERGY_*, HASURA_HEALTH_URL, DEPLOYMENT_TARGET)
3. BootstrapConfig tells config.loader.ts where to find config.json (S3/local/directus)
4. config.loader.ts fetches config.json → validates with defineConfig() (Zod) → SystemConfig
5. If config.json is missing → server fails immediately (no fallback)
6. Server stores _bootstrapConfig and _systemConfig separately (NEVER merged)
7. Modules receive SystemConfig as their primary config
8. Transactions + EVDriver also receive BootstrapConfig for wallet integration
9. RabbitMQ sender/receiver receive AMQP config from BootstrapConfig via constructor params
```

---

## Bootstrap Config (.env)

Bootstrap fields use the `BOOTSTRAP_*` prefix in `.env`. Docker-compose maps them to container env vars that code reads via `process.env`.

See `Server/.env.example` for the complete template.

### Docker Hub

| .env Variable                  | Container Env Var | Purpose                                    |
| ------------------------------ | ----------------- | ------------------------------------------ |
| `BOOTSTRAP_DOCKERHUB_USERNAME` | _(compose only)_  | Docker Hub username for private image pull |

### AWS RDS (Database)

| .env Variable               | Container Env Var                          | Purpose               |
| --------------------------- | ------------------------------------------ | --------------------- |
| `BOOTSTRAP_RDS_HOST`        | `BOOTSTRAP_CITRINEOS_DATABASE_HOST`        | RDS endpoint hostname |
| `BOOTSTRAP_RDS_PORT`        | `BOOTSTRAP_CITRINEOS_DATABASE_PORT`        | Database port         |
| `BOOTSTRAP_RDS_DATABASE`    | `BOOTSTRAP_CITRINEOS_DATABASE_NAME`        | Database name         |
| `BOOTSTRAP_RDS_USERNAME`    | `BOOTSTRAP_CITRINEOS_DATABASE_USERNAME`    | Database username     |
| `BOOTSTRAP_RDS_PASSWORD`    | `BOOTSTRAP_CITRINEOS_DATABASE_PASSWORD`    | Database password     |
| `BOOTSTRAP_RDS_SSL`         | `BOOTSTRAP_CITRINEOS_DATABASE_SSL`         | Enable SSL            |
| `BOOTSTRAP_RDS_POOL_MAX`    | `BOOTSTRAP_CITRINEOS_DATABASE_POOL_MAX`    | Max pool connections  |
| `BOOTSTRAP_RDS_POOL_MIN`    | `BOOTSTRAP_CITRINEOS_DATABASE_POOL_MIN`    | Min pool connections  |
| `BOOTSTRAP_RDS_MAX_RETRIES` | `BOOTSTRAP_CITRINEOS_DATABASE_MAX_RETRIES` | Connection retries    |
| `BOOTSTRAP_RDS_RETRY_DELAY` | `BOOTSTRAP_CITRINEOS_DATABASE_RETRY_DELAY` | Retry delay (ms)      |

### AWS S3 (Config Storage)

| .env Variable                     | Container Env Var                                        | Purpose        |
| --------------------------------- | -------------------------------------------------------- | -------------- |
| `BOOTSTRAP_AWS_REGION`            | `BOOTSTRAP_CITRINEOS_FILE_ACCESS_S3_REGION`              | AWS region     |
| `BOOTSTRAP_S3_BUCKET_NAME`        | `BOOTSTRAP_CITRINEOS_FILE_ACCESS_S3_DEFAULT_BUCKET_NAME` | S3 bucket name |
| `BOOTSTRAP_AWS_ACCESS_KEY_ID`     | `BOOTSTRAP_CITRINEOS_FILE_ACCESS_S3_ACCESS_KEY_ID`       | AWS access key |
| `BOOTSTRAP_AWS_SECRET_ACCESS_KEY` | `BOOTSTRAP_CITRINEOS_FILE_ACCESS_S3_SECRET_ACCESS_KEY`   | AWS secret key |

### Internal RabbitMQ (CitrineOS Message Broker)

| .env Variable             | Container Env Var          | Purpose            |
| ------------------------- | -------------------------- | ------------------ |
| `BOOTSTRAP_RABBITMQ_USER` | _(used to build AMQP_URL)_ | RabbitMQ username  |
| `BOOTSTRAP_RABBITMQ_PASS` | _(used to build AMQP_URL)_ | RabbitMQ password  |
| `BOOTSTRAP_AMQP_EXCHANGE` | `AMQP_EXCHANGE`            | AMQP exchange name |

Docker-compose builds `AMQP_URL` from parts: `amqp://${BOOTSTRAP_RABBITMQ_USER}:${BOOTSTRAP_RABBITMQ_PASS}@amqp-broker:5672`

### API Authentication

| .env Variable                 | Container Env Var   | Purpose                                               |
| ----------------------------- | ------------------- | ----------------------------------------------------- |
| `BOOTSTRAP_CITRINEOS_API_KEY` | `CITRINEOS_API_KEY` | API key secret (config.json just sets `apiKey: true`) |

### Yatri Energy Backend (Midlayer Integration)

| .env Variable                                | Container Env Var                  | Purpose                    |
| -------------------------------------------- | ---------------------------------- | -------------------------- |
| `BOOTSTRAP_YATRI_ENERGY_BASE_URL`            | `YATRI_ENERGY_BASE_URL`            | Midlayer API URL           |
| `BOOTSTRAP_YATRI_ENERGY_API_KEY`             | `YATRI_ENERGY_API_KEY`             | Midlayer API key           |
| `BOOTSTRAP_YATRI_WALLET_INTEGRATION_ENABLED` | `YATRI_WALLET_INTEGRATION_ENABLED` | Enable wallet checks       |
| `BOOTSTRAP_YATRI_ENERGY_RABBITMQ_URL`        | `YATRI_ENERGY_RABBITMQ_URL`        | Midlayer RabbitMQ URL      |
| `BOOTSTRAP_YATRI_ENERGY_RABBITMQ_EXCHANGE`   | `YATRI_ENERGY_RABBITMQ_EXCHANGE`   | Midlayer RabbitMQ exchange |
| `BOOTSTRAP_YATRI_ENERGY_SQS_REGION`          | `YATRI_ENERGY_SQS_REGION`          | SQS region                 |
| `BOOTSTRAP_YATRI_ENERGY_SQS_QUEUE_URL`       | `YATRI_ENERGY_SQS_QUEUE_URL`       | SQS queue URL              |

### Hasura & Watchtower

| .env Variable                           | Container Env Var             | Purpose              |
| --------------------------------------- | ----------------------------- | -------------------- |
| `BOOTSTRAP_HASURA_DEV_MODE`             | `HASURA_GRAPHQL_DEV_MODE`     | Hasura dev mode      |
| `BOOTSTRAP_WATCHTOWER_NOTIFICATION_URL` | `WATCHTOWER_NOTIFICATION_URL` | Watchtower alert URL |

---

## System Config (config.json)

Application behavior that is **not** a secret, not infrastructure, and not needed by health checks.

Stored in S3 (production) or local filesystem (development). Validated by `defineConfig()` (Zod schema in `00_Base/src/config/types.ts`).

See `Server/src/config/config.json.example` for the complete template.

### What's in config.json

| Section                      | Purpose                                                                     |
| ---------------------------- | --------------------------------------------------------------------------- |
| `centralSystem`              | HTTP server host/port                                                       |
| `modules.*`                  | OCPP module configuration (endpoints, requests, responses)                  |
| `util.cache`                 | Cache type (memory/redis)                                                   |
| `util.authProvider`          | Auth type selection (`apiKey: true`, `localByPass: true`, or `oidc: {...}`) |
| `util.swagger`               | Swagger UI configuration                                                    |
| `util.networkConnection`     | WebSocket server definitions (ports, protocols, tenants)                    |
| `util.certificateAuthority`  | V2G and station CA configuration                                            |
| `logLevel`                   | Logging verbosity                                                           |
| `maxCallLengthSeconds`       | OCPP call timeout                                                           |
| `maxCachingSeconds`          | Cache TTL                                                                   |
| `yatriEnergy.timeout`        | Wallet API timeout (ms)                                                     |
| `yatriEnergy.minimumBalance` | Minimum balance for charging (NPR)                                          |

### What is NOT in config.json

These were removed to eliminate contradictions (config.json showed one value, server used another):

- Database connection (host, port, credentials) → `.env`
- S3 connection (region, bucket, keys) → `.env`
- RabbitMQ URL and exchange → `.env`
- API key secret → `.env` (config.json just says `apiKey: true`)
- Yatri Energy base URL, API key, enabled flag → `.env`
- Midlayer RabbitMQ URL/exchange → `.env`
- SQS region and queue URL → `.env`

---

## Docker-Compose Variable Flow

```
.env (BOOTSTRAP_*)  →  docker-compose.yml (environment:)  →  Container process.env  →  Code
```

**Example — AMQP URL**:

```
.env:              BOOTSTRAP_RABBITMQ_USER=guest
                   BOOTSTRAP_RABBITMQ_PASS=guest
docker-compose:    AMQP_URL: amqp://${BOOTSTRAP_RABBITMQ_USER}:${BOOTSTRAP_RABBITMQ_PASS}@amqp-broker:5672
Container:         process.env.AMQP_URL = "amqp://guest:guest@amqp-broker:5672"
Code:              sender.ts reads process.env.AMQP_URL
```

**Example — API Key**:

```
.env:              BOOTSTRAP_CITRINEOS_API_KEY=my-secret
docker-compose:    CITRINEOS_API_KEY: ${BOOTSTRAP_CITRINEOS_API_KEY}
Container:         process.env.CITRINEOS_API_KEY = "my-secret"
Code:              index.ts reads process.env.CITRINEOS_API_KEY
config.json:       "authProvider": { "apiKey": true }   ← boolean flag only, no secret
```

---

## Health Checks

**Endpoint**: `GET /health`

| Check          | What it does                                         | Critical?                               |
| -------------- | ---------------------------------------------------- | --------------------------------------- |
| `database`     | `sequelize.authenticate()`                           | Yes                                     |
| `rabbitmq`     | `amqplib.connect(AMQP_URL)` + close                  | Yes                                     |
| `s3`           | `HeadBucketCommand` + `HeadObjectCommand`            | Yes                                     |
| `hasura`       | `GET http://graphql-engine:8080/healthz`             | No (non-critical to avoid circular dep) |
| `paymentQueue` | `amqplib.connect(YATRI_ENERGY_RABBITMQ_URL)` + close | Only when wallet enabled                |
| `midlayerApi`  | `GET {YATRI_ENERGY_BASE_URL}/health`                 | Only when wallet enabled                |

**Example response**:

```json
{
  "status": "healthy",
  "database": "connected",
  "rabbitmq": "connected",
  "s3": "connected",
  "hasura": "connected",
  "paymentQueue": "connected",
  "midlayerApi": "connected"
}
```

All health check URLs come from `process.env` (bootstrap), not from `config.json`.

---

## How to Change Things

| I want to change...        | Where            | What to do                                                             |
| -------------------------- | ---------------- | ---------------------------------------------------------------------- |
| DB password                | `.env`           | Update `BOOTSTRAP_RDS_PASSWORD`, restart                               |
| Wallet timeout             | S3 `config.json` | Update `yatriEnergy.timeout`, restart                                  |
| API key secret             | `.env`           | Update `BOOTSTRAP_CITRINEOS_API_KEY`, restart                          |
| Add a WebSocket server     | S3 `config.json` | Add entry to `util.networkConnection.websocketServers`                 |
| Change log level           | S3 `config.json` | Update `logLevel` (0=error, 1=warn, 2=debug, 3=trace)                  |
| Change heartbeat interval  | S3 `config.json` | Update `modules.configuration.heartbeatInterval`                       |
| Switch auth provider       | S3 `config.json` | Change `util.authProvider` (set `apiKey: true` or `localByPass: true`) |
| Change AMQP exchange       | `.env`           | Update `BOOTSTRAP_AMQP_EXCHANGE`, restart                              |
| Disable wallet integration | `.env`           | Set `BOOTSTRAP_YATRI_WALLET_INTEGRATION_ENABLED=false`, restart        |

---

## Key Files

| File                                               | Purpose                                                                                     |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `Server/.env.example`                              | Bootstrap env var template                                                                  |
| `Server/src/config/config.json.example`            | System config template                                                                      |
| `Server/docker-compose.yml`                        | Production compose — maps `.env` → container env vars                                       |
| `Server/docker-compose-local.yml`                  | Local dev compose                                                                           |
| `00_Base/src/config/bootstrap.config.ts`           | Loads all bootstrap fields from process.env → BootstrapConfig (schema + loader)             |
| `00_Base/src/config/types.ts`                      | Zod schema for SystemConfig (`defineConfig()`)                                              |
| `Server/src/config/config.loader.ts`               | Fetches config.json from storage, validates it                                              |
| `Server/src/config/index.ts`                       | Entry point — calls `loadBootstrapConfig()` then `loadSystemConfig()`                       |
| `Server/src/index.ts`                              | Server constructor — stores `_bootstrapConfig` and `_systemConfig` separately, never merges |
| `02_Util/src/queue/rabbit-mq/sender.ts`            | Receives AMQP config via constructor param `amqpConfig`                                     |
| `02_Util/src/queue/rabbit-mq/receiver.ts`          | Receives AMQP config via constructor param `amqpConfig`                                     |
| `00_Base/src/interfaces/modules/AbstractModule.ts` | Base module class — `_config: SystemConfig` (what API endpoints return)                     |
| `00_Base/src/interfaces/api/AbstractModuleApi.ts`  | Registers `GET/PUT /data/*/systemConfig` — returns `module.config` (pure SystemConfig)      |

---

## What Changed (February 2026)

### Phase 1: Config.json Cleanup (Early Feb 2026)

Previously, the server had `applyEnvVarOverrides()` which silently replaced config.json values with `.env` values at runtime. This meant config.json could show one value while the server used another.

- **Bootstrap fields are absent from config.json entirely** — no contradiction possible
- **`applyEnvVarOverrides()` is removed** — config.json is what the server uses, period
- **Server fails immediately if config.json is missing** — no fallback to `docker.ts`/`local.ts`
- **Env config files (`Server/src/config/envs/*.ts`) are reference-only** — marked with `@ts-nocheck`

### Phase 2: Complete Config Separation (Feb 16, 2026)

**Problem**: `Server/src/index.ts` merged `{ ...bootstrapConfig, ...systemConfig }` into one object. This merged object was passed to all modules. The `GET /data/*/systemConfig` API endpoints returned `module.config` — the full merged object — **leaking database credentials, S3 keys, AMQP URLs, and API secrets**. Additionally, `saveConfig(module.config)` in OcppRouter AdminApi wrote the merged config (with secrets) to S3 config.json.

**Fix**: Configs are now stored and passed separately. No merging ever occurs.

**Changes made (17 files)**:

1. **`00_Base/src/config/bootstrap.config.ts`** — Added new fields to schema:

   - `amqp: { url, exchange }` — from `AMQP_URL`, `AMQP_EXCHANGE`
   - `apiKey` — from `CITRINEOS_API_KEY`
   - `yatriEnergy: { enabled, baseUrl, apiKey, rabbitmqUrl, rabbitmqExchange, sqsRegion, sqsQueueUrl }` — from `YATRI_*` env vars
   - `hasuraHealthUrl` — from `HASURA_HEALTH_URL`
   - `deploymentTarget` — from `DEPLOYMENT_TARGET`

2. **`Server/src/index.ts`** — Root fix:

   - Replaced `_config: BootstrapConfig & SystemConfig` with separate `_bootstrapConfig` and `_systemConfig`
   - Removed `{ ...bootstrapConfig, ...systemConfig }` merge
   - Health check uses `_bootstrapConfig.*` instead of `process.env.*`
   - API auth reads key from `_bootstrapConfig.apiKey`
   - Passes `_bootstrapConfig.amqp` to RabbitMQ sender/receiver
   - Passes `_systemConfig` to all modules, `_bootstrapConfig` additionally to Transactions + EVDriver

3. **`02_Util/src/queue/rabbit-mq/sender.ts`** — Added `amqpConfig` constructor param, replaced `process.env.AMQP_URL`/`AMQP_EXCHANGE`

4. **`02_Util/src/queue/rabbit-mq/receiver.ts`** — Same as sender

5. **`02_Util/src/security/SignedMeterValuesUtil.ts`** — Changed param from `BootstrapConfig & SystemConfig` to `SystemConfig`

6. **`03_Modules/Transactions/src/module/module.ts`** — Changed to `SystemConfig`, added `bootstrapConfig` param for wallet/midlayer integration

7. **`03_Modules/Transactions/src/module/TransactionService.ts`** — Added `bootstrapConfig` param, replaced `process.env.*` reads in wallet check

8. **`03_Modules/EVDriver/src/module/module.ts`** — Changed to `SystemConfig`, added `bootstrapConfig` param with public getter

9. **`03_Modules/EVDriver/src/module/1.6/MessageApi.ts`** — Wallet check reads `this._module.bootstrapConfig` instead of `process.env`

10. **`03_Modules/OcppRouter/src/module/router.ts`** — Changed from `BootstrapConfig & SystemConfig` to `SystemConfig`

11. **`03_Modules/Certificates/src/module/module.ts`** — Changed to `SystemConfig`

12. **`03_Modules/Configuration/src/module/module.ts`** — Changed to `SystemConfig`

13. **`03_Modules/Monitoring/src/module/module.ts`** — Changed to `SystemConfig`

14. **`03_Modules/Reporting/src/module/module.ts`** — Changed to `SystemConfig`

15. **`03_Modules/SmartCharging/src/module/module.ts`** — Changed to `SystemConfig`

16. **`03_Modules/Tenant/src/module/module.ts`** — Changed to `SystemConfig`

**Result**:

- `GET /data/*/systemConfig` returns **only SystemConfig** — no secrets
- `PUT /data/*/systemConfig` saves **only SystemConfig** to S3 — no secrets in config.json
- No scattered `process.env` reads for bootstrap values — all go through typed `BootstrapConfig`

**Fallback repo pattern**: Modules that construct fallback repositories (when not injected) use `config as any` to satisfy the `BootstrapConfig` param. This works because `DefaultSequelizeInstance` is a singleton — it was already initialized with the real `BootstrapConfig` by `Server/src/index.ts` during startup. The config param is only used on first call.

---

## Debugging Guide: If Something Breaks After Config Separation

### Symptom: Module can't connect to database

**Likely cause**: A module's fallback repository is constructing `DefaultSequelizeInstance` for the first time (before `Server/src/index.ts` initializes it), and it receives `SystemConfig` (cast as `any`) which lacks database fields.

**Fix**: Ensure `Server/src/index.ts:initRepositoryStore()` runs before any module constructor that creates fallback repos. This is the normal startup order. If a module is somehow initialized early, inject the repository explicitly instead of using the fallback.

**Key files to check**: The module's `module.ts` constructor — look for `new sequelize.Sequelize*Repository(config as any, ...)` calls in the fallback `if (!repo)` branches.

### Symptom: Wallet/Yatri integration not working

**Likely cause**: `bootstrapConfig` not being passed to the module.

**Check**: `Server/src/index.ts` — `initTransactionsModule()` and `initEVDriverModule()` must pass `this._bootstrapConfig` as the last constructor arg.

**Key files**:

- `03_Modules/Transactions/src/module/module.ts` — `_bootstrapConfig` field
- `03_Modules/Transactions/src/module/TransactionService.ts` — `_bootstrapConfig` field
- `03_Modules/EVDriver/src/module/module.ts` — `_bootstrapConfig` field + `get bootstrapConfig()` getter
- `03_Modules/EVDriver/src/module/1.6/MessageApi.ts` — reads `this._module.bootstrapConfig`

### Symptom: RabbitMQ not connecting

**Likely cause**: `amqpConfig` not passed to sender/receiver constructors.

**Check**: `Server/src/index.ts` — `_createSender()` and `_createHandler()` methods must pass `{ url: this._bootstrapConfig.amqp.url, exchange: this._bootstrapConfig.amqp.exchange }`.

**Key files**:

- `02_Util/src/queue/rabbit-mq/sender.ts` — `_amqpUrl`, `_amqpExchange` fields
- `02_Util/src/queue/rabbit-mq/receiver.ts` — `_amqpUrl`, `_amqpExchange` fields

### Symptom: Health check failing

**Likely cause**: `_bootstrapConfig` fields not populated.

**Check**: `00_Base/src/config/bootstrap.config.ts` — `loadBootstrapConfig()` reads directly from `process.env` (not `BOOTSTRAP_CITRINEOS_*` prefix) for: `AMQP_URL`, `CITRINEOS_API_KEY`, `YATRI_*`, `HASURA_HEALTH_URL`, `DEPLOYMENT_TARGET`.

**Verify env vars**: `docker compose exec citrine env | grep -E "AMQP_URL|CITRINEOS_API_KEY|YATRI_|HASURA_HEALTH_URL"`

### Symptom: API key auth not working

**Check**: `Server/src/index.ts` — `initApiAuthProvider()` reads `this._bootstrapConfig.apiKey`. Ensure `CITRINEOS_API_KEY` env var is set in the container.
