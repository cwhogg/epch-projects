'use client';

import { useState } from 'react';
import type { AssumptionType, PivotSuggestion } from '@/types';

interface PivotActionsProps {
  ideaId: string;
  type: AssumptionType;
  suggestions: PivotSuggestion[];
}

export default function PivotActions({ ideaId, type, suggestions }: PivotActionsProps) {
  const [loading, setLoading] = useState<number | null>(null);
  const [killing, setKilling] = useState(false);

  async function handlePivot(index: number) {
    setLoading(index);
    try {
      const res = await fetch(`/api/validation/${ideaId}/pivot`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, suggestionIndex: index }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setLoading(null);
    }
  }

  async function handleKill() {
    const reason = prompt('Why are you archiving this project?');
    if (!reason) return;

    setKilling(true);
    try {
      const res = await fetch(`/api/validation/${ideaId}/kill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        window.location.reload();
      }
    } finally {
      setKilling(false);
    }
  }

  return (
    <div className="mt-4 pt-4" style={{ borderTop: '1px solid rgba(248, 113, 113, 0.15)' }}>
      <div className="text-[10px] font-semibold tracking-[0.08em] uppercase mb-3" style={{ color: 'var(--color-danger)' }}>
        Pivot Opportunities
      </div>

      {suggestions.map((s, i) => (
        <button
          key={i}
          onClick={() => handlePivot(i)}
          disabled={loading !== null}
          className="w-full text-left p-3 mb-2 rounded-lg border transition-colors hover:border-[var(--accent-coral)] hover:bg-[rgba(255,107,91,0.05)] disabled:opacity-50"
          style={{
            background: 'var(--bg-elevated)',
            borderColor: 'var(--border-default)',
          }}
        >
          <div className="text-[13px] font-medium" style={{ color: 'var(--text-primary)' }}>
            {loading === i ? 'Applying pivot...' : s.statement}
          </div>
          {s.evidence.length > 0 && (
            <div className="text-[12px] mt-1" style={{ color: 'var(--text-secondary)' }}>
              {s.evidence[0]}
            </div>
          )}
          <div className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>
            {s.impact}
          </div>
        </button>
      ))}

      <div className="flex gap-2 mt-3">
        <button
          onClick={handleKill}
          disabled={killing}
          className="text-[12px] font-medium px-3.5 py-1.5 rounded-lg border transition-colors hover:bg-[rgba(248,113,113,0.1)]"
          style={{
            color: 'var(--color-danger)',
            borderColor: 'rgba(248, 113, 113, 0.3)',
            background: 'transparent',
          }}
        >
          {killing ? 'Archiving...' : 'Archive Project'}
        </button>
      </div>
    </div>
  );
}
