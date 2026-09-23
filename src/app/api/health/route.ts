import { NextResponse } from 'next/server';
import IORedis from 'ioredis';
import { prisma } from '@/lib/db';
import { getRedisConnectionOptions } from '@/lib/queue/connection';

export const dynamic = 'force-dynamic';

async function checkDatabase(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Health check: database connection failed:', error);
    return false;
  }
}

async function checkRedis(): Promise<boolean> {
  const redis = new IORedis({
    ...getRedisConnectionOptions(),
    lazyConnect: true,
    connectTimeout: 2000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });

  try {
    await redis.connect();
    return (await redis.ping()) === 'PONG';
  } catch (error) {
    console.error('Health check: Redis connection failed:', error);
    return false;
  } finally {
    redis.disconnect();
  }
}

export async function GET() {
  const [database, redis] = await Promise.all([checkDatabase(), checkRedis()]);
  const healthy = database && redis;

  return NextResponse.json(
    {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      services: {
        database: database ? 'connected' : 'disconnected',
        redis: redis ? 'connected' : 'disconnected',
      },
    },
    { status: healthy ? 200 : 503 }
  );
}
