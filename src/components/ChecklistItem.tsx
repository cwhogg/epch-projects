'use client';

export default function ChecklistItem({
  step,
  title,
  children,
  completed,
  onToggle,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
  completed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="p-4 rounded-lg transition-all"
      style={{
        background: completed ? 'rgba(52, 211, 153, 0.05)' : 'var(--bg-elevated)',
        border: `1px solid ${completed ? 'rgba(52, 211, 153, 0.3)' : 'var(--border-subtle)'}`,
      }}
    >
      <div className="flex items-start gap-3">
        <button
          onClick={onToggle}
          className="mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors shrink-0"
          style={{
            borderColor: completed ? '#34d399' : 'var(--border-default)',
            background: completed ? '#34d399' : 'transparent',
          }}
        >
          {completed && (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className="text-xs font-medium px-1.5 py-0.5 rounded"
              style={{ background: 'rgba(139, 92, 246, 0.15)', color: '#a78bfa' }}
            >
              Step {step}
            </span>
            <span
              className="font-medium text-sm"
              style={{ color: completed ? 'var(--text-muted)' : 'var(--text-primary)', textDecoration: completed ? 'line-through' : 'none' }}
            >
              {title}
            </span>
          </div>
          <div className="text-sm space-y-2" style={{ color: 'var(--text-secondary)' }}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
