# API Documentation

## Base URL

```
https://your-domain.com/api
```

## Authentication

All endpoints except the webhook, health check and sign-in routes require a signed-in user.

- **Browser**: sign in to the dashboard with GitHub; the session cookie is sent automatically.
- **Scripts**: send the value of the `next-auth.session-token` cookie (or `__Secure-next-auth.session-token` on HTTPS deployments) as a bearer token:

```bash
curl https://your-domain.com/api/repositories \
  -H "Authorization: Bearer <session token>"
```

Sessions last up to 24 hours. Requests without a valid session return `401`.

## Access Scoping

Every response is limited to repositories where the GitHub App is installed **and** that the signed-in user can access on GitHub (checked with their GitHub token and cached for 5 minutes). Users listed in `ADMIN_GITHUB_LOGINS` can see every repository.

Repositories, analyses and accounts outside the user's access return `404`, exactly as if they didn't exist. An account's risk score and flag reasons are calculated only from analyses of repositories the user can access.

## Rate Limiting

Each signed-in user can make `RATE_LIMIT_MAX_REQUESTS` requests per `RATE_LIMIT_WINDOW_MS` (default: 100 requests per 15 minutes) across all API endpoints. Beyond that the API returns `429 Too Many Requests` with a `Retry-After` header (seconds).

## Endpoints

### Trigger Repository Analysis

Start a manual analysis of a repository. It syncs recent comments and commenter profiles from GitHub, runs the detectors and raises alerts for high-risk accounts.

**Endpoint**: `POST /analyse/:owner/:repo`

**Parameters**:
- `owner` (path): Repository owner
- `repo` (path): Repository name

**Response** (`202 Accepted`):
```json
{
  "message": "Analysis queued successfully",
  "repository": "owner/repo",
  "analysisId": "cm1abc..."
}
```

If an analysis of the repository is already pending or running, its ID is returned with the message `"Analysis already in progress"`. Poll `GET /analysis/:id` for the result.

**Example**:
```bash
curl -X POST https://your-domain.com/api/analyse/octocat/Hello-World \
  -H "Authorization: Bearer <session token>"
```

### Get Repository Analyses

Get the 10 most recent analyses of a repository.

**Endpoint**: `GET /analyse/:owner/:repo`

**Response**:
```json
{
  "repository": {
    "id": "abc123",
    "fullName": "owner/repo",
    "installationId": 12345
  },
  "analyses": [
    {
      "id": "xyz789",
      "status": "completed",
      "triggeredBy": "webhook",
      "createdAt": "2026-01-01T00:00:00.000Z",
      "completedAt": "2026-01-01T00:00:05.000Z",
      "accountResults": [...]
    }
  ]
}
```

Analysis `status` is one of `pending`, `processing`, `completed` or `failed` (with `errorMessage`).

### Get Analysis Details

Get detailed results for a specific analysis.

**Endpoint**: `GET /analysis/:id`

**Parameters**:
- `id` (path): Analysis ID

**Response**:
```json
{
  "analysis": {
    "id": "xyz789",
    "status": "completed",
    "repository": {
      "fullName": "owner/repo",
      "githubId": "123456789"
    },
    "accountResults": [
      {
        "account": {
          "username": "suspicioususer",
          "createdAt": "2026-01-01T00:00:00.000Z"
        },
        "riskScore": 72.4,
        "detections": {
          "accountAge": { "detected": true, "score": 100, "reason": "Account was 3 days old when it first commented" },
          "namePattern": { "detected": false, "score": 0 },
          "emailPattern": { "detected": false, "score": 0, "evaluated": false },
          "singleRepo": { "detected": true, "score": 80, "reason": "95% of recent public activity is in this repository" },
          "coordinatedBehaviour": { "detected": true, "score": 85, "reason": "near-identical comments to otheruser" },
          "temporalClustering": { "detected": true, "score": 65, "reason": "First appeared in #42 alongside 2 other new account(s) within 40 minutes" }
        }
      }
    ],
    "detectedClusters": [
      {
        "type": "coordination",
        "accounts": ["otheruser", "suspicioususer"],
        "score": 85,
        "strength": 0.85,
        "patterns": ["near-identical comments", "same threads"]
      }
    ]
  }
}
```

