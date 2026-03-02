# Setup Guide

## System Requirements

- **Node.js**: Version 20 or higher
- **PostgreSQL**: Version 16 or higher
- **Redis**: Version 7 or higher
- **Docker**: Optional, for containerised deployment
- **Git**: For version control

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/sock-puppet-detector.git
cd sock-puppet-detector
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Database Setup

#### Option A: Using Docker (Recommended)

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose -f docker-compose.dev.yml up -d
```

This creates:
- PostgreSQL on port 5432
- Redis on port 6379

#### Option B: Local Installation

Install PostgreSQL and Redis locally:

**macOS (Homebrew)**:
```bash
brew install postgresql@16 redis
brew services start postgresql@16
brew services start redis
```

**Ubuntu/Debian**:
```bash
sudo apt-get install postgresql-16 redis-server
sudo systemctl start postgresql
sudo systemctl start redis
```

Create database:
```bash
createdb sockpuppet
```

### 4. Environment Configuration

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```bash
# GitHub App Credentials
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_CLIENT_ID=Iv1.abc123def456
GITHUB_CLIENT_SECRET=abc123def456789

# Database
DATABASE_URL=postgresql://sockpuppet:password@localhost:5432/sockpuppet

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# Environment
NODE_ENV=development
LOG_LEVEL=info
```

**Generate NEXTAUTH_SECRET**:
```bash
openssl rand -base64 32
```

### 5. GitHub App Configuration

#### Create a GitHub App

1. Go to GitHub Settings > Developer Settings > GitHub Apps
2. Click "New GitHub App"
3. Fill in the details:
   - **GitHub App name**: Sock Puppet Detector (Dev)
   - **Homepage URL**: http://localhost:3000
   - **Webhook URL**: https://your-ngrok-url.ngrok.io/api/webhooks/github
   - **Webhook secret**: Generate a random string
   - **Repository permissions**:
     - Issues: Read-only
     - Pull requests: Read-only
     - Metadata: Read-only
   - **Subscribe to events**:
     - Issue comment
     - Pull request review comment
     - Installation
     - Installation repositories

4. Generate a private key (download the .pem file)
5. Note your App ID and Client ID

#### Configure Local Webhook Testing

For local development, use ngrok:

```bash
# Install ngrok
npm install -g ngrok

# Start ngrok
ngrok http 3000
```

Update your GitHub App webhook URL with the ngrok URL.

### 6. Database Migration

Run Prisma migrations:

```bash
npm run db:migrate
```

Generate Prisma client:

```bash
npm run db:generate
```

### 7. Start the Application

Start the development server:

```bash
npm run dev
```

In a separate terminal, start the worker process:

```bash
node -r ts-node/register src/lib/queue/workers.ts
```

The application will be available at `http://localhost:3000`.

### 8. Install the GitHub App

1. Navigate to your GitHub App page
2. Click "Install App"
3. Select your test repository
4. Authorise the installation

## Verification

1. Open `http://localhost:3000`
2. Sign in with GitHub
3. View the dashboard
4. Create a test comment on your repository
5. Check the dashboard for the analysis

## Common Issues

### Database Connection Failed

**Problem**: Cannot connect to PostgreSQL

**Solution**:
- Check PostgreSQL is running: `pg_isready`
- Verify connection string in `.env`
- Check database exists: `psql -l`

### Redis Connection Failed

**Problem**: Cannot connect to Redis

**Solution**:
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` in `.env`

### GitHub Webhook Not Receiving Events

**Problem**: Webhook events not arriving

**Solution**:
- Check ngrok is running
- Verify webhook URL in GitHub App settings
- Check webhook secret matches `.env`
- View webhook delivery logs in GitHub App settings

### Worker Not Processing Jobs

**Problem**: Analysis jobs not running

**Solution**:
- Ensure worker process is running
- Check Redis connection
- View worker logs for errors

## Next Steps

- Read [API Documentation](API.md)
- Read [Deployment Guide](DEPLOYMENT.md)
- Explore detection algorithms in `src/lib/detection/`
- Customise risk scoring weights
