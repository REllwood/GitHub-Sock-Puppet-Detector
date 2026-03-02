# API Documentation

## Base URL

```
https://your-domain.com/api
```

## Authentication

Most API endpoints require authentication. Use your GitHub OAuth token or configure API keys (future feature).

## Endpoints

### Trigger Repository Analysis

Manually trigger an analysis for a specific repository.

**Endpoint**: `POST /analyse/:owner/:repo`

**Parameters**:
- `owner` (path): Repository owner
- `repo` (path): Repository name

**Response**:
```json
{
  "message": "Analysis queued successfully",
  "repository": "owner/repo"
}
```

**Example**:
```bash
curl -X POST https://your-domain.com/api/analyse/octocat/Hello-World
```

### Get Repository Analyses

Get analysis history for a repository.

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
      "createdAt": "2024-01-01T00:00:00Z",
      "accountResults": [...]
    }
  ]
}
```

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
      "fullName": "owner/repo"
    },
    "accountResults": [
      {
        "account": {
          "username": "suspicioususer",
          "createdAt": "2024-01-01T00:00:00Z"
        },
        "riskScore": 85.5,
        "detections": {
          "accountAge": { "detected": true, "score": 80 },
          "namePattern": { "detected": true, "score": 60 }
        }
      }
    ],
    "detectedClusters": []
  }
}
```

### List Repositories

Get all monitored repositories.

**Endpoint**: `GET /repositories`

**Response**:
```json
{
  "repositories": [
    {
      "id": "abc123",
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

Get risk profile for a specific GitHub account.

**Endpoint**: `GET /accounts/:username`

**Parameters**:
- `username` (path): GitHub username

**Response**:
```json
{
  "account": {
    "username": "testuser",
    "riskScore": 45.2,
    "flagReasons": [
      "Age: Account is 15 days old",
      "Name: Word followed by digits"
    ],
    "comments": [...],
    "analyses": [...]
  }
}
```

### Health Check

Check application health status.

**Endpoint**: `GET /health`

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "connected"
  }
}
```

## Webhooks

The application receives webhooks from GitHub:

**Endpoint**: `POST /webhooks/github`

**Events**:
- `issue_comment.created`: New issue comment
- `pull_request_review_comment.created`: New PR review comment
- `installation.created`: App installed
- `installation.deleted`: App uninstalled

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message description"
}
```

**Status Codes**:
- `200`: Success
- `202`: Accepted (processing)
- `400`: Bad request
- `401`: Unauthorized
- `404`: Not found
- `500`: Internal server error

## Rate Limiting

API requests are rate limited to prevent abuse:
- 100 requests per 15 minutes per IP
- 1000 requests per hour per authenticated user

## Webhooks Signature Verification

All webhook requests include an `X-Hub-Signature-256` header for verification:

```javascript
const crypto = require('crypto');

function verifySignature(payload, signature, secret) {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(digest));
}
```
