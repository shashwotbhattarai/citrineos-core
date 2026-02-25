# CitrineOS Deployment Guide

**Last Updated**: February 17, 2026
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

## Nginx + SSL (Let's Encrypt)

### Overview

Nginx runs on the **EC2 host** (not in Docker) to terminate TLS and reverse-proxy to Docker containers on localhost. This enables WSS for OCPP chargers and HTTPS for all APIs using a single Let's Encrypt certificate.

### Architecture

```
Internet ──► Nginx (EC2 host, terminates TLS) ──► localhost:OFFSET_PORT (Docker containers)

External Port → Nginx → Docker Host Port → Container Port
─────────────────────────────────────────────────────────
Port 80       → redirect to 443
Port 443      → 127.0.0.1:8080   → container:8080  (CitrineOS REST API)
Port 8092     → 127.0.0.1:18092  → container:8092  (OCPP 1.6 WSS, Tenant 1)
Port 8093     → 127.0.0.1:18093  → container:8093  (OCPP 1.6 WSS, Tenant 2)
Port 8094     → 127.0.0.1:18094  → container:8094  (OCPP 1.6 WSS, Tenant 3)
Port 8090     → 127.0.0.1:18090  → container:8080  (Hasura GraphQL)
Port 15672    → 127.0.0.1:25672  → container:15672 (RabbitMQ Management)
```

**Domain**: `test.yatri-energy-core.yatrimotorcycle.com`
**EC2 IP**: `43.205.3.181`

### Why Docker Ports Use Offset Bindings

Docker-compose ports use `127.0.0.1:OFFSET_PORT:CONTAINER_PORT` (e.g., `127.0.0.1:18092:8092`). This is required because:

1. **Port conflict**: Nginx and Docker can't both bind to the same port — even on `127.0.0.1`. Nginx listens on `0.0.0.0:8092` (external TLS), so Docker must use a different host port (18092).
2. **Self-proxy loop**: If Docker and nginx use the same port, nginx's `proxy_pass http://127.0.0.1:8092` connects back to itself, causing "The plain HTTP request was sent to HTTPS port" errors.
3. **Security**: `127.0.0.1` binding prevents unencrypted external access — all traffic must go through nginx (TLS).

