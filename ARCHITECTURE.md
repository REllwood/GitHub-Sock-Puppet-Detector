# GitHub Sock Puppet Detector

## Project Structure

```
/
├── src/
│   ├── app/                    # Next.js app router
│   │   ├── api/               # API routes
│   │   │   ├── webhooks/      # GitHub webhook handlers
│   │   │   ├── auth/          # NextAuth endpoints
│   │   │   ├── analyse/       # Manual analysis triggers
│   │   │   ├── analysis/      # Analysis results
│   │   │   ├── repositories/  # Repository listings
│   │   │   └── accounts/      # Account profiles
│   │   ├── dashboard/         # Dashboard pages
│   │   │   ├── repositories/  # Repository management
│   │   │   ├── analysis/      # Analysis results
│   │   │   ├── accounts/      # Account details
│   │   │   └── alerts/        # Alert management
│   │   └── auth/              # Authentication pages
│   ├── lib/                   # Core libraries
│   │   ├── detection/         # Detection algorithms
│   │   │   ├── account-age.ts
│   │   │   ├── name-patterns.ts
│   │   │   ├── email-patterns.ts
│   │   │   ├── single-repo.ts
│   │   │   ├── coordinated-behaviour.ts
│   │   │   ├── temporal-analysis.ts
│   │   │   ├── risk-scorer.ts
│   │   │   └── analyzer.ts
│   │   ├── github/            # GitHub API integration
│   │   │   ├── app-auth.ts
│   │   │   ├── api-client.ts
│   │   │   └── webhook-validator.ts
│   │   ├── queue/             # Background job processing
│   │   │   ├── setup.ts
│   │   │   └── workers.ts
│   │   └── db.ts              # Prisma database client
│   ├── components/            # React components
│   │   ├── ui/                # Reusable UI components
│   │   ├── DashboardNav.tsx
│   │   ├── ProtectedRoute.tsx
│   │   └── AuthProvider.tsx
│   └── types/                 # TypeScript types
│       ├── github.ts
│       ├── analysis.ts
│       └── next-auth.d.ts
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── migrations/            # Database migrations
├── tests/
│   ├── unit/                  # Unit tests
│   └── integration/           # Integration tests
├── docs/                      # Documentation
│   ├── SETUP.md
│   ├── API.md
│   └── DEPLOYMENT.md
├── scripts/
│   └── worker.js              # Worker process script
├── docker-compose.yml         # Production Docker config
├── docker-compose.dev.yml     # Development Docker config
├── Dockerfile
├── next.config.js
├── tailwind.config.ts
├── tsconfig.json
├── jest.config.js
└── package.json
```

## Key Components

### Detection Engines

1. **Account Age Detector** (`src/lib/detection/account-age.ts`)
   - Flags accounts based on creation date
   - Scoring: Newer accounts = higher scores

2. **Name Pattern Analyser** (`src/lib/detection/name-patterns.ts`)
   - Detects suspicious username patterns
   - Patterns: firstname+digits, generic names

3. **Email Pattern Matcher** (`src/lib/detection/email-patterns.ts`)
   - Identifies shared email domains
   - Detects disposable email providers

4. **Single-Repository Detector** (`src/lib/detection/single-repo.ts`)
   - Finds accounts focused on one repo
   - Threshold: 90%+ activity in single repo

5. **Coordinated Behaviour Analyser** (`src/lib/detection/coordinated-behaviour.ts`)
   - Network analysis of account interactions
   - Writing style similarity detection

6. **Temporal Analysis** (`src/lib/detection/temporal-analysis.ts`)
   - Detects time-based clustering
   - Identifies accounts that always comment together

### Risk Scoring System

Located in `src/lib/detection/risk-scorer.ts`:

```typescript
const DETECTION_WEIGHTS = {
  accountAge: 0.15,
  namePattern: 0.20,
  emailPattern: 0.15,
  singleRepo: 0.10,
  coordinatedBehaviour: 0.30,
  temporalClustering: 0.10,
};
```

