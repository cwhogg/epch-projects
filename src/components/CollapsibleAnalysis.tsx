'use client';

import { useState } from 'react';
import MarkdownContent from '@/components/MarkdownContent';

export default function CollapsibleAnalysis({ content }: { content: string }) {
  const [expanded, setExpanded] = useState(false);

  if (!content) return null;

  return (
    <div className="card-static p-5 sm:p-6 animate-slide-up stagger-4">
      <h2 className="font-display text-base mb-4" style={{ color: 'var(--text-primary)' }}>
        Full Analysis
      </h2>
      <div className="relative">
        <div
          className="overflow-hidden transition-[max-height] duration-400 ease-in-out"
          style={{ maxHeight: expanded ? '5000px' : '200px' }}
        >
          <div className="prose-editorial">
            <MarkdownContent content={content} />
          </div>
        </div>
        {!expanded && (
          <div
            className="absolute bottom-0 left-0 right-0 h-20 pointer-events-none"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--bg-card))' }}
          />
        )}
      </div>
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center justify-center gap-1.5 w-full pt-2.5 mt-2 text-sm font-medium transition-colors"
        style={{ color: 'var(--accent-coral)', borderTop: '1px solid var(--border-subtle)' }}
      >
        <span>{expanded ? 'Collapse' : 'Show full analysis'}</span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.3s' }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  );
}
