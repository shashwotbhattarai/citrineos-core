# CitrineOS Deployment Guide

**Last Updated**: February 16, 2026
**Purpose**: AWS RDS, S3, and CI/CD deployment configurations

---

## Quick Start

### Local Development

```bash
cd Server
docker compose -f docker-compose-local.yml up -d
```

### Production (AWS)

```bash
cd Server
cp .env.example .env
# Edit .env with your credentials
docker compose up -d
```

---

## AWS RDS Migration

### Prerequisites

1. **AWS RDS PostgreSQL** (16.x or 17.x)
2. **PostGIS Extension**: `CREATE EXTENSION IF NOT EXISTS postgis;`
3. **Security Group**: Allow inbound port 5432

### Environment Variables

All variables use the `BOOTSTRAP_*` prefix. See [CONFIG_SEPARATION.md](./CONFIG_SEPARATION.md) for the full decision rule.

| Variable                    | Description                        | Required |
| --------------------------- | ---------------------------------- | -------- |
| `BOOTSTRAP_RDS_HOST`        | RDS endpoint hostname              | Yes      |
| `BOOTSTRAP_RDS_USERNAME`    | Database username                  | Yes      |
| `BOOTSTRAP_RDS_PASSWORD`    | Database password                  | Yes      |
| `BOOTSTRAP_RDS_DATABASE`    | Database name                      | Yes      |
| `BOOTSTRAP_RDS_PORT`        | Database port (default: 5432)      | No       |
| `BOOTSTRAP_RDS_SSL`         | Enable SSL (default: true)         | No       |
| `BOOTSTRAP_RDS_POOL_MAX`    | Max pool connections (default: 20) | No       |
| `BOOTSTRAP_RDS_POOL_MIN`    | Min pool connections (default: 5)  | No       |
| `BOOTSTRAP_RDS_MAX_RETRIES` | Connection retries (default: 5)    | No       |
| `BOOTSTRAP_RDS_RETRY_DELAY` | Retry delay in ms (default: 5000)  | No       |

### Example .env

```bash
BOOTSTRAP_RDS_HOST=your-db.abc123.ap-south-1.rds.amazonaws.com
BOOTSTRAP_RDS_PORT=5432
BOOTSTRAP_RDS_DATABASE=citrine
BOOTSTRAP_RDS_USERNAME=citrine
BOOTSTRAP_RDS_PASSWORD=your-secure-password
BOOTSTRAP_RDS_SSL=true
BOOTSTRAP_RDS_POOL_MAX=20
BOOTSTRAP_RDS_POOL_MIN=5
BOOTSTRAP_AWS_REGION=ap-south-1
```

### Data Migration

```bash
# Backup from local
docker exec server-ocpp-db-1 pg_dump -U citrine citrine > backup.sql

# Create PostGIS on RDS
PGPASSWORD=your-password psql -h your-rds-endpoint -U your-username -d your-database \
  -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# Restore to RDS
PGPASSWORD=your-password psql -h your-rds-endpoint -U your-username -d your-database < backup.sql

# Start with RDS
docker compose -f docker-compose-rds.yml --env-file .env.rds up -d
```

### Verify Connection

```bash
docker compose -f docker-compose-rds.yml --env-file .env.rds ps
docker logs server-citrine-1 2>&1 | grep -i "database"
curl -s http://localhost:8080/health | jq
```

### SSL Configuration

SSL was added in January 2026:

**Files Modified**:

- `00_Base/src/config/bootstrap.config.ts` - Added `ssl` option
- `01_Data/src/layers/sequelize/util.ts` - Added `dialectOptions` for SSL
- `Server/src/config/sequelize.bridge.config.js` - SSL for migrations

---

## AWS S3 Storage

### Prerequisites

1. S3 bucket created or IAM permissions for `s3:CreateBucket`
2. IAM credentials with S3 permissions

### Environment Variables

| Variable                          | Description    | Required |
| --------------------------------- | -------------- | -------- |
| `BOOTSTRAP_AWS_REGION`            | AWS region     | Yes      |
| `BOOTSTRAP_S3_BUCKET_NAME`        | S3 bucket name | Yes      |
| `BOOTSTRAP_AWS_ACCESS_KEY_ID`     | AWS access key | Yes\*    |
| `BOOTSTRAP_AWS_SECRET_ACCESS_KEY` | AWS secret key | Yes\*    |

\*Not required if running on EC2 with IAM role attached.

### Example .env (combined RDS + S3)

```bash
# RDS Configuration
BOOTSTRAP_RDS_HOST=your-db.abc123.ap-south-1.rds.amazonaws.com
BOOTSTRAP_RDS_PORT=5432
BOOTSTRAP_RDS_DATABASE=citrine
BOOTSTRAP_RDS_USERNAME=citrine
BOOTSTRAP_RDS_PASSWORD=your-secure-password
BOOTSTRAP_RDS_SSL=true
BOOTSTRAP_RDS_POOL_MAX=20
BOOTSTRAP_RDS_POOL_MIN=5

# S3 Configuration
BOOTSTRAP_AWS_REGION=ap-south-1
BOOTSTRAP_S3_BUCKET_NAME=your-bucket-name
BOOTSTRAP_AWS_ACCESS_KEY_ID=AKIA...
BOOTSTRAP_AWS_SECRET_ACCESS_KEY=your-secret-key
```

### How S3 Works

