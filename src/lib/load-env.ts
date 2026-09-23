import { existsSync } from 'node:fs';

/**
 * Load variables from .env for standalone processes (the worker).
 * Next.js loads .env itself; variables already set in the environment take precedence.
 */
if (existsSync('.env')) {
  process.loadEnvFile('.env');
}
