import { Redis } from '@upstash/redis';
import type { AgentEvent } from '@/types';

let redis: Redis | null = null;

function getRedis(): Redis {
  if (!redis) {
    const url = process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
      throw new Error('Redis not configured');
    }
    redis = new Redis({ url, token });
  }
  return redis;
}

const EVENT_TTL = 86400; // 24 hours

function eventsKey(ideaId: string): string {
  return `agent_events:${ideaId}`;
}

export async function emitEvent(event: AgentEvent): Promise<void> {
  const key = eventsKey(event.ideaId);
  const r = getRedis();
  await r.rpush(key, JSON.stringify(event));
  await r.expire(key, EVENT_TTL);
}

export async function getEvents(ideaId: string, since?: string): Promise<AgentEvent[]> {
  const r = getRedis();
  const raw = await r.lrange(eventsKey(ideaId), 0, -1);
  const events = raw.map((item) => {
    if (typeof item === 'string') return JSON.parse(item) as AgentEvent;
    return item as AgentEvent;
  });

  if (!since) return events;

  const sinceTime = new Date(since).getTime();
  return events.filter((e) => new Date(e.timestamp).getTime() > sinceTime);
}

export async function clearEvents(ideaId: string): Promise<void> {
  await getRedis().del(eventsKey(ideaId));
}