Port 443 → 8080 has no conflict because nginx listens on 443 (different from Docker's 8080), so Docker keeps `127.0.0.1:8080:8080`.

### Files

| File                        | Purpose                                   |
| --------------------------- | ----------------------------------------- |
| `Server/nginx/nginx.conf`   | Nginx server blocks for all proxied ports |
| `Server/nginx/setup.sh`     | One-time EC2 setup script                 |
| `Server/docker-compose.yml` | Port bindings set to `127.0.0.1`          |

### Prerequisites

1. **DNS A record**: `test.yatri-energy-core.yatrimotorcycle.com` → `43.205.3.181`
2. **EC2 Security Group** — open inbound ports:

| Port  | Protocol | Source       | Service                          |
| ----- | -------- | ------------ | -------------------------------- |
| 22    | TCP      | Your IP only | SSH                              |
| 80    | TCP      | 0.0.0.0/0    | HTTP (ACME challenge + redirect) |
| 443   | TCP      | 0.0.0.0/0    | HTTPS (CitrineOS API)            |
| 8090  | TCP      | 0.0.0.0/0    | Hasura GraphQL                   |
| 8092  | TCP      | 0.0.0.0/0    | OCPP 1.6 WSS (Tenant 1)          |
| 8093  | TCP      | 0.0.0.0/0    | OCPP 1.6 WSS (Tenant 2)          |
| 8094  | TCP      | 0.0.0.0/0    | OCPP 1.6 WSS (Tenant 3)          |
| 15672 | TCP      | Your IP only | RabbitMQ Management              |

### Setup

#### First-time setup (run `setup.sh`):

```bash
ssh ubuntu@43.205.3.181
cd ~/yatri-energy-citrine

# 1. Copy nginx files to server (from local machine via scp)
# scp -r Server/nginx/ ubuntu@43.205.3.181:~/yatri-energy-citrine/nginx/
# scp Server/docker-compose.yml ubuntu@43.205.3.181:~/yatri-energy-citrine/docker-compose.yml

# 2. Run setup script
sudo bash nginx/setup.sh
```

The script installs nginx + certbot, obtains a Let's Encrypt certificate, and starts nginx.

#### After updating nginx.conf or docker-compose.yml:

Watchtower only updates Docker **images**. Config files must be deployed manually:

```bash
# From local machine — SCP updated files
scp Server/nginx/nginx.conf ubuntu@43.205.3.181:~/yatri-energy-citrine/nginx/nginx.conf
scp Server/docker-compose.yml ubuntu@43.205.3.181:~/yatri-energy-citrine/docker-compose.yml

# On EC2 — apply changes
sudo cp ~/yatri-energy-citrine/nginx/nginx.conf /etc/nginx/sites-available/citrineos
sudo nginx -t && sudo nginx -s reload
cd ~/yatri-energy-citrine && docker compose down && docker compose up -d
```

### Verification

```bash
# HTTPS health check (port 443 → 8080)
curl https://test.yatri-energy-core.yatrimotorcycle.com/health

# WSS OCPP connection (port 8093 → 18093, SecProfile 0 = no auth)
wscat -c wss://test.yatri-energy-core.yatrimotorcycle.com:8093/ocpp/<charger-id> -s ocpp1.6

# WSS OCPP with Basic Auth (port 8092 → 18092, SecProfile 1)
wscat -c wss://test.yatri-energy-core.yatrimotorcycle.com:8092/ocpp/<charger-id> \
  -s ocpp1.6 --auth <username>:<password>

# Hasura GraphQL console (port 8090 → 18090)
curl -k https://test.yatri-energy-core.yatrimotorcycle.com:8090/healthz
# Or open: https://test.yatri-energy-core.yatrimotorcycle.com:8090/console

# RabbitMQ Management (port 15672 → 25672)
# Open: https://test.yatri-energy-core.yatrimotorcycle.com:15672
```

### Charger Configuration

After enabling WSS, configure chargers to connect via:

```
wss://test.yatri-energy-core.yatrimotorcycle.com:8092/<charger-identifier>
```

The nginx WebSocket proxy passes through:

- `Upgrade` + `Connection: upgrade` headers
- `Sec-WebSocket-Protocol` (OCPP subprotocol negotiation)
- `Authorization` header (OCPP Basic Auth / Security Profile 1)
- 24-hour read/send timeout (persistent charger connections)

### Certificate Renewal

Certbot auto-renewal runs daily at 3 AM via cron. On renewal, nginx is reloaded automatically. To test:

```bash
sudo certbot renew --dry-run
```

### Troubleshooting

#### "The plain HTTP request was sent to HTTPS port" (400)

**Cause**: Nginx is proxying to itself. The `proxy_pass` port matches the `listen` port (e.g., nginx listens on 8090 and proxies to `127.0.0.1:8090`).
**Fix**: Ensure nginx.conf uses the offset ports (18092, 18090, 25672) and reload:

```bash
sudo nginx -T 2>&1 | grep proxy_pass  # Check current config
sudo cp ~/yatri-energy-citrine/nginx/nginx.conf /etc/nginx/sites-available/citrineos
sudo nginx -t && sudo nginx -s reload
```

#### Nginx won't start — "Address already in use"

**Cause**: Docker is binding to the same host port as nginx.
**Fix**: Ensure `docker-compose.yml` uses offset host ports (`127.0.0.1:18092:8092`), then restart:

```bash
cd ~/yatri-energy-citrine
docker compose down && docker compose up -d
```

#### 502 Bad Gateway

**Cause**: Docker containers not running, or wrong offset port in nginx.conf.
**Fix**: Check containers are up and verify port mapping:

```bash
docker compose ps
sudo nginx -T 2>&1 | grep proxy_pass
```

#### Certificate issuance fails

**Cause**: Port 80 not open, or DNS not pointing to this server.
**Fix**: Check security group allows port 80 inbound. Verify DNS:

```bash
dig test.yatri-energy-core.yatrimotorcycle.com
```

#### Charger can't connect via WSS

**Cause**: Security group doesn't allow the WSS port, or charger firmware doesn't support TLS 1.2+.
**Fix**: Open the port in EC2 security group. Check charger TLS capabilities.

#### WebSocket drops after ~60 seconds

**Cause**: Default nginx `proxy_read_timeout` is 60s.
**Fix**: Already set to `86400s` (24h) in `nginx.conf`. If using a load balancer in front, check its idle timeout too.

#### Config changes not taking effect

**Cause**: Watchtower only updates Docker images, not config files on the host.
**Fix**: SCP updated files and manually reload/restart:

```bash
# Nginx config change
sudo cp ~/yatri-energy-citrine/nginx/nginx.conf /etc/nginx/sites-available/citrineos
sudo nginx -t && sudo nginx -s reload

# Docker-compose change
cd ~/yatri-energy-citrine && docker compose down && docker compose up -d
```

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
