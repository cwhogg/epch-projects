import { NextResponse } from 'next/server';
import { isRedisConfigured } from '@/lib/db';
import { getAllPaintedDoorSites, getEmailSignupCount } from '@/lib/painted-door-db';

// GET — list all painted door sites
export async function GET() {
  if (!isRedisConfigured()) {
    return NextResponse.json(
      { error: 'Database not configured' },
      { status: 500 },
    );
  }

  try {
    const sites = await getAllPaintedDoorSites();

    // Enrich with current signup counts
    const enriched = await Promise.all(
      sites.map(async (site) => {
        const signupCount = await getEmailSignupCount(site.id);
        return { ...site, signupCount };
      }),
    );

    return NextResponse.json(enriched);
  } catch (error) {
    console.error('Error fetching painted door sites:', error);
    return NextResponse.json({ error: 'Failed to fetch sites' }, { status: 500 });
  }
}
