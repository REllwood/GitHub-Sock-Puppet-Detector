import IORedis from 'ioredis';
import { getRedisConnectionOptions } from '@/lib/queue/connection';

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

const globalForRateLimit = globalThis as unknown as { rateLimitRedis?: IORedis };

function getRedis(): IORedis {
  globalForRateLimit.rateLimitRedis ??= new IORedis({
    ...getRedisConnectionOptions(),
    // Give up quickly (and fail open) rather than holding requests while Redis is unavailable
    maxRetriesPerRequest: 1,
    commandTimeout: 1000,
    connectTimeout: 2000,
  });
  return globalForRateLimit.rateLimitRedis;
}

export async function closeRateLimiter() {
  const redis = globalForRateLimit.rateLimitRedis;
  globalForRateLimit.rateLimitRedis = undefined;
  if (!redis || redis.status === 'end') return;

  await new Promise<void>(resolve => {
    redis.once('end', () => resolve());
    redis.disconnect();
  });
}

function positiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Fixed-window rate limit (RATE_LIMIT_MAX_REQUESTS per RATE_LIMIT_WINDOW_MS) shared across
 * app instances via Redis. Fails open if Redis is unavailable.
 */
export async function checkRateLimit(key: string): Promise<RateLimitResult> {
  const limit = positiveNumber(process.env.RATE_LIMIT_MAX_REQUESTS, 100);
  const windowMs = positiveNumber(process.env.RATE_LIMIT_WINDOW_MS, 15 * 60 * 1000);

  const now = Date.now();
  const window = Math.floor(now / windowMs);
  const retryAfterSeconds = Math.ceil(((window + 1) * windowMs - now) / 1000);
  const redisKey = `ratelimit:${key}:${window}`;

  try {
    const results = await getRedis().multi().incr(redisKey).pexpire(redisKey, windowMs).exec();
    const count = Number(results?.[0]?.[1] ?? 0);

    return {
      allowed: count <= limit,
      limit,
      remaining: Math.max(0, limit - count),
      retryAfterSeconds,
    };
  } catch (error) {
    console.error('Rate limiting unavailable (allowing request):', error);
    return { allowed: true, limit, remaining: limit, retryAfterSeconds: 0 };
  }
}
