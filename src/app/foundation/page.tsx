import Link from 'next/link';
import { getAnalysesFromDb, getAllFoundationDocs, isRedisConfigured } from '@/lib/db';
import { FOUNDATION_DOC_TYPES, FoundationDocType, FoundationDocument } from '@/types';

export const dynamic = 'force-dynamic';

const DOC_LABELS: Record<FoundationDocType, string> = {
  'strategy': 'Strategy',
  'positioning': 'Positioning',
  'brand-voice': 'Brand Voice',
  'design-principles': 'Design Principles',
  'seo-strategy': 'SEO Strategy',
  'social-media-strategy': 'Social Media',
};

interface IdeaFoundation {
  ideaId: string;
  ideaName: string;
  docs: Partial<Record<FoundationDocType, FoundationDocument>>;
  completedCount: number;
  totalCount: number;
}

async function getData(): Promise<IdeaFoundation[]> {
  if (!isRedisConfigured()) {
    return [];
  }

  const analyses = await getAnalysesFromDb();
  const results = await Promise.all(
    analyses.map(async (analysis) => {
      const docs = await getAllFoundationDocs(analysis.id);
      const completedCount = Object.keys(docs).length;
      return {
        ideaId: analysis.id,
        ideaName: analysis.ideaName,
        docs,
        completedCount,
        totalCount: FOUNDATION_DOC_TYPES.length,
      };
    })
  );

  // Sort: most complete first, then alphabetical
  results.sort((a, b) => b.completedCount - a.completedCount || a.ideaName.localeCompare(b.ideaName));
  return results;
}

export default async function FoundationPage() {
  const ideas = await getData();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(52, 211, 153, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Foundation Documents
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          Strategy, positioning, and brand documents for each idea.
        </p>
      </header>

      {/* Empty State */}
      {ideas.length === 0 ? (
        <div className="card-static p-8 sm:p-12 text-center animate-slide-up stagger-2">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(52, 211, 153, 0.12)' }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="4" width="16" height="16" rx="2" />
              <rect x="7" y="7" width="10" height="10" rx="1" />
              <rect x="10" y="10" width="4" height="4" rx="0.5" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No analyses yet
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Analyze an idea first, then generate foundation documents.
          </p>
          <Link href="/analysis" className="btn btn-primary">
            Go to Analysis
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
          {ideas.map((idea, index) => {
            const percent = idea.totalCount > 0 ? idea.completedCount / idea.totalCount : 0;
            const allComplete = idea.completedCount === idea.totalCount;
            const hasAny = idea.completedCount > 0;

            return (
              <div
                key={idea.ideaId}
                className="card p-5 flex flex-col"
                style={{ animationDelay: `${0.1 + index * 0.05}s` }}
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <h3 className="font-display font-medium text-base" style={{ color: 'var(--text-primary)' }}>
                    {idea.ideaName}
                  </h3>
                  <span className="text-sm shrink-0 font-medium" style={{ color: 'var(--text-muted)' }}>
                    {idea.completedCount}/{idea.totalCount}
                  </span>
                </div>

                {/* Progress bar */}
                <div
                  className="w-full h-1 rounded-full mb-3"
                  style={{ background: 'var(--border-default)' }}
                >
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${percent * 100}%`,
                      background: 'var(--accent-emerald)',
                    }}
                  />
                </div>

                {/* Doc pills */}
                <div className="flex flex-wrap gap-1.5 mb-4">
                  {FOUNDATION_DOC_TYPES.map((docType) => {
                    const hasDoc = !!idea.docs[docType];
                    return (
                      <span
                        key={docType}
                        className="text-xs px-2 py-0.5 rounded"
                        style={hasDoc
                          ? { background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)' }
                          : { background: 'var(--bg-elevated)', color: 'var(--text-muted)' }
                        }
                      >
                        {DOC_LABELS[docType]}
                      </span>
                    );
                  })}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2 mt-auto pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {!allComplete && (
                    <Link
                      href={`/foundation/${idea.ideaId}`}
                      className="btn btn-primary text-xs"
                    >
                      {hasAny ? 'Generate Missing' : 'Generate All'}
                    </Link>
                  )}
                  <Link
                    href={`/foundation/${idea.ideaId}`}
                    className="btn-ghost text-xs rounded-lg"
                    style={{ color: 'var(--text-secondary)' }}
                  >
                    View Details →
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