Risk levels:
- 0-30: Low (green)
- 31-60: Medium (yellow)
- 61-85: High (orange)
- 86-100: Critical (red)

### Database Schema

See `prisma/schema.prisma` for complete schema.

Key models:
- `Repository`: Monitored GitHub repositories
- `Account`: GitHub user accounts
- `Comment`: Comments from accounts
- `Analysis`: Analysis runs
- `AccountAnalysis`: Per-account analysis results
- `Alert`: Generated alerts
- `Installation`: GitHub App installations

### Job Queue

Uses BullMQ with Redis for background processing:

**Queues**:
1. `analyze-comment`: Process individual comments
2. `analyze-repository`: Full repository analysis

**Workers** (`src/lib/queue/workers.ts`):
- Concurrent processing
- Rate limiting
- Retry logic
- Error handling

### API Routes

**Public API**:
- `POST /api/analyse/:owner/:repo` - Trigger analysis
- `GET /api/analysis/:id` - Get analysis results
- `GET /api/repositories` - List repositories
- `GET /api/accounts/:username` - Get account profile

**Internal API**:
- `POST /api/webhooks/github` - GitHub webhook receiver
- `GET /api/health` - Health check

### Authentication

NextAuth.js with GitHub OAuth:
- Session-based authentication
- GitHub profile integration
- Protected routes
- API authentication

## Development Workflow

1. **Local Development**:
   - Run `npm run dev` for Next.js
   - Run `npm run worker` for background jobs
   - Use `npm run db:studio` for database GUI

2. **Testing**:
   - Unit tests: `npm test`
   - Watch mode: `npm test:watch`
   - Coverage: `npm test:coverage`

3. **Linting & Formatting**:
   - Lint: `npm run lint`
   - Format: `npm run format`

4. **Database**:
   - Migrate: `npm run db:migrate`
   - Generate client: `npm run db:generate`
   - Studio: `npm run db:studio`

## Customisation

### Adjusting Detection Weights

Edit `src/lib/detection/risk-scorer.ts`:

```typescript
const DETECTION_WEIGHTS = {
  accountAge: 0.15,        // Adjust these values
  namePattern: 0.20,       // to change scoring
  emailPattern: 0.15,
  singleRepo: 0.10,
  coordinatedBehaviour: 0.30,
  temporalClustering: 0.10,
};
```

### Changing Risk Thresholds

```typescript
const RISK_THRESHOLDS = {
  low: { min: 0, max: 30 },
  medium: { min: 31, max: 60 },
  high: { min: 61, max: 85 },
  critical: { min: 86, max: 100 },
};
```

### Adding New Detection Algorithms

1. Create new file in `src/lib/detection/`
2. Export function returning `DetectionResult`
3. Update `src/lib/detection/analyzer.ts`
4. Update risk scoring weights
5. Add tests in `tests/unit/`

## Architecture Decisions

### Why Next.js?

- Unified frontend and backend
- Server-side rendering for SEO
- API routes for webhooks
- React for modern UI

### Why PostgreSQL?

- Robust ACID compliance
- Complex queries for pattern detection
- JSON support for flexible data
- Proven scalability

### Why BullMQ?

- Redis-backed reliability
- Job prioritisation
- Rate limiting
- Retry mechanisms

### Why Prisma?

- Type-safe database queries
- Easy migrations
- Excellent TypeScript support
- Good developer experience

## Performance Considerations

- Database indexes on frequently queried fields
- Pagination for large result sets
- Background job processing for heavy analysis
- Redis caching for repeated queries
- Connection pooling for database

## Security Considerations

- Webhook signature verification
- Environment variable secrets
- SQL injection prevention (Prisma)
- XSS prevention (React)
- Rate limiting on API endpoints
- Secure session management

## Future Enhancements

- Machine learning models for detection
- Browser extension
- Public API with API keys
- Slack/Discord integrations
- Multi-platform support (GitLab, Bitbucket)
- Advanced analytics dashboard
