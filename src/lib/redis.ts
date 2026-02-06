import { Redis } from '@upstash/redis';

let redis: Redis | null = null;

export function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Redis not configured: missing UPSTASH_REDIS_REST_URL or UPSTASH_REDIS_REST_TOKEN');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

export function isRedisConfigured(): boolean {
  return !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN);
}

export function parseValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}
