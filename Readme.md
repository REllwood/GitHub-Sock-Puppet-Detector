# GitHub Sock Puppet Detector

A GitHub App that detects coordinated sock puppet attacks on repositories by analysing account patterns, behaviour, and timing - modelled after the XZ backdoor attack vector.

## Features

- **Account Age Detection**: Flag newly created accounts participating in coordinated campaigns
- **Name Pattern Analysis**: Detect suspicious naming patterns (e.g., firstname+digits)
- **Email Pattern Matching**: Identify shared email domains and disposable email providers
- **Single-Repository Activity**: Find accounts focused exclusively on one repository
- **Coordinated Behaviour Detection**: Identify temporal clustering and network-based coordination
- **LLM-Enhanced Analysis** ⭐ **NEW**: Optional AI-powered detection using local (Ollama) or cloud LLMs
  - Semantic similarity detection
  - Writing style fingerprinting
  - Social engineering tactic recognition
  - Works with GPT-5.3, Claude, or local Llama models
- **Risk Scoring System**: Weighted algorithm to calculate overall account risk (0-100)
- **Web Dashboard**: Modern UI to view analyses, alerts, and account details
- **GitHub App Integration**: Real-time webhook processing for automated analysis
- **REST API**: Public endpoints for manual analysis and data retrieval

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+
- Redis 7+
- Docker (optional, for containerised deployment)

### Installation

1. Clone the repository:

```bash
git clone https://github.com/yourusername/sock-puppet-detector.git
cd sock-puppet-detector
```

1. Install dependencies:

```bash
npm install
```

1. Copy environment variables:

```bash
cp .env.example .env
```

1. Configure your environment variables in `.env`:

```bash
# GitHub App credentials
GITHUB_APP_ID=your_app_id
GITHUB_APP_PRIVATE_KEY=your_private_key
GITHUB_WEBHOOK_SECRET=your_webhook_secret
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret

# Database
DATABASE_URL=postgresql://sockpuppet:password@localhost:5432/sockpuppet

# Redis
REDIS_URL=redis://localhost:6379

# NextAuth
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
```

1. Start PostgreSQL and Redis (using Docker):

```bash
docker-compose -f docker-compose.dev.yml up -d
```

1. Run database migrations:

```bash
npm run db:migrate
```

1. Start the development server:

```bash
npm run dev
```

1. Start the worker process (in a separate terminal):

```bash
npm run worker:dev
```

The application will be available at `http://localhost:3000`.

## GitHub App Setup

1. Go to GitHub Settings > Developer Settings > GitHub Apps
2. Create a new GitHub App with:
  - **Webhook URL**: `https://your-domain.com/api/webhooks/github`
  - **Webhook Secret**: Generate a secure random string
  - **Permissions**:
    - Repository permissions: Issues (Read), Pull requests (Read), Metadata (Read)
  - **Subscribe to events**: `issue_comment`, `pull_request_review_comment`, `installation`
3. Generate a private key and save it
4. Note your App ID and Client ID
5. Update your `.env` file with these credentials

## Docker Deployment

Build and run with Docker Compose:

```bash
docker-compose up -d
```

This will start:

- Next.js application (port 3000)
- PostgreSQL database (port 5432)
- Redis (port 6379)

## Usage

### Installing the App

1. Navigate to your GitHub App's public page
2. Click "Install"
3. Select repositories to monitor
4. The app will start analysing comments automatically

### Triggering Manual Analysis

Via Dashboard:

1. Go to Dashboard > Repositories
2. Click "Analyse Now" on any repository

Via API:

```bash
curl -X POST https://your-domain.com/api/analyse/owner/repo
```

### Viewing Results

1. Go to Dashboard
2. View risk distribution and recent analyses
3. Click on any analysis to see detailed results
4. View account details and flagged reasons

## API Documentation

See [API.md](docs/API.md) for detailed API documentation.

## Architecture

- **Frontend**: Next.js 14+ with React Server Components
- **Backend**: Next.js API routes
- **Database**: PostgreSQL with Prisma ORM
- **Queue**: BullMQ with Redis for background jobs
- **Authentication**: NextAuth.js with GitHub OAuth

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
7. **LLM Analysis** (20%, optional): AI-powered semantic and social engineering analysis

Risk levels: **low** 0-30, **medium** 31-60, **high** 61-85, **critical** 86-100. An alert is
raised when an account reaches high or critical risk.

### LLM Analysis (Optional)

Enable advanced AI-powered detection with local or cloud LLMs:

```bash
# Use local Ollama (recommended - privacy + free)
LLM_ANALYSIS_ENABLED=true
LLM_PROVIDER=ollama
LLM_MODEL=llama3.2

# Or use OpenAI GPT-5 (best accuracy)
LLM_PROVIDER=openai
LLM_MODEL=gpt-5-mini
LLM_API_KEY=your_key
```

See [LLM Analysis Guide](docs/LLM_ANALYSIS.md) for full documentation.

## Development

Run tests:

```bash
npm test
```

Run linting:

```bash
npm run lint
```

Format code:

```bash
npm run format
```