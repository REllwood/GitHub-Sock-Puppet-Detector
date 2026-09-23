# Deployment Guide

## Production Deployment

The system runs as two processes that share PostgreSQL and Redis:

- **Web app** (Next.js): dashboard, REST API and the GitHub webhook endpoint
- **Worker** (BullMQ): profile syncing, comment backfill and analyses

Database migrations are applied separately before either starts.

### Prerequisites

- Docker and Docker Compose installed
- Domain name with SSL certificate
- GitHub App configured for production (see [SETUP.md](SETUP.md#5-github-app-configuration))

## Deployment Options

### Option 1: Docker Compose (Recommended)

#### 1. Prepare Environment

Create a `.env` file with production values:

```bash
# GitHub App
GITHUB_APP_ID=your_production_app_id
GITHUB_APP_PRIVATE_KEY="your_production_private_key"
GITHUB_WEBHOOK_SECRET=your_production_webhook_secret
GITHUB_CLIENT_ID=your_production_app_client_id
GITHUB_CLIENT_SECRET=your_production_app_client_secret
GITHUB_APP_SLUG=your-app-name

# App
NEXTAUTH_SECRET=your_secure_random_secret
NEXTAUTH_URL=https://your-domain.com
ADMIN_GITHUB_LOGINS=your-github-login

# Optional
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

Compose sets `DATABASE_URL` and `REDIS_URL` for the bundled PostgreSQL and Redis. Set a database password with `POSTGRES_PASSWORD` in your shell or a `.env` file next to `docker-compose.yml`.

#### 2. Build and Deploy

```bash
docker compose up -d --build
```

This starts PostgreSQL and Redis (not exposed outside the Docker network), runs the `migrate` container to apply migrations, then starts the `app` (port 3000) and `worker` services.

```bash
# Check status and logs
docker compose ps
docker compose logs -f app worker
```

#### 3. Configure Reverse Proxy

Use Nginx or Traefik to handle SSL:

**Nginx configuration**:
```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### Option 2: Platform Deployments (Railway, Render, AWS ECS, ...)

Build from the `Dockerfile`, which has three targets:

| Target | Command | Purpose |
|---|---|---|
| `runner` | `node server.js` | Web app (listens on `PORT`, default 3000) |
| `worker` | `node --enable-source-maps dist/worker.mjs` | Background worker |
| `migrate` | `npx prisma migrate deploy` | Apply migrations (run before each release) |

Then:

1. Provision PostgreSQL 16+ and Redis 7+ (managed services are fine; use a `rediss://` URL for TLS)
2. Create a web service from the `runner` target and a background worker from the `worker` target, both with the same environment variables including `DATABASE_URL` and `REDIS_URL`
3. Run the `migrate` target as a release or pre-deploy step
4. Point the GitHub App's webhook URL at `https://your-domain.com/api/webhooks/github`

Without Docker, the equivalent commands are `npm ci && npm run build`, then `npm run db:deploy`, `npm start` and `npm run worker`.

## Production Checklist

### Security

- [ ] Use strong secrets for all credentials (`NEXTAUTH_SECRET`, webhook secret, database password)
- [ ] Serve the app over HTTPS and set `NEXTAUTH_URL` to the HTTPS URL
- [ ] Keep PostgreSQL and Redis off the public internet
- [ ] Set `ADMIN_GITHUB_LOGINS` only to people who should see every repository
- [ ] Review the API rate limit settings

### Database

- [ ] Enable automated backups
- [ ] Configure connection pooling if you run several app instances
- [ ] Monitor database performance

### Application

- [ ] Set `NODE_ENV=production`
- [ ] Monitor `/api/health` (checks database and Redis)
- [ ] Collect logs from both the app and the worker
- [ ] Configure auto-restart on failure
- [ ] Set resource limits (CPU, memory)

### GitHub App

- [ ] Webhook URL points to the production domain
- [ ] Callback URL is `https://your-domain.com/api/auth/callback/github`
- [ ] Webhook secret matches `GITHUB_WEBHOOK_SECRET`
- [ ] Test a webhook delivery from the app's settings page

## Monitoring

### Health Checks

The application exposes a health check endpoint:

```bash
curl https://your-domain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "services": {
    "database": "connected",
    "redis": "connected"
  }
}
```

It returns HTTP 503 with `"status": "unhealthy"` if either service is unreachable.

### Logging

Both processes log to stdout. Configure your deployment platform to aggregate logs:

- **Docker**: `docker compose logs -f app worker`
- **Kubernetes**: `kubectl logs -f pod-name`
- **Cloud platforms**: Use built-in log aggregation

The worker logs each completed analysis (accounts analysed, comments and profiles synced, alerts raised) and every failed job with its error.

### What to Watch

- Analyses stuck in "pending" (the worker isn't running or can't reach Redis)
- Failed analyses on the Analyses page (the error is shown on the analysis)
- GitHub API rate limit errors in worker logs (each installation gets 5,000 requests per hour)
- Webhook delivery failures in the GitHub App settings

## Backup and Recovery

### Database Backups

**Automated backups** (PostgreSQL):
```bash
# Daily backup script
docker compose exec -T postgres pg_dump -U sockpuppet sockpuppet | gzip > backup-$(date +%Y%m%d).sql.gz
```

**Restore from backup**:
```bash
gunzip < backup-20260101.sql.gz | docker compose exec -T postgres psql -U sockpuppet sockpuppet
```

### Application State

- Database: Regular PostgreSQL backups (all analysis results and alerts live here)
- Redis: Only holds queued jobs and rate limit counters; AOF persistence is enabled
- Environment: Store `.env` securely

## Scaling

### Web App

Run multiple app instances behind a load balancer. They share PostgreSQL and Redis; rate limits are shared through Redis.

### Workers

Scale worker processes independently:

```bash
docker compose up -d --scale worker=3
```

Each worker processes up to 5 comment jobs and 2 repository analyses at a time.

## Troubleshooting

### Analyses Stay Pending

- Check the worker is running: `docker compose ps worker`
- Check worker logs for connection or authentication errors
- Analyses stuck for more than 30 minutes are marked as timed out automatically

### Webhooks Return 401

- `GITHUB_WEBHOOK_SECRET` doesn't match the secret configured on the GitHub App

### Webhook Delays

- Webhook-triggered analyses are batched per repository over `ANALYSIS_DEBOUNCE_MS` (default one minute)
- Check the worker is keeping up; scale workers if needed

### Users See No Repositories

- The app must be installed on the repository, and the user must have access to it on GitHub
- `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` must be the GitHub App's credentials

## Maintenance

### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy (migrations run automatically before the app and worker start)
docker compose up -d --build
```

### Database Maintenance

```bash
# Vacuum and analyse
docker compose exec postgres psql -U sockpuppet -c "VACUUM ANALYZE;"

# Check database size
docker compose exec postgres psql -U sockpuppet -c "SELECT pg_size_pretty(pg_database_size('sockpuppet'));"
```
