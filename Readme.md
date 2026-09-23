# GitHub Sock Puppet Detector

A GitHub App that detects coordinated sock puppet attacks on repositories by analysing account patterns, behaviour, and timing - modelled after the XZ backdoor attack vector.

## Features

- **Account Age Detection**: Flags accounts that were only days or weeks old when they started commenting
- **Name Pattern Analysis**: Detects suspicious naming patterns (e.g. `JiaT75`, `user1234`)
- **Email Pattern Matching**: Identifies disposable and throwaway email addresses
- **Activity Focus**: Finds accounts whose public GitHub activity is concentrated on one repository, or that have an empty profile
- **Coordinated Behaviour Detection**: Finds accounts posting identical or similar messaging, especially on the same threads, and groups of accounts acting together
- **Newcomer Bursts**: Detects several new accounts arriving on the same thread within hours
- **LLM-Enhanced Analysis** (optional): Semantic coordination, writing style and social engineering analysis using a local (Ollama) or cloud (OpenAI, Anthropic) model
- **Risk Scoring System**: Weighted score (0-100) per account, with alerts for high and critical risk
- **Web Dashboard**: Repositories, analyses, alerts and per-account detection breakdowns, scoped to the repositories each user can access on GitHub
- **GitHub App Integration**: Real-time webhook processing plus backfill of recent comment history
- **REST API**: Authenticated endpoints for triggering analyses and retrieving results

## How It Works

1. GitHub sends a webhook when someone comments on an issue or pull request in a repository where the app is installed.
2. The comment is stored and a background job syncs the author's GitHub profile (account creation date, public email, recent public activity).
3. Analyses are debounced per repository, so a burst of comments produces one analysis. The worker scores every commenter in the context of the repository's other commenters.
4. Accounts that reach high or critical risk raise an alert on the dashboard.

You can also start an analysis manually from the dashboard or the API. The first analysis of a repository backfills its last 90 days of comments from the GitHub API.

## Quick Start

### Prerequisites

- Node.js 20.12+
- PostgreSQL 16+
- Redis 7+
- Docker (optional, for local services and containerised deployment)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/REllwood/GitHub-Sock-Puppet-Detector.git
cd GitHub-Sock-Puppet-Detector
```

2. Install dependencies (this also generates the Prisma client):

```bash
npm install
```

3. Copy environment variables:

```bash
cp .env.example .env
```

4. Create a GitHub App (see [GitHub App Setup](#github-app-setup)) and fill in `.env`:

```bash
# GitHub App credentials
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_CLIENT_ID=your_app_client_id
GITHUB_CLIENT_SECRET=your_app_client_secret
GITHUB_APP_SLUG=your-app-name

# Database
DATABASE_URL=postgresql://sockpuppet:sockpuppet_dev_password@localhost:5432/sockpuppet

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_SECRET=generate_with_openssl_rand_base64_32
NEXTAUTH_URL=http://localhost:3000
```

5. Start PostgreSQL and Redis (using Docker):

```bash
docker compose -f docker-compose.dev.yml up -d
```

6. Run database migrations:

```bash
npm run db:migrate
```

7. Start the development server:

```bash
npm run dev
```

8. Start the worker process (in a separate terminal):

```bash
npm run worker:dev
```

The application will be available at `http://localhost:3000`.

## GitHub App Setup

1. Go to GitHub Settings > Developer settings > GitHub Apps > New GitHub App
2. Configure:
   - **Homepage URL**: your app URL (e.g. `http://localhost:3000`)
   - **Callback URL**: `<NEXTAUTH_URL>/api/auth/callback/github` (used for dashboard sign-in)
   - **Webhook URL**: `https://your-domain.com/api/webhooks/github` (use a tunnel such as ngrok for local development)
   - **Webhook secret**: a long random string (`GITHUB_WEBHOOK_SECRET`)
   - **Repository permissions**: Issues (Read-only), Pull requests (Read-only), Metadata (Read-only)
   - **Subscribe to events**: Issue comment, Pull request review comment (installation events are sent to the app automatically)
