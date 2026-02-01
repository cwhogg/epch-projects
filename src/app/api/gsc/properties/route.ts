import { NextResponse } from 'next/server';
import { isGSCConfigured, listGSCProperties } from '@/lib/gsc-client';
import { getGSCPropertiesCache, saveGSCPropertiesCache, isRedisConfigured } from '@/lib/db';

export async function GET(request: Request) {
  try {
    if (!isGSCConfigured()) {
      return NextResponse.json(
        { error: 'Google Search Console is not configured. Set GOOGLE_SERVICE_ACCOUNT_JSON or GOOGLE_CLIENT_EMAIL + GOOGLE_PRIVATE_KEY.' },
        { status: 503 },
      );
    }

    const { searchParams } = new URL(request.url);
    const refresh = searchParams.get('refresh') === 'true';

    // Check cache first (skip if refresh requested)
    if (!refresh && isRedisConfigured()) {
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
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: 'Failed to list GSC properties', detail: message }, { status: 500 });
  }
}
