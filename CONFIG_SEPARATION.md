# Config Separation: Bootstrap vs System

**Last Updated**: February 16, 2026

All CitrineOS configuration is split into two categories with no overlap.

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
3. BootstrapConfig tells config.loader.ts where to find config.json (S3/local/directus)
4. config.loader.ts fetches config.json → validates with defineConfig() (Zod) → SystemConfig
5. If config.json is missing → server fails immediately (no fallback)
6. Consumer code reads bootstrap fields directly from process.env (not from SystemConfig)
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

| File                                      | Purpose                                                                            |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `Server/.env.example`                     | Bootstrap env var template                                                         |
| `Server/src/config/config.json.example`   | System config template                                                             |
| `Server/docker-compose.yml`               | Production compose — maps `.env` → container env vars                              |
| `Server/docker-compose-local.yml`         | Local dev compose                                                                  |
| `00_Base/src/config/bootstrap.config.ts`  | Loads `BOOTSTRAP_CITRINEOS_*` from process.env → BootstrapConfig                   |
| `00_Base/src/config/types.ts`             | Zod schema for SystemConfig (`defineConfig()`)                                     |
| `Server/src/config/config.loader.ts`      | Fetches config.json from storage, validates it                                     |
| `Server/src/config/index.ts`              | Entry point — calls `loadBootstrapConfig()` then `loadSystemConfig()`              |
| `Server/src/index.ts`                     | Server constructor — reads bootstrap fields from process.env for healthcheck, auth |
| `02_Util/src/queue/rabbit-mq/sender.ts`   | Reads `AMQP_URL`, `AMQP_EXCHANGE` from process.env                                 |
| `02_Util/src/queue/rabbit-mq/receiver.ts` | Reads `AMQP_URL`, `AMQP_EXCHANGE` from process.env                                 |

---

## What Changed (February 2026)

Previously, the server had `applyEnvVarOverrides()` which silently replaced config.json values with `.env` values at runtime. This meant config.json could show one value while the server used another.

Now:

- **Bootstrap fields are absent from config.json entirely** — no contradiction possible
- **`applyEnvVarOverrides()` is removed** — config.json is what the server uses, period
- **Consumer code reads bootstrap fields from `process.env` directly** — no intermediary
- **Server fails immediately if config.json is missing** — no fallback to `docker.ts`/`local.ts`
- **Env config files (`Server/src/config/envs/*.ts`) are reference-only** — marked with `@ts-nocheck`
