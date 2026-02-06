import Link from 'next/link';

export default function OptimizationPage() {
  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <header className="animate-slide-up stagger-1">
        <div
          className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
          style={{ background: 'rgba(244, 114, 182, 0.12)' }}
        >
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="var(--color-pink)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" />
            <polyline points="16 7 22 7 22 13" />
          </svg>
        </div>
        <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
          Optimization
        </h1>
        <p className="mt-3 text-sm sm:text-base" style={{ color: 'var(--text-secondary)' }}>
          Refine and optimize your content based on real performance data.
          This stage will provide AI-powered recommendations for improving
          rankings, click-through rates, and conversion.
        </p>
      </header>

      <div
        className="card-static p-8 animate-slide-up stagger-2"
        style={{ borderStyle: 'dashed' }}
      >
        <span
          className="inline-block text-xs font-medium px-3 py-1 rounded-full mb-4"
          style={{ background: 'rgba(244, 114, 182, 0.12)', color: 'var(--color-pink)' }}
        >
          Coming Soon
        </span>
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          This pipeline stage is under development. Check out the Testing stage
          to see your current performance data.
        </p>
      </div>

      <Link href="/testing" className="btn btn-primary inline-flex">
        Go to Testing
      </Link>
    </div>
  );
}
