import { NextRequest, NextResponse } from 'next/server';

const RAILWAY_URL = process.env.OHDH_RAILWAY_URL;
const RAILWAY_KEY = process.env.OHDH_RAILWAY_API_KEY;

export async function GET(req: NextRequest) {
  if (!RAILWAY_URL || !RAILWAY_KEY) {
    return NextResponse.json({ error: 'Traffic tracking not configured' }, { status: 503 });
  }

  const days = req.nextUrl.searchParams.get('days') || '30';

  try {
    const res = await fetch(`${RAILWAY_URL}/traffic-sources?days=${days}`, {
      headers: {
        Authorization: `Bearer ${RAILWAY_KEY}`,
        'Content-Type': 'application/json',
      },
      next: { revalidate: 300 }, // cache 5 minutes
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `Railway returned ${res.status}` },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error('[traffic] Fetch error:', err);
    return NextResponse.json({ error: 'Failed to fetch traffic data' }, { status: 500 });
  }
}