A detection with `"evaluated": false` had no data to work with (for example no public email) and doesn't count towards the risk score. `llmAnalysis` is included when LLM analysis is enabled. Cluster `type` is `coordination`, `temporal` (a burst of new accounts, with `thread` and `timeWindow`) or `llm`.

GitHub IDs are returned as strings because they can exceed JavaScript's safe integer range.

### List Repositories

Get the monitored repositories the user can access.

**Endpoint**: `GET /repositories`

**Response**:
```json
{
  "repositories": [
    {
      "id": "abc123",
      "githubId": "123456789",
      "fullName": "owner/repo",
      "installationId": 12345,
      "_count": {
        "analyses": 5,
        "alerts": 2
      }
    }
  ]
}
```

### Get Account Risk Profile

Get the risk profile for a GitHub account that has commented in one of the user's repositories.

**Endpoint**: `GET /accounts/:username`

**Parameters**:
- `username` (path): GitHub username

**Response**:
```json
{
  "account": {
    "username": "testuser",
    "githubId": 1234567,
    "accountType": "User",
    "email": null,
    "createdAt": "2026-01-01T00:00:00.000Z",
    "riskScore": 45.2,
    "flagReasons": [
      "Age: Account was 15 days old when it first commented",
      "Name: Word followed by digits"
    ],
    "comments": [...],
    "analyses": [...]
  }
}
```

`riskScore` and `flagReasons` come from the highest-scoring of the latest analyses of each repository the user can access. `comments` lists up to 100 recent comments in those repositories.

### Health Check

Check application health. No authentication required.

**Endpoint**: `GET /health`

**Response** (`200`, or `503` if the database or Redis is unreachable):
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

## Webhooks

The application receives webhooks from GitHub. No session is needed, but every request must carry a valid signature.

**Endpoint**: `POST /webhooks/github`

**Events**:
- `issue_comment` (`created`, `edited`, `deleted`): Issue and pull request conversation comments
- `pull_request_review_comment` (`created`, `edited`, `deleted`): Pull request review comments
- `installation` (`created`, `deleted`, `new_permissions_accepted`): App installed, uninstalled or permissions updated
- `installation_repositories` (`added`, `removed`): Repositories added to or removed from an installation
- `ping`: Sent when the webhook is configured

Comments by bots are ignored. Uninstalling the app, or removing a repository from it, deletes that repository's stored comments, analyses and alerts.

**Responses**:
- `200`: Processed; the body includes a `status` of `stored`, `updated`, `deleted` or `ignored`
- `400`: Missing event type or malformed JSON
- `401`: Missing or invalid signature
- `500`: Processing error (GitHub shows the delivery as failed so it can be redelivered)

### Signature Verification

GitHub signs each delivery with an `X-Hub-Signature-256` header, an HMAC-SHA256 of the raw request body using the webhook secret. The app verifies it with a constant-time comparison:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const expected = Buffer.from(
    'sha256=' + crypto.createHmac('sha256', secret).update(payload).digest('hex')
  );
  const received = Buffer.from(signature);
  return received.length === expected.length && crypto.timingSafeEqual(received, expected);
}
```

## Error Responses

All endpoints return errors in the same format:

```json
{
  "error": "Error message description"
}
```

**Status Codes**:
- `200`: Success
- `202`: Accepted (analysis queued or already running)
- `400`: Bad request
- `401`: Not signed in, session expired, or invalid webhook signature
- `404`: Not found, or not accessible to the signed-in user
- `429`: Rate limit exceeded
- `500`: Internal server error
