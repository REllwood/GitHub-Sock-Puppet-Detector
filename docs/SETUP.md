# Setup Guide

## System Requirements

- **Node.js**: Version 20.12 or higher
- **PostgreSQL**: Version 16 or higher
- **Redis**: Version 7 or higher
- **Docker**: Optional, for local services and containerised deployment
- **Git**: For version control

## Development Setup

### 1. Clone the Repository

```bash
git clone https://github.com/REllwood/GitHub-Sock-Puppet-Detector.git
cd GitHub-Sock-Puppet-Detector
```

### 2. Install Dependencies

```bash
npm install
```

This also generates the Prisma client (`postinstall`).

### 3. Database and Redis

#### Option A: Using Docker (Recommended)

Start PostgreSQL and Redis using Docker Compose:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This creates:
- PostgreSQL on port 5432 (user `sockpuppet`, password `sockpuppet_dev_password`, database `sockpuppet`)
- Redis on port 6379

#### Option B: Local Installation

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

Create a database:
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
# GitHub App credentials
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret_here
GITHUB_CLIENT_ID=Iv23abc123def456
GITHUB_CLIENT_SECRET=abc123def456789
GITHUB_APP_SLUG=sock-puppet-detector-dev

# Database
DATABASE_URL=postgresql://sockpuppet:sockpuppet_dev_password@localhost:5432/sockpuppet

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_SECRET=your_random_secret_here
NEXTAUTH_URL=http://localhost:3000

# Optional
ADMIN_GITHUB_LOGINS=your-github-login
```

The private key can be given as the PEM contents (with real line breaks or `\n` escapes) or base64-encoded.

**Generate NEXTAUTH_SECRET**:
```bash
openssl rand -base64 32
```

#### All settings

| Variable | Required | Description |
|---|---|---|
| `GITHUB_APP_ID` | Yes | GitHub App ID |
| `GITHUB_APP_PRIVATE_KEY` | Yes | GitHub App private key (PEM or base64) |
| `GITHUB_WEBHOOK_SECRET` | Yes | Webhook secret configured on the app |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Yes | The GitHub App's OAuth credentials (for dashboard sign-in) |
| `GITHUB_APP_SLUG` | No | The app's URL name, used for "Install GitHub App" links |
| `GITHUB_API_URL` | No | GitHub REST API base URL (defaults to `https://api.github.com`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `REDIS_URL` | Yes | Redis URL (`redis://` or `rediss://` for TLS) |
| `NEXTAUTH_SECRET` | Yes | Secret used to encrypt sessions |
| `NEXTAUTH_URL` | Yes | Public URL of the app |
| `ADMIN_GITHUB_LOGINS` | No | Comma-separated GitHub logins that can see every repository |
| `ANALYSIS_DEBOUNCE_MS` | No | Window for batching webhook-triggered analyses (default 60000) |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | No | API rate limit per user (default 100 requests per 15 minutes) |
| `LLM_*`, `OLLAMA_URL` | No | Optional LLM analysis, see [LLM_ANALYSIS.md](LLM_ANALYSIS.md) |
| `TEST_DATABASE_URL` | Tests only | Database for integration tests (wiped by each run) |

### 5. GitHub App Configuration

#### Create a GitHub App

1. Go to GitHub Settings > Developer settings > GitHub Apps
2. Click "New GitHub App"
3. Fill in the details:
   - **GitHub App name**: Sock Puppet Detector (Dev)
   - **Homepage URL**: http://localhost:3000
   - **Callback URL**: http://localhost:3000/api/auth/callback/github
   - **Webhook URL**: https://your-tunnel-url.example/api/webhooks/github
   - **Webhook secret**: Generate a random string
   - **Repository permissions**:
     - Issues: Read-only
     - Pull requests: Read-only
     - Metadata: Read-only
   - **Subscribe to events**:
     - Issue comment
     - Pull request review comment

   Installation events (app installed or uninstalled, repositories added or removed) are sent to the app automatically.

4. Generate a private key (download the .pem file)
5. Note your App ID, Client ID and the app's URL name, and generate a client secret

Use the GitHub App's client ID and secret for `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`. A separate OAuth App won't work: the dashboard uses the app's user tokens to find which installations each user can access.

#### Configure Local Webhook Testing

For local development, expose your local server with a tunnel such as ngrok:

```bash
ngrok http 3000
```

Update your GitHub App webhook URL with the tunnel URL.

### 6. Database Migration

Apply the migrations:

```bash
npm run db:migrate
```

### 7. Start the Application

Start the development server:

```bash
npm run dev
```

In a separate terminal, start the worker process (rebuilds and restarts on changes):

```bash
npm run worker:dev
```

The worker loads `.env` itself. The application will be available at `http://localhost:3000`.

### 8. Install the GitHub App

1. Navigate to your GitHub App page
2. Click "Install App"
3. Select your test repository
4. Authorise the installation

## Verification

1. Open `http://localhost:3000`
2. Sign in with GitHub
3. Check your repository appears under Repositories
4. Click "Analyse Now" to backfill and analyse its recent comments
5. Create a test comment on your repository; an analysis runs automatically about a minute later

The health endpoint reports database and Redis connectivity:

```bash
curl http://localhost:3000/api/health
```

## Running Tests

```bash
# Unit tests
npm test

# Integration tests (PostgreSQL and Redis; the test database is wiped)
createdb sockpuppet_test
TEST_DATABASE_URL=postgresql://sockpuppet:sockpuppet_dev_password@localhost:5432/sockpuppet_test \
  npm run test:integration

# Lint, type check and production build
npm run lint
npm run typecheck
npm run build
```

## Common Issues

### Database Connection Failed

**Problem**: Cannot connect to PostgreSQL

**Solution**:
- Check PostgreSQL is running: `pg_isready`
- Verify connection string in `.env`
- Check database exists: `psql -l`

### Redis Connection Failed

**Problem**: Cannot connect to Redis (`/api/health` reports Redis disconnected)

**Solution**:
- Check Redis is running: `redis-cli ping`
- Verify `REDIS_URL` in `.env`

### GitHub Webhook Not Receiving Events

**Problem**: Webhook events not arriving

**Solution**:
- Check the tunnel is running
- Verify webhook URL in GitHub App settings
- Check webhook secret matches `.env` (a mismatch returns 401)
- View webhook delivery logs in GitHub App settings

### Worker Not Processing Jobs

**Problem**: Analyses stay "pending"

**Solution**:
- Ensure the worker process is running
- Check it can reach Redis and PostgreSQL
- Check `GITHUB_APP_ID` and `GITHUB_APP_PRIVATE_KEY` are set; the worker logs an error for each failed job

Analyses stuck for more than 30 minutes are marked as timed out, so a new one can be started.

### Dashboard Shows No Repositories

**Problem**: Signed in, but no repositories are listed

**Solution**:
- Check the app is installed on the repository and you have access to it on GitHub
- Check `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` belong to the GitHub App (the server logs a 403 from `/user/installations` otherwise)

## Next Steps

- Read [API Documentation](API.md)
- Read [Deployment Guide](DEPLOYMENT.md)
- Explore detection algorithms in `src/lib/detection/`
