import { Redis } from '@upstash/redis';
import { PieceSnapshot, PerformanceAlert, WeeklyReport } from '@/types';

let redis: Redis | null = null;

function getRedis(): Redis {
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

function parseValue<T>(value: unknown): T {
  if (typeof value === 'string') {
    return JSON.parse(value) as T;
  }
  return value as T;
}

const WEEK_TTL = 26 * 7 * 24 * 60 * 60; // 26 weeks in seconds
const REPORT_TTL = 52 * 7 * 24 * 60 * 60; // 52 weeks in seconds

// Per-piece weekly snapshots
export async function saveWeeklySnapshot(weekId: string, snapshots: PieceSnapshot[]): Promise<void> {
  const key = `analytics:snapshot:${weekId}`;
  const fields: Record<string, string> = {};
  for (const snap of snapshots) {
    fields[`${snap.ideaId}:${snap.pieceId}`] = JSON.stringify(snap);
  }
  if (Object.keys(fields).length > 0) {
    await getRedis().hset(key, fields);
    await getRedis().expire(key, WEEK_TTL);
  }
}

export async function getWeeklySnapshot(weekId: string): Promise<PieceSnapshot[]> {
  const data = await getRedis().hgetall(`analytics:snapshot:${weekId}`);
  if (!data) return [];
  return Object.values(data).map((v) => parseValue<PieceSnapshot>(v));
}

// Site-level aggregate snapshot
export async function saveSiteSnapshot(weekId: string, data: Record<string, unknown>): Promise<void> {
  const key = `analytics:site_snapshot:${weekId}`;
  await getRedis().set(key, JSON.stringify(data), { ex: WEEK_TTL });
}

export async function getSiteSnapshot(weekId: string): Promise<Record<string, unknown> | null> {
  const data = await getRedis().get(`analytics:site_snapshot:${weekId}`);
  if (!data) return null;
  return parseValue<Record<string, unknown>>(data);
}

// Weekly reports
export async function saveWeeklyReport(report: WeeklyReport): Promise<void> {
  const reportJson = JSON.stringify(report);
  await getRedis().set(`analytics:report:${report.weekId}`, reportJson, { ex: REPORT_TTL });
  await getRedis().set('analytics:report:latest', reportJson);
}

export async function getWeeklyReport(weekId?: string): Promise<WeeklyReport | null> {
  const key = weekId ? `analytics:report:${weekId}` : 'analytics:report:latest';
  const data = await getRedis().get(key);
  if (!data) return null;
  return parseValue<WeeklyReport>(data);
}

export async function getReportWeekIds(): Promise<string[]> {
  const keys: string[] = [];
  let cursor = 0;
  do {
    const result = await getRedis().scan(cursor, { match: 'analytics:report:2*', count: 100 });
    cursor = Number(result[0]);
    keys.push(...result[1]);
  } while (cursor !== 0);

  return keys
    .map((k) => k.replace('analytics:report:', ''))
    .sort()
    .reverse();
}

// Performance alerts
export async function addPerformanceAlerts(alerts: PerformanceAlert[]): Promise<void> {
  if (alerts.length === 0) return;
  const serialized = alerts.map((a) => JSON.stringify(a));
  await getRedis().lpush('analytics:alerts', ...serialized);
  await getRedis().ltrim('analytics:alerts', 0, 99);
}

export async function getPerformanceAlerts(limit: number = 20): Promise<PerformanceAlert[]> {
  const entries = await getRedis().lrange('analytics:alerts', 0, limit - 1);
  return entries.map((e) => parseValue<PerformanceAlert>(e));
}