3. Generate a private key (`GITHUB_APP_PRIVATE_KEY`)
4. Note the App ID, the Client ID, the app's URL name (`GITHUB_APP_SLUG`) and generate a client secret
5. Update your `.env` file with these credentials

Dashboard sign-in must use the **GitHub App's own** client ID and secret, not a separate OAuth App. The app's user tokens are what let the dashboard work out which installations and repositories each user can access.

## Docker Deployment

Build and run with Docker Compose:

```bash
docker compose up -d --build
```

This will start:

- PostgreSQL and Redis (internal only)
- A one-off `migrate` container that applies database migrations
- The Next.js application (port 3000)
- The background worker

See the [Deployment Guide](docs/DEPLOYMENT.md) for production details.

## Usage

### Installing the App

1. Navigate to your GitHub App's public page (`https://github.com/apps/<GITHUB_APP_SLUG>`)
2. Click "Install"
3. Select repositories to monitor
4. The app will start analysing comments automatically

### Signing In

Sign in to the dashboard with GitHub. You see the repositories where the app is installed and that you can access on GitHub. Logins listed in `ADMIN_GITHUB_LOGINS` can see every repository.

### Triggering Manual Analysis

Via Dashboard:

1. Go to Dashboard > Repositories
2. Click "Analyse Now" on any repository

Via API (authenticated, see [API.md](docs/API.md)):

```bash
curl -X POST https://your-domain.com/api/analyse/owner/repo \
  -H "Authorization: Bearer <session token>"
```

### Viewing Results

1. Go to the Dashboard
2. View the risk distribution and recent analyses
3. Click any analysis to see flagged accounts, detected groups and reasons
4. Click an account for its per-detector breakdown and activity

## API Documentation

See [API.md](docs/API.md) for detailed API documentation.

## Architecture

- **Frontend**: Next.js 14 with React Server Components and server actions
- **Backend**: Next.js API routes (webhooks, REST API) and a separate BullMQ worker process
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis for background jobs
- **Authentication**: NextAuth.js with the GitHub App's OAuth credentials; per-user repository access checked against GitHub

## Detection Algorithms

Each account that comments on a monitored repository is scored by the detectors below. The
risk score (0-100) is the weighted average of the detectors that had data to work with. For
example, accounts without a public email are not penalised or rewarded by the email detector.

1. **Account Age** (20%): How old the account was when it first commented in the repository (flags < 90 days)
2. **Name Pattern** (10%): Word + digits patterns such as `JiaT75`, generic names like `user123`, random-looking names. Deliberately weak evidence on its own
3. **Email Pattern** (10%): Disposable email providers and throwaway-looking addresses (public email only)
4. **Activity Focus** (10%): Recent public GitHub activity concentrated on this one repository, or an empty profile
5. **Coordinated Behaviour** (30%): Accounts posting identical or similar messaging, especially on the same threads, and groups of accounts acting together
6. **Newcomer Bursts** (20%): Several accounts appearing in the repository for the first time on the same thread within hours
7. **LLM Analysis** (optional, weighted as 20% on top of the others): AI-powered semantic and social engineering analysis

Risk levels: **low** 0-30, **medium** 31-60, **high** 61-85, **critical** 86-100. An alert is
raised when an account reaches high or critical risk.

Heuristics can't prove intent. Treat a flagged account as a prompt for a closer look, not as proof of wrongdoing.

### LLM Analysis (Optional)

Enable additional AI-powered detection with a local or cloud model:

```bash
# Use local Ollama (private and free)
LLM_ANALYSIS_ENABLED=true
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2

# Or use a cloud provider
LLM_PROVIDER=anthropic   # or openai
LLM_API_KEY=your_key
```

See [LLM Analysis Guide](docs/LLM_ANALYSIS.md) for full documentation.

## Development

Run unit tests:

```bash
npm test
```

Run integration tests (needs PostgreSQL and Redis; the test database is wiped):

```bash
TEST_DATABASE_URL=postgresql://sockpuppet:sockpuppet_dev_password@localhost:5432/sockpuppet_test \
  npm run test:integration
```

Run linting and type checks:

```bash
npm run lint
npm run typecheck
```

Format code:

```bash
npm run format
```

CI runs linting, type checks, unit tests, integration tests and a production build on every pull request.
