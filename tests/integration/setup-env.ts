if (!process.env.TEST_DATABASE_URL) {
  throw new Error('TEST_DATABASE_URL must be set to run integration tests');
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.GITHUB_WEBHOOK_SECRET = 'integration-test-secret';
