import { getRedis, parseValue } from './redis';
import { PaintedDoorSite, PaintedDoorProgress } from '@/types';
import { PublishTarget } from './publish-targets';

// ---------- Painted Door Sites ----------

export async function savePaintedDoorSite(site: PaintedDoorSite): Promise<void> {
  await getRedis().hset('painted_door_sites', { [site.ideaId]: JSON.stringify(site) });
}

export async function getPaintedDoorSite(ideaId: string): Promise<PaintedDoorSite | null> {
  const data = await getRedis().hget('painted_door_sites', ideaId);
  if (!data) return null;
  return parseValue<PaintedDoorSite>(data);
}

export async function getAllPaintedDoorSites(): Promise<PaintedDoorSite[]> {
  const data = await getRedis().hgetall('painted_door_sites');
  if (!data) return [];
  return Object.values(data).map((v) => parseValue<PaintedDoorSite>(v));
}

// ---------- Progress Tracking ----------

export async function savePaintedDoorProgress(ideaId: string, progress: PaintedDoorProgress): Promise<void> {
  await getRedis().set(`painted_door_progress:${ideaId}`, JSON.stringify(progress), { ex: 3600 });
}

export async function getPaintedDoorProgress(ideaId: string): Promise<PaintedDoorProgress | null> {
  const data = await getRedis().get(`painted_door_progress:${ideaId}`);
  if (!data) return null;
  return data as PaintedDoorProgress;
}

export async function deletePaintedDoorProgress(ideaId: string): Promise<void> {
  await getRedis().del(`painted_door_progress:${ideaId}`);
}

export async function deletePaintedDoorSite(ideaId: string): Promise<void> {
  await getRedis().hdel('painted_door_sites', ideaId);
}

// ---------- Dynamic Publish Targets ----------

export async function saveDynamicPublishTarget(target: PublishTarget): Promise<void> {
  await getRedis().hset('painted_door_targets', { [target.id]: JSON.stringify(target) });
}

export async function getDynamicPublishTarget(targetId: string): Promise<PublishTarget | null> {
  const data = await getRedis().hget('painted_door_targets', targetId);
  if (!data) return null;
  return parseValue<PublishTarget>(data);
}

export async function getAllDynamicPublishTargets(): Promise<PublishTarget[]> {
  const data = await getRedis().hgetall('painted_door_targets');
  if (!data) return [];
  return Object.values(data).map((v) => parseValue<PublishTarget>(v));
}

export async function deleteDynamicPublishTarget(targetId: string): Promise<void> {
  await getRedis().hdel('painted_door_targets', targetId);
}

// ---------- Email Signups ----------

export async function recordEmailSignup(siteId: string, email: string, source?: string): Promise<void> {
  const entry = JSON.stringify({ email, timestamp: new Date().toISOString(), source: source || 'landing' });
  await getRedis().lpush(`email_signups:${siteId}`, entry);
  await getRedis().incr(`email_signups_count:${siteId}`);
}

export async function getEmailSignupCount(siteId: string): Promise<number> {
  const count = await getRedis().get(`email_signups_count:${siteId}`);
  return count ? Number(count) : 0;
}

export async function getEmailSignups(siteId: string, limit: number = 100): Promise<{ email: string; timestamp: string; source: string }[]> {
  const entries = await getRedis().lrange(`email_signups:${siteId}`, 0, limit - 1);
  return entries.map((e) => parseValue<{ email: string; timestamp: string; source: string }>(e));
}

export async function deleteEmailSignups(siteId: string): Promise<void> {
  await getRedis().del(`email_signups:${siteId}`);
  await getRedis().del(`email_signups_count:${siteId}`);
}

