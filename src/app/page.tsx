import { getAnalysesFromDb, getAllContentCalendars, getPublishedPieces, isRedisConfigured } from '@/lib/db';
import { getAllPaintedDoorSites } from '@/lib/painted-door-db';
import { getAnalyses } from '@/lib/data';
import PipelineCard, { PipelineArrow, PipelineArrowDown } from '@/components/PipelineCard';

export const dynamic = 'force-dynamic';

async function getCounts() {
  if (isRedisConfigured()) {
    const [analyses, calendars, paintedDoorSites] = await Promise.all([
      getAnalysesFromDb(),
      getAllContentCalendars(),
      getAllPaintedDoorSites(),
    ]);

    return {
      ideation: 0,
      analysis: analyses.length,
      website: paintedDoorSites.length,
      content: calendars.filter((c) => c.pieces.length > 0).length,
      testing: calendars.filter((c) => c.active !== false).length,
      optimization: 0,
    };
  }

  const analyses = getAnalyses();
  return {
    ideation: 0,
    analysis: analyses.length,
    website: 0,
    content: 0,
    testing: 0,
    optimization: 0,
  };
}

const stages = [
  {
    stage: 'Ideation',
    href: '/ideation',
    description: 'Brainstorm and capture product ideas',
    accentColor: '#ff6b5b',
    isPlaceholder: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 18h6" />
        <path d="M10 22h4" />
        <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
      </svg>
    ),
  },
  {
    stage: 'Analysis',
    href: '/analysis',
    description: 'AI-powered research across competition, SEO & WTP',
    accentColor: '#34d399',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    stage: 'Website',
    href: '/website',
    description: 'Build website for painted door test',
    accentColor: '#38bdf8',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </svg>
    ),
  },
  {
    stage: 'Content',
    href: '/content',
    description: 'Content calendars and piece generation',
    accentColor: '#a78bfa',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
      </svg>
    ),
  },
  {
    stage: 'Testing',
    href: '/testing',
    description: 'Track SEO of published content performance',
    accentColor: '#fbbf24',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20V10" />
        <path d="M18 20V4" />
        <path d="M6 20v-4" />
      </svg>
    ),
  },
  {
    stage: 'Optimization',
    href: '/optimization',
    description: 'Refine content with performance data',
    accentColor: '#f472b6',
    isPlaceholder: true,
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
        <polyline points="16 7 22 7 22 13" />
      </svg>
    ),
  },
];

const countKeys: Record<string, keyof Awaited<ReturnType<typeof getCounts>>> = {
  Ideation: 'ideation',
  Analysis: 'analysis',
  Website: 'website',
  Content: 'content',
  Testing: 'testing',
  Optimization: 'optimization',
};

export default async function Home() {
  const counts = await getCounts();

  return (
    <div className="space-y-8 sm:space-y-12">
      {/* Header */}
      <header className="animate-slide-up stagger-1 relative text-center sm:text-left">
        <div
          className="absolute -top-20 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:-right-20 w-64 h-64 rounded-full pointer-events-none hidden sm:block"
          style={{
            background: 'radial-gradient(circle, rgba(255, 107, 91, 0.12) 0%, transparent 70%)',
            filter: 'blur(40px)',
          }}
        />
        <h1 className="text-2xl sm:text-3xl font-display relative" style={{ color: 'var(--text-primary)' }}>
          Product Pipeline
        </h1>
        <p className="mt-2 text-sm sm:text-base relative" style={{ color: 'var(--text-secondary)' }}>
          From idea to optimized SEO test — track every stage of development.
        </p>
      </header>

      {/* Pipeline — Desktop: horizontal row with arrows */}
      <div className="hidden lg:flex items-start gap-2 animate-slide-up stagger-2">
        {stages.map((s, i) => (
          <div key={s.stage} className="flex items-start" style={{ flex: 1 }}>
            <div className="flex-1">
              <PipelineCard
                stage={s.stage}
                href={s.href}
                icon={s.icon}
                count={counts[countKeys[s.stage]]}
                description={s.description}
                isPlaceholder={s.isPlaceholder}
                accentColor={s.accentColor}
              />
            </div>
            {i < stages.length - 1 && (
              <PipelineArrow className="shrink-0 mt-16" />
            )}
          </div>
        ))}
      </div>

      {/* Pipeline — Tablet: 3-col grid */}
      <div className="hidden sm:grid lg:hidden grid-cols-3 gap-4 animate-slide-up stagger-2">
        {stages.map((s) => (
          <PipelineCard
            key={s.stage}
            stage={s.stage}
            href={s.href}
            icon={s.icon}
            count={counts[countKeys[s.stage]]}
            description={s.description}
            isPlaceholder={s.isPlaceholder}
            accentColor={s.accentColor}
          />
        ))}
      </div>

      {/* Pipeline — Mobile: vertical stack with arrows */}
      <div className="sm:hidden space-y-1 animate-slide-up stagger-2">
        {stages.map((s, i) => (
          <div key={s.stage}>
            <PipelineCard
              stage={s.stage}
              href={s.href}
              icon={s.icon}
              count={counts[countKeys[s.stage]]}
              description={s.description}
              isPlaceholder={s.isPlaceholder}
              accentColor={s.accentColor}
            />
            {i < stages.length - 1 && <PipelineArrowDown />}
          </div>
        ))}
      </div>
    </div>
  );
}
