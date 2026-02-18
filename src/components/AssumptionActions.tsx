'use client';

import { useState } from 'react';
import type { AssumptionType, AssumptionStatus } from '@/types';

interface AssumptionActionsProps {
  ideaId: string;
  type: AssumptionType;
  status: AssumptionStatus;
}

export default function AssumptionActions({ ideaId, type, status }: AssumptionActionsProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function updateStatus(newStatus: AssumptionStatus) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/validation/${ideaId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, status: newStatus }),
      });
      if (res.ok) {
        window.location.reload();
      } else {
        const data = await res.json();
        setError(data.error ?? 'Failed to update status');
      }
    } catch {
      setError('Network error — please try again');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <span className="text-[11px]" style={{ color: 'var(--text-muted)' }}>Updating...</span>
      </div>
    );
  }

  // Invalidated — pivot actions handle this (no extra buttons needed)
  if (status === 'invalidated') return null;

  // Validated — show undo option
  // Untested or Testing — show Validate and Invalidate
  return (
    <div className="mt-3 pt-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
      <div className="flex gap-2">
        {status === 'validated' ? (
          <button
            onClick={() => updateStatus('untested')}
            className="text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(255,255,255,0.05)]"
            style={{ color: 'var(--text-muted)', borderColor: 'var(--border-default)', background: 'transparent' }}
          >
            Undo
          </button>
        ) : (
          <>
            <button
              onClick={() => updateStatus('validated')}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(16,185,129,0.1)]"
              style={{ color: 'var(--accent-emerald)', borderColor: 'rgba(16, 185, 129, 0.3)', background: 'transparent' }}
            >
              Validate
            </button>
            <button
              onClick={() => updateStatus('invalidated')}
              className="text-[11px] font-medium px-2.5 py-1 rounded-md border transition-colors hover:bg-[rgba(248,113,113,0.1)]"
              style={{ color: 'var(--color-danger)', borderColor: 'rgba(248, 113, 113, 0.3)', background: 'transparent' }}
            >
              Invalidate
            </button>
          </>
        )}
      </div>
      {error && (
        <p className="text-[11px] mt-2" style={{ color: 'var(--color-danger)' }}>{error}</p>
      )}
    </div>
  );
}