1. CitrineOS checks S3 for `config.json` on startup
2. If not found, **server fails immediately** (no fallback)
3. You must upload a valid `config.json` to S3 before first boot
4. See `Server/src/config/config.json.example` for the template

### Key Files

- `00_Base/src/config/bootstrap.config.ts` - Reads S3 env vars
- `Server/src/config/config.loader.ts` - Creates S3Storage
- `02_Util/src/files/s3Storage.ts` - S3 client implementation

---

## CI/CD Pipeline

### Architecture

```
Developer Push → GitHub Actions → Docker Hub → Watchtower (EC2) → Container Restart
```

### GitHub Secrets Required

| Secret               | Description             |
| -------------------- | ----------------------- |
| `DOCKERHUB_USERNAME` | Docker Hub username     |
| `DOCKERHUB_TOKEN`    | Docker Hub access token |

### Workflow Triggers

- Push to `cicd` branch → Build and push image
- Manual `workflow_dispatch` → Build on demand

### EC2 Deployment

```bash
# 1. Login to Docker Hub
docker login -u YOUR_DOCKERHUB_USERNAME

# 2. Configure environment
cd /path/to/citrineos-core/Server
cp .env.example .env
nano .env

# 3. Start stack
docker compose up -d

# 4. Verify
docker compose ps
docker compose logs -f watchtower
```

### Watchtower Configuration

- **Poll interval**: 5 minutes (300 seconds)
- **Label-based**: Only updates containers with `com.centurylinklabs.watchtower.enable=true`
- **Cleanup**: Removes old images after update

### Manual Trigger

1. Go to GitHub → Actions → "Yatri Energy CitrineOS CI/CD"
2. Click "Run workflow" → Select `cicd` branch

---

## Health Check API

**Endpoint**: `GET /health`

Checks 6 services (Database + RabbitMQ + S3 + Hasura + Midlayer RabbitMQ + Midlayer API):

| Check          | Method                                               | Critical?                |
| -------------- | ---------------------------------------------------- | ------------------------ |
| Database (RDS) | `sequelize.authenticate()`                           | Yes                      |
| RabbitMQ       | `amqplib.connect(AMQP_URL)` + close                  | Yes                      |
| S3             | `HeadBucketCommand` + `HeadObjectCommand`            | Yes                      |
| Hasura         | `GET http://graphql-engine:8080/healthz`             | No (non-critical)        |
| Payment Queue  | `amqplib.connect(YATRI_ENERGY_RABBITMQ_URL)` + close | Only when wallet enabled |
| Midlayer API   | `GET {YATRI_ENERGY_BASE_URL}/health`                 | Only when wallet enabled |

All health check URLs come from `process.env` (bootstrap config).

**Response**:

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

**Docker healthcheck** in `docker-compose.yml`:

```yaml
healthcheck:
  test: ['CMD', 'curl', '-f', 'http://localhost:8080/health']
  interval: 30s
  timeout: 10s
  retries: 5
  start_period: 60s
```

---

## Troubleshooting

### RDS: "no pg_hba.conf entry... no encryption"

**Cause**: RDS requires SSL but connecting without it.
**Fix**: Set `BOOTSTRAP_RDS_SSL=true` in `.env`.

### RDS: "Unknown constraint error" during migration

**Cause**: PostGIS extension not installed.
**Fix**: `CREATE EXTENSION IF NOT EXISTS postgis;`

### RDS: "Connection refused"

**Cause**: Security group blocking connections.
**Fix**: Add inbound rule for port 5432.

### S3: "Access Denied"

**Cause**: Invalid AWS credentials or insufficient permissions.
**Fix**: Verify `BOOTSTRAP_AWS_ACCESS_KEY_ID` and `BOOTSTRAP_AWS_SECRET_ACCESS_KEY`.

### S3: "NoSuchBucket"

**Cause**: Bucket doesn't exist.
**Fix**: Create bucket manually or add `s3:CreateBucket` permission.

### Migration failed partway

**Solution**: Reset database and retry:

```sql
DROP SCHEMA public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO citrine;
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Watchtower not updating

```bash
# Check logs
docker logs $(docker ps -qf "ancestor=containrrr/watchtower")

# Force check
docker exec $(docker ps -qf "ancestor=containrrr/watchtower") /watchtower --run-once
```

---

## Docker Compose Files Reference

| File                       | Purpose                                           |
| -------------------------- | ------------------------------------------------- |
| `docker-compose.yml`       | Production (RDS + S3 + Watchtower)                |
| `docker-compose-local.yml` | Local development (PostgreSQL + MinIO)            |
| `.env.example`             | Bootstrap env var template (`BOOTSTRAP_*` prefix) |
| `config.json.example`      | System config template (upload to S3)             |
| `deploy.Dockerfile`        | Docker build file                                 |
| `hasura.Dockerfile`        | Custom Hasura image                               |

All `.env` variables use the `BOOTSTRAP_*` prefix convention. Docker-compose maps them to container env vars. See [CONFIG_SEPARATION.md](./CONFIG_SEPARATION.md) for the complete variable reference and decision rule.

---

## Security Best Practices

1. Never commit `.env` files to version control
2. Use AWS Secrets Manager for passwords in production
3. Keep RDS in private subnet with VPC security groups
4. Enable RDS encryption at rest
5. Use IAM roles instead of access keys on EC2
6. Enable S3 bucket versioning for config backup
7. Enable S3 encryption (SSE-S3 or SSE-KMS)
8. Use VPC endpoints for S3 access
