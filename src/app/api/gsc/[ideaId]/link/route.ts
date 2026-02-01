import { NextRequest, NextResponse } from 'next/server';
import { saveGSCLink, deleteGSCLink, isRedisConfigured } from '@/lib/db';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  try {
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const { ideaId } = await params;
    const { siteUrl } = await request.json();

    if (!siteUrl) {
      return NextResponse.json({ error: 'siteUrl is required' }, { status: 400 });
    }

    const link = {
      ideaId,
      siteUrl,
      linkedAt: new Date().toISOString(),
    };

    await saveGSCLink(link);
    return NextResponse.json({ link });
  } catch (error) {
    console.error('Error linking GSC property:', error);
    return NextResponse.json({ error: 'Failed to link GSC property' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ ideaId: string }> },
) {
  try {
    if (!isRedisConfigured()) {
      return NextResponse.json({ error: 'Redis not configured' }, { status: 503 });
    }

    const { ideaId } = await params;
    await deleteGSCLink(ideaId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error unlinking GSC property:', error);
    return NextResponse.json({ error: 'Failed to unlink GSC property' }, { status: 500 });
  }
}
