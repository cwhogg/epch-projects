import { NextResponse } from 'next/server';
import { markPiecePublished, addPublishLogEntry } from '@/lib/db';

const BACKFILL_PIECES = [
  {
    ideaId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3',
    pieceId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3-piece-3',
    slug: 'ai-symptom-checker-complex-medical-cases-2026',
    filePath: 'content/blog/blog-ai-symptom-checker-complex-medical-cases-2026.md',
    title: 'AI Symptom Checkers for Complex Medical Cases: 2026 Guide',
  },
  {
    ideaId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3',
    pieceId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3-piece-4',
    slug: 'isabel-ddx-vs-ada-health-vs-secondlook-comparison',
    filePath: 'content/comparison/comparison-isabel-ddx-vs-ada-health-vs-secondlook-comparison.md',
    title: 'Isabel DDx vs Ada Health vs SecondLook',
  },
  {
    ideaId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3',
    pieceId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3-piece-5',
    slug: 'medical-gaslighting-documentation-strategies',
    filePath: 'content/blog/blog-medical-gaslighting-documentation-strategies.md',
    title: 'Medical Gaslighting Documentation',
  },
  {
    ideaId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3',
    pieceId: '3aeaaf7f-4fcb-4926-89eb-6c17c7b055f3-piece-7',
    slug: 'secondlook-diagnostic-guidance-platform',
    filePath: 'content/landing-page/landing-page-secondlook-diagnostic-guidance-platform.md',
    title: 'SecondLook: AI-Powered Diagnostic Guidance',
  },
];

export async function POST() {
  const results = [];
  for (const piece of BACKFILL_PIECES) {
    await markPiecePublished(piece.ideaId, piece.pieceId, {
      slug: piece.slug,
      commitSha: 'backfilled',
      filePath: piece.filePath,
      publishedAt: '2026-01-31T00:00:00.000Z',
    });
    results.push(piece.title);
  }

  await addPublishLogEntry({
    timestamp: new Date().toISOString(),
    action: 'backfill',
    detail: `Backfilled ${BACKFILL_PIECES.length} pre-existing published pieces`,
    status: 'success',
  });

  return NextResponse.json({ backfilled: results.length, pieces: results });
}
