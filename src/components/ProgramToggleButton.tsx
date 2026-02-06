'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ProgramToggleButton({ ideaId, active }: { ideaId: string; active: boolean }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const toggle = async () => {
    setLoading(true);
    try {
      await fetch(`/api/content/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !active }),
      });
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (active) {
    return (
      <button
        onClick={toggle}
        disabled={loading}
        title="Pause publishing"
        className="text-xs px-2 py-1.5 rounded-lg transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        {loading ? '...' : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="6" y="4" width="4" height="16" />
            <rect x="14" y="4" width="4" height="16" />
          </svg>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={toggle}
      disabled={loading}
      title="Resume publishing"
      className="text-xs px-2 py-1.5 rounded-lg transition-colors"
      style={{ color: 'var(--accent-emerald)' }}
    >
      {loading ? '...' : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="5 3 19 12 5 21 5 3" />
        </svg>
      )}
    </button>
  );
}
