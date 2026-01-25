'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ReanalyzeFormProps {
  ideaId: string;
}

export default function ReanalyzeForm({ ideaId }: ReanalyzeFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReanalyze = async () => {
    if (!context.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/analyze/${ideaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: context }),
      });

      if (res.ok) {
        router.push(`/ideas/${ideaId}/analyze`);
      }
    } catch (error) {
      console.error('Failed to start re-analysis:', error);
    }
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="btn btn-ghost text-sm"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 2v6h-6" />
          <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
          <path d="M3 22v-6h6" />
          <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
        </svg>
        Re-analyze
      </button>
    );
  }

  return (
    <div className="card-static p-4 w-full sm:w-auto sm:min-w-80 animate-fade-in">
      <h3 className="font-display text-sm mb-3" style={{ color: 'var(--text-primary)' }}>
        Add Context for Re-analysis
      </h3>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Add new information or focus areas..."
        rows={3}
        className="input text-sm mb-3"
        autoFocus
      />
      <div className="flex gap-2">
        <button
          onClick={handleReanalyze}
          disabled={loading || !context.trim()}
          className="btn btn-primary text-sm flex-1"
        >
          {loading ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Starting...
            </>
          ) : (
            'Re-analyze'
          )}
        </button>
        <button
          onClick={() => {
            setIsOpen(false);
            setContext('');
          }}
          className="btn btn-secondary text-sm"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
