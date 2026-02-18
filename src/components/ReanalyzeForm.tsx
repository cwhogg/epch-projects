'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { FoundationDocument } from '@/types';
import { capitalize } from '@/lib/utils';

interface ReanalyzeFormProps {
  ideaId: string;
  foundationDocs?: FoundationDocument[];
}

function formatDocDate(doc: FoundationDocument): string {
  const iso = doc.editedAt || doc.generatedAt;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

export default function ReanalyzeForm({ ideaId, foundationDocs = [] }: ReanalyzeFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<string | null>(null);

  const hasFoundation = foundationDocs.length > 0;

  const handleReanalyze = async () => {
    if (!context.trim() && !hasFoundation) return;

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
      {hasFoundation && (
        <div className="mb-3">
          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            Strategic context will be included:
          </p>
          <div className="space-y-1">
            {foundationDocs.map((doc) => (
              <div key={doc.type} className="rounded-md" style={{ background: 'var(--bg-elevated)' }}>
                <button
                  type="button"
                  onClick={() => setExpandedDoc(expandedDoc === doc.type ? null : doc.type)}
                  className="w-full flex items-center justify-between px-3 py-1.5 text-xs"
                  style={{ color: 'var(--text-secondary)' }}
                >
                  <span>{capitalize(doc.type)} v{doc.version}</span>
                  <span className="flex items-center gap-2">
                    <span style={{ color: 'var(--text-muted)' }}>{formatDocDate(doc)}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      style={{ transform: expandedDoc === doc.type ? 'rotate(180deg)' : undefined, transition: 'transform 0.15s' }}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </span>
                </button>
                {expandedDoc === doc.type && (
                  <div className="px-3 pb-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    {doc.content.length > 500 ? `${doc.content.substring(0, 500)}...` : doc.content}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
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
          disabled={loading || (!context.trim() && !hasFoundation)}
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
