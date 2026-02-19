import { NextRequest, NextResponse } from 'next/server';
import { deletePaintedDoorProgress, deleteBuildSession, deleteConversationHistory, getPaintedDoorSite, savePaintedDoorSite } from '@/lib/painted-door-db';

/**
 * POST — reset build state for rebuild.
 * Clears progress, build session, and chat history but preserves the site record
 * (repo, Vercel project, signup count) so rebuilds reuse existing infrastructure.
 */
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;

  await deletePaintedDoorProgress(id);
  await deleteBuildSession(id);
  await deleteConversationHistory(id);

  // Reset site status so the autonomous pipeline will re-run
  const site = await getPaintedDoorSite(id);
  if (site && (site.status === 'failed' || site.status === 'deploying')) {
    site.status = 'pushing';
    site.error = undefined;
    await savePaintedDoorSite(site);
  }

  return NextResponse.json({ message: 'Build state reset', ideaId: id });
}
