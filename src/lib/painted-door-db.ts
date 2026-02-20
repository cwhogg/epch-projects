import { getRedis, parseValue } from './redis';
import type { BrandIdentity, PaintedDoorSite, PaintedDoorProgress, BuildSession, ChatMessage } from '@/types';
import { PublishTarget } from './publish-targets';

// ---------- Brand Normalization ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeBrandIdentity(raw: any): BrandIdentity {
  const colors = raw.colors || {};
  const fonts = raw.fonts || raw.typography || {};

  return {
    siteName: raw.siteName || '',
    tagline: raw.tagline || '',
    siteUrl: raw.siteUrl || '',
    colors: {
      primary: colors.primary || '',
      primaryLight: colors.primaryLight || '',
      background: colors.background || '',
      backgroundElevated: colors.backgroundElevated || '',
      text: colors.text || colors.textPrimary || '',
      textSecondary: colors.textSecondary || '',
      textMuted: colors.textMuted || '',
      accent: colors.accent || '',
      border: colors.border || '',
    },
    fonts: {
      heading: fonts.heading || fonts.headingFont || '',
      body: fonts.body || fonts.bodyFont || '',
      mono: fonts.mono || fonts.monoFont || '',
    },
    theme: raw.theme === 'dark' ? 'dark' : 'light',
  };
}

// ---------- Painted Door Sites ----------

export async function savePaintedDoorSite(site: PaintedDoorSite): Promise<void> {
  await getRedis().hset('painted_door_sites', { [site.ideaId]: JSON.stringify(site) });
}

export async function getPaintedDoorSite(ideaId: string): Promise<PaintedDoorSite | null> {
  const data = await getRedis().hget('painted_door_sites', ideaId);
  if (!data) return null;
  const site = parseValue<PaintedDoorSite>(data);
  if (site?.brand) site.brand = normalizeBrandIdentity(site.brand);
  return site;
}

export async function getAllPaintedDoorSites(): Promise<PaintedDoorSite[]> {
  const data = await getRedis().hgetall('painted_door_sites');
  if (!data) return [];
  return Object.values(data).map((v) => {
    const site = parseValue<PaintedDoorSite>(v);
    if (site?.brand) site.brand = normalizeBrandIdentity(site.brand);
    return site;
  }).filter((s): s is PaintedDoorSite => s != null);
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

// ---------- Build Session Storage (4-hour TTL) ----------

const BUILD_SESSION_TTL = 14400;

export async function saveBuildSession(ideaId: string, session: BuildSession): Promise<void> {
  const r = getRedis();
  await r.set(`build_session:${ideaId}`, JSON.stringify(session), { ex: BUILD_SESSION_TTL });
}

export async function getBuildSession(ideaId: string): Promise<BuildSession | null> {
  const r = getRedis();
  const raw = await r.get(`build_session:${ideaId}`);
  return raw ? parseValue<BuildSession>(raw) : null;
}

export async function deleteBuildSession(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`build_session:${ideaId}`);
}

// ---------- Conversation History Storage (4-hour TTL) ----------

export async function saveConversationHistory(ideaId: string, messages: ChatMessage[]): Promise<void> {
  const r = getRedis();
  await r.set(`chat_history:${ideaId}`, JSON.stringify(messages), { ex: BUILD_SESSION_TTL });
}

export async function getConversationHistory(ideaId: string): Promise<ChatMessage[]> {
  const r = getRedis();
  const raw = await r.get(`chat_history:${ideaId}`);
  return raw ? parseValue<ChatMessage[]>(raw) : [];
}

export async function deleteConversationHistory(ideaId: string): Promise<void> {
  const r = getRedis();
  await r.del(`chat_history:${ideaId}`);
}

