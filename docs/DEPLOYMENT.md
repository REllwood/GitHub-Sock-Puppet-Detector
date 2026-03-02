# Deployment Guide

## Production Deployment

### Prerequisites

- Docker and Docker Compose installed
- Domain name with SSL certificate
- GitHub App configured for production

## Deployment Options

### Option 1: Docker Compose (Recommended)

#### 1. Prepare Environment

Create `.env` file with production values:

```bash
# GitHub App
GITHUB_APP_ID=your_production_app_id
GITHUB_APP_PRIVATE_KEY="your_production_private_key"
GITHUB_WEBHOOK_SECRET=your_production_webhook_secret
GITHUB_CLIENT_ID=your_production_client_id
GITHUB_CLIENT_SECRET=your_production_client_secret

# Database
DATABASE_URL=postgresql://sockpuppet:secure_password@postgres:5432/sockpuppet

# Redis
REDIS_URL=redis://redis:6379

# App
NEXTAUTH_SECRET=your_secure_random_secret
NEXTAUTH_URL=https://your-domain.com
NODE_ENV=production

# Optional
LOG_LEVEL=info
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### 2. Build and Deploy

```bash
# Build the image
docker-compose build

# Start services
docker-compose up -d

# Check logs
docker-compose logs -f app
```

#### 3. Run Database Migrations

```bash
docker-compose exec app npx prisma migrate deploy
```

#### 4. Configure Reverse Proxy

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

### Option 2: Platform-Specific Deployments

#### Railway

1. Create new project on Railway
2. Connect GitHub repository
3. Add PostgreSQL and Redis services
4. Configure environment variables
5. Deploy

#### Render

1. Create new Web Service
2. Connect GitHub repository
3. Add PostgreSQL and Redis instances
4. Set environment variables
5. Deploy

#### AWS ECS

1. Build Docker image
2. Push to ECR
3. Create ECS task definition
4. Configure RDS PostgreSQL and ElastiCache Redis
5. Create ECS service
6. Configure Application Load Balancer

## Production Checklist

### Security

- [ ] Use strong secrets for all credentials
- [ ] Enable SSL/TLS (HTTPS)
- [ ] Configure firewall rules
- [ ] Enable rate limiting
- [ ] Use environment variables (not hardcoded)
- [ ] Restrict database access to application only
- [ ] Enable GitHub webhook signature verification
- [ ] Configure CORS appropriately

### Database

- [ ] Enable automated backups
- [ ] Configure connection pooling
- [ ] Set up read replicas (if needed)
- [ ] Monitor database performance
- [ ] Enable query logging for troubleshooting

### Application

- [ ] Set `NODE_ENV=production`
- [ ] Configure logging (structured logs)
- [ ] Set up error tracking (e.g., Sentry)
- [ ] Configure monitoring (e.g., Prometheus, Grafana)
- [ ] Set up health checks
- [ ] Configure auto-restart on failure
- [ ] Set resource limits (CPU, memory)

### GitHub App

- [ ] Update webhook URL to production domain
- [ ] Verify webhook secret is secure
- [ ] Test webhook delivery
- [ ] Configure OAuth callback URLs
- [ ] Update homepage URL

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
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "connected"
  }
}
```

### Logging

Application logs are written to stdout. Configure your deployment platform to aggregate logs:

- **Docker**: `docker-compose logs -f`
- **Kubernetes**: `kubectl logs -f pod-name`
- **Cloud platforms**: Use built-in log aggregation

### Metrics

Monitor key metrics:
- API response times
- Database query performance
- Queue processing rate
- Memory and CPU usage
- Error rates

### Alerts

Set up alerts for:
- Application downtime
- High error rates
- Database connection failures
- Redis connection failures
- High memory usage
- Slow response times

## Backup and Recovery

### Database Backups

**Automated backups** (PostgreSQL):
```bash
# Daily backup script
pg_dump -h localhost -U sockpuppet sockpuppet | gzip > backup-$(date +%Y%m%d).sql.gz
```

**Restore from backup**:
```bash
gunzip < backup-20240101.sql.gz | psql -h localhost -U sockpuppet sockpuppet
```

### Application State

- Database: Regular PostgreSQL backups
- Redis: Enable AOF persistence
- Environment: Store `.env` securely

## Scaling

### Horizontal Scaling

1. Run multiple application instances
2. Use load balancer (Nginx, AWS ALB)
3. Share Redis instance across instances
4. Use single PostgreSQL primary with read replicas

### Vertical Scaling

- Increase CPU and memory allocations
- Optimise database queries
- Add database indexes
- Tune PostgreSQL configuration

### Queue Workers

Scale worker processes independently:

```bash
# Run multiple workers
docker-compose up -d --scale worker=3
```

## Troubleshooting

### High Memory Usage

- Check for memory leaks
- Increase container memory limit
- Optimise database queries
- Review queue job retention

### Slow Performance

- Enable query logging
- Add database indexes
- Optimise N+1 queries
- Increase worker concurrency

### Webhook Delays

- Check queue processing rate
- Increase worker count
- Verify Redis performance
- Check network latency

## Maintenance

### Updates

```bash
# Pull latest changes
git pull origin main

# Rebuild and deploy
docker-compose build
docker-compose up -d

# Run migrations if needed
docker-compose exec app npx prisma migrate deploy
```

### Database Maintenance

```bash
# Vacuum and analyse
docker-compose exec postgres psql -U sockpuppet -c "VACUUM ANALYZE;"

# Check database size
docker-compose exec postgres psql -U sockpuppet -c "SELECT pg_database_size('sockpuppet');"
```

## Support

For deployment assistance:
- GitHub Issues: Report bugs and request features
- Documentation: Refer to SETUP.md and API.md
- Community: Join discussions on GitHub
