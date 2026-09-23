import { execSync } from 'node:child_process';

export default function globalSetup() {
  if (!process.env.TEST_DATABASE_URL) {
    throw new Error('TEST_DATABASE_URL must be set to run integration tests');
  }

  execSync('npx prisma migrate reset --force --skip-generate --skip-seed', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
