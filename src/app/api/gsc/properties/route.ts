import { NextResponse } from 'next/server';
import { isGSCConfigured, listGSCProperties } from '@/lib/gsc-client';
import { getGSCPropertiesCache, saveGSCPropertiesCache, isRedisConfigured } from '@/lib/db';

export async function GET() {
  try {
    if (!isGSCConfigured()) {
      return NextResponse.json(
        { error: 'Google Search Console is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.' },
        { status: 503 },
      );
    }

    // Check cache first
    if (isRedisConfigured()) {
      const cached = await getGSCPropertiesCache();
      if (cached) {
        return NextResponse.json({ properties: cached, cached: true });
      }
    }

    const properties = await listGSCProperties();

    // Cache for 1 hour
    if (isRedisConfigured()) {
      await saveGSCPropertiesCache(properties);
    }

    return NextResponse.json({ properties, cached: false });
  } catch (error) {
    console.error('Error listing GSC properties:', error);
    return NextResponse.json({ error: 'Failed to list GSC properties' }, { status: 500 });
  }
}
