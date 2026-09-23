import type { RedisOptions } from 'ioredis';

const DEFAULT_REDIS_URL = 'redis://localhost:6379';

/**
 * Build BullMQ connection options from REDIS_URL.
 * Supports redis:// and rediss:// (TLS) URLs with optional credentials and database index.
 */
export function getRedisConnectionOptions(
  redisUrl: string = process.env.REDIS_URL || DEFAULT_REDIS_URL
): RedisOptions {
  const url = new URL(redisUrl);

  if (url.protocol !== 'redis:' && url.protocol !== 'rediss:') {
    throw new Error(`Unsupported REDIS_URL protocol: ${url.protocol}`);
  }

  const db = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : undefined;
  if (db !== undefined && !Number.isInteger(db)) {
    throw new Error(`Invalid Redis database index in REDIS_URL: ${url.pathname}`);
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 6379,
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    db,
    tls: url.protocol === 'rediss:' ? {} : undefined,
    // Required by BullMQ workers, which use blocking commands
    maxRetriesPerRequest: null,
  };
}
