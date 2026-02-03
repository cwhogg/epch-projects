import Link from 'next/link';

export default function IdeationPage() {
  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <header className="animate-slide-up stagger-1">
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(255, 107, 91, 0.12)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 18h6" />
            <path d="M10 22h4" />
            <path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
          Ideation
        </h1>
        <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          Brainstorm and capture product ideas before they go into analysis.
          This stage will help you organize raw ideas, run quick viability checks,
          and prioritize what to research next.
        </p>
      </header>

      <div
        className="card-static p-8 animate-slide-up stagger-2"
        style={{ borderStyle: 'dashed' }}
      >
        <span
          className="inline-block text-xs font-medium px-3 py-1 rounded-full mb-4"
          style={{ background: 'rgba(255, 107, 91, 0.12)', color: 'var(--accent-coral)' }}
        >
          Coming Soon
        </span>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This pipeline stage is under development. For now, jump straight to analysis
          to evaluate your product ideas.
        </p>
      </div>

      <Link href="/analysis" className="btn btn-primary inline-flex">
        Go to Analysis
      </Link>
    </div>
  );
}
