import type { Assumption, AssumptionType, PivotSuggestion, CanvasState, PivotRecord } from '@/types';
import PivotActions from './PivotActions';

interface ValidationCanvasProps {
  ideaId: string;
  canvas: CanvasState;
  assumptions: Partial<Record<AssumptionType, Assumption>>;
  pivotSuggestions: Partial<Record<AssumptionType, PivotSuggestion[]>>;
  pivotHistory: Partial<Record<AssumptionType, PivotRecord[]>>;
}

const TYPE_LABELS: Record<AssumptionType, string> = {
  demand: 'Demand',
  reachability: 'Reachability',
  engagement: 'Engagement',
  wtp: 'WTP',
  differentiation: 'Differentiation',
};

function getStatusClasses(status: string) {
  switch (status) {
    case 'validated':
      return {
        badge: 'bg-[rgba(16,185,129,0.15)] text-[var(--accent-emerald)] border border-[rgba(16,185,129,0.25)]',
        card: 'border-[rgba(16,185,129,0.2)]',
        type: 'text-[var(--accent-emerald)]',
      };
    case 'testing':
      return {
        badge: 'bg-[rgba(245,158,11,0.15)] text-[var(--accent-amber)] border border-[rgba(245,158,11,0.25)]',
        card: 'border-[rgba(245,158,11,0.2)] animate-[pulse-border_3s_ease-in-out_infinite]',
        type: 'text-[var(--accent-amber)]',
      };
    case 'invalidated':
      return {
        badge: 'bg-[rgba(248,113,113,0.15)] text-[var(--color-danger)] border border-[rgba(248,113,113,0.25)]',
        card: 'border-[rgba(248,113,113,0.2)]',
        type: 'text-[var(--color-danger)]',
      };
    default: // untested, pivoted
      return {
        badge: 'bg-[rgba(255,255,255,0.05)] text-[var(--text-muted)] border border-[rgba(255,255,255,0.08)]',
        card: '',
        type: 'text-[var(--text-muted)]',
      };
  }
}

const ASSUMPTION_ORDER: AssumptionType[] = ['demand', 'reachability', 'engagement', 'wtp', 'differentiation'];

const ArrowSvg = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-40">
    <path d="M9 18l6-6-6-6" />
  </svg>
);

export default function ValidationCanvas({
  ideaId,
  canvas,
  assumptions,
  pivotSuggestions,
  pivotHistory,
}: ValidationCanvasProps) {
  const isKilled = canvas.status === 'killed';

  return (
    <div className={`mb-10 ${isKilled ? 'opacity-50' : ''}`}>
      {/* Section label */}
      <div className="flex items-center gap-2 mb-4">
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase" style={{ color: 'var(--text-muted)' }}>
          Validation Canvas
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      </div>

      {/* Canvas grid — horizontal on desktop, vertical on mobile */}
      <div className="flex flex-col lg:flex-row items-stretch gap-0">
        {ASSUMPTION_ORDER.map((type, i) => {
          const assumption = assumptions[type];
          const status = assumption?.status ?? 'untested';
          const classes = getStatusClasses(status);
          const suggestions = pivotSuggestions[type] ?? [];
          const history = pivotHistory[type] ?? [];
          const isFirst = i === 0;
          const isLast = i === ASSUMPTION_ORDER.length - 1;

          // Determine if this assumption is "reset" (upstream invalidated)
          const upstreamInvalidated = !isFirst && ASSUMPTION_ORDER.slice(0, i).some(
            upType => assumptions[upType]?.status === 'invalidated'
          );

          return (
            <div key={type} className="contents">
              {/* Arrow connector (not before first card) */}
              {!isFirst && (
                <div className="flex items-center justify-center w-6 lg:mx-[-12px] h-5 lg:h-auto z-10 rotate-90 lg:rotate-0" style={{ color: 'var(--text-muted)' }}>
                  <ArrowSvg />
                </div>
              )}

              {/* Card */}
              <div
                className={`flex-1 p-5 flex flex-col min-h-[160px] lg:min-h-[160px]
                  ${classes.card}
                  ${isFirst ? 'rounded-t-lg lg:rounded-l-lg lg:rounded-tr-none' : ''}
                  ${isLast ? 'rounded-b-lg lg:rounded-r-lg lg:rounded-bl-none' : ''}
                  ${!isFirst ? 'border-t-0 lg:border-t lg:border-l-0' : ''}
                `}
                style={{
                  background: 'var(--bg-card)',
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  borderColor: classes.card ? undefined : 'var(--border-subtle)',
                }}
              >
                {/* Card header */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-[11px] font-semibold tracking-[0.06em] uppercase ${classes.type}`}>
                    {TYPE_LABELS[type]}
                  </span>
                  <span className={`text-[10px] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-full ${classes.badge}`}>
                    {upstreamInvalidated ? 'Reset' : status}
                  </span>
                </div>

                {/* Statement */}
                <div className={`text-[13px] leading-relaxed flex-1 ${
                  status === 'untested' || upstreamInvalidated ? 'italic' : ''
                }`} style={{ color: status === 'untested' || upstreamInvalidated ? 'var(--text-muted)' : 'var(--text-secondary)' }}>
                  {upstreamInvalidated ? (
                    <span>{assumption?.statement ?? 'Awaiting upstream pivot decision'}</span>
                  ) : (
                    assumption?.statement ?? 'No assumption generated'
                  )}
                </div>

                {/* Evidence (only for validated/testing) */}
                {assumption?.evidence && assumption.evidence.length > 0 && (status === 'validated' || status === 'testing') && (
                  <div className="mt-3 pt-3 flex items-center gap-1.5 text-[12px]" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                    <div>
                      <div className="font-display font-semibold text-base tabular-nums" style={{
                        color: status === 'validated' ? 'var(--accent-emerald)' : 'var(--accent-amber)',
                      }}>
                        {assumption.evidence[0]}
                      </div>
                    </div>
                  </div>
                )}

                {/* Pivot history link */}
                {history.length > 0 && (
                  <span className="text-[11px] mt-2 inline-flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
                    {history.length} pivot{history.length !== 1 ? 's' : ''} recorded
                  </span>
                )}

                {/* Pivot suggestions (only for invalidated) */}
                {status === 'invalidated' && suggestions.length > 0 && (
                  <PivotActions ideaId={ideaId} type={type} suggestions={suggestions} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Killed banner */}
      {isKilled && canvas.killedReason && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{
          background: 'rgba(248, 113, 113, 0.08)',
          color: 'var(--color-danger)',
          border: '1px solid rgba(248, 113, 113, 0.15)',
        }}>
          Project archived: {canvas.killedReason}
        </div>
      )}

      {/* Section divider */}
      <div className="flex items-center gap-2 mt-8 mb-0">
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
        <span className="text-[11px] font-semibold tracking-[0.08em] uppercase whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
          Project Details
        </span>
        <div className="flex-1 h-px" style={{ background: 'var(--border-subtle)' }} />
      </div>
    </div>
  );
}
