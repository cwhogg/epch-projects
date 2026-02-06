import { getAllPaintedDoorSites, getEmailSignupCount } from '@/lib/painted-door-db';
import { isRedisConfigured } from '@/lib/db';
import SiteCardActions from '@/components/website/SiteCardActions';

export const dynamic = 'force-dynamic';

interface SiteEntry {
  id: string;
  ideaId?: string;
  ideaName: string;
  siteName: string;
  tagline?: string;
  primaryColor: string;
  accentColor: string;
  status: string;
  signupCount: number;
  siteUrl?: string;
  detailsHref?: string;
  isBuiltProduct?: boolean;
}

const builtProducts: SiteEntry[] = [
  {
    id: 'secondlook',
    ideaName: 'SecondLook',
    siteName: 'SecondLook',
    tagline: 'AI-powered health analysis for patients with rare, complex, or undiagnosed conditions',
    primaryColor: '#6366f1',
    accentColor: '#818cf8',
    status: 'live',
    signupCount: 0,
    siteUrl: 'https://secondlook.vercel.app',
    isBuiltProduct: true,
  },
  {
    id: 'study-platform',
    ideaName: 'N of One',
    siteName: 'N of One',
    tagline: 'Personalized diagnostic guidance platform',
    primaryColor: '#0ea5e9',
    accentColor: '#38bdf8',
    status: 'live',
    signupCount: 0,
    siteUrl: 'https://nofone.us',
    isBuiltProduct: true,
  },
];

async function getSites(): Promise<SiteEntry[]> {
  const paintedDoorEntries: SiteEntry[] = [];

  if (isRedisConfigured()) {
    const sites = await getAllPaintedDoorSites();
    const enriched = await Promise.all(
      sites.map(async (site) => {
        const signupCount = await getEmailSignupCount(site.id);
        return {
          id: site.id,
          ideaId: site.ideaId,
          ideaName: site.ideaName,
          siteName: site.brand?.siteName || site.ideaName,
          tagline: site.brand?.tagline,
          primaryColor: site.brand?.colors?.primary || '#38bdf8',
          accentColor: site.brand?.colors?.accent || '#38bdf8',
          status: site.status,
          signupCount,
          siteUrl: site.siteUrl,
          detailsHref: `/analyses/${site.ideaId}/painted-door`,
        } satisfies SiteEntry;
      }),
    );
    paintedDoorEntries.push(...enriched);
  }

  paintedDoorEntries.sort((a, b) => b.signupCount - a.signupCount);

  return [...builtProducts, ...paintedDoorEntries];
}

const statusStyles: Record<string, { bg: string; color: string; label: string }> = {
  live: { bg: 'rgba(52, 211, 153, 0.15)', color: '#34d399', label: 'Live' },
  deploying: { bg: 'rgba(56, 189, 248, 0.15)', color: '#38bdf8', label: 'Deploying' },
  generating: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Generating' },
  pushing: { bg: 'rgba(251, 191, 36, 0.15)', color: '#fbbf24', label: 'Pushing' },
  failed: { bg: 'rgba(239, 68, 68, 0.15)', color: '#ef4444', label: 'Failed' },
};

export default async function WebsitePage() {
  const sites = await getSites();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative">
        <div
          className="absolute -top-20 -right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(56, 189, 248, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Website
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          Test sites and products — validate demand before building.
        </p>
      </header>

      {/* Sites Grid */}
      {sites.length > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 animate-slide-up stagger-2">
          {sites.map((site) => {
            const status = statusStyles[site.status] || statusStyles.generating;

            return (
              <div key={site.id} className="card-static overflow-hidden">
                {/* Color header */}
                <div
                  className="h-16 relative"
                  style={{
                    background: `linear-gradient(135deg, ${site.primaryColor}, ${site.accentColor})`,
                  }}
                >
                  <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.15)' }} />
                  <div className="absolute bottom-2 left-3 right-3 flex items-center justify-between">
                    <span className="text-xs font-medium text-white/90 truncate">
                      {site.siteName}
                    </span>
                    <span
                      className="text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0"
                      style={{ background: 'rgba(255,255,255,0.2)', color: 'white' }}
                    >
                      {site.isBuiltProduct ? 'Product' : status.label}
                    </span>
                  </div>
                </div>

                {/* Card body */}
                <div className="p-4 space-y-3">
                  <div>
                    <h3 className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {site.ideaName}
                    </h3>
                    {site.tagline && (
                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>
                        {site.tagline}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs px-1.5 py-0.5 rounded"
                      style={{ background: site.isBuiltProduct ? 'rgba(99, 102, 241, 0.15)' : status.bg, color: site.isBuiltProduct ? '#818cf8' : status.color }}
                    >
                      {site.isBuiltProduct ? 'Product' : status.label}
                    </span>
                    {!site.isBuiltProduct && (
                      <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {site.signupCount} signup{site.signupCount !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>

                  <SiteCardActions
                    ideaId={site.ideaId}
                    siteUrl={site.siteUrl}
                    status={site.status}
                    isBuiltProduct={site.isBuiltProduct}
                    detailsHref={site.detailsHref}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="animate-slide-up stagger-2 text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4" style={{ background: 'rgba(56, 189, 248, 0.1)' }}>
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="2" y1="12" x2="22" y2="12" />
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
          </div>
          <h3 className="text-lg font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            No painted door sites yet
          </h3>
          <p className="text-sm max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
            Generate a painted door site from an analysis to validate demand before building the full product.
          </p>
        </div>
      )}
    </div>
  );
}
