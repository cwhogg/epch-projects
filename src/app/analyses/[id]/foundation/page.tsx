'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import type { FoundationDocument, FoundationDocType, FoundationProgress } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

type DocMap = Partial<Record<FoundationDocType, FoundationDocument>>;

interface FoundationData {
  progress: FoundationProgress | { status: 'not_started' };
  docs: DocMap;
}

const DOC_CONFIG: { type: FoundationDocType; label: string; advisor: string; requires: string | null }[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Richard Rumelt', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning' },
  { type: 'seo-strategy', label: 'SEO Strategy', advisor: 'SEO Expert', requires: 'Positioning' },
  { type: 'social-media-strategy', label: 'Social Media Strategy', advisor: 'TBD', requires: 'Brand Voice' },
];

function canGenerate(docType: FoundationDocType, docs: DocMap): boolean {
  if (docType === 'strategy') return true;
  if (docType === 'positioning') return !!docs['strategy'];
  if (docType === 'brand-voice') return !!docs['positioning'];
  if (docType === 'design-principles') return !!docs['positioning'] && !!docs['strategy'];
  if (docType === 'seo-strategy') return !!docs['positioning'];
  if (docType === 'social-media-strategy') return !!docs['positioning'] && !!docs['brand-voice'];
  return false;
}

function getPreview(content: string): string {
  const lines = content.split('\n').filter(l => l.trim()).slice(0, 3);
  const preview = lines.join(' ').slice(0, 200);
  return preview.length < lines.join(' ').length ? preview + '...' : preview;
}

export default function FoundationPage({ params }: PageProps) {
  const { id: ideaId } = use(params);
  const [data, setData] = useState<FoundationData | null>(null);
  const [generating, setGenerating] = useState(false);
  const [expandedDoc, setExpandedDoc] = useState<FoundationDocType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/foundation/${ideaId}`);
      if (!res.ok) throw new Error('Failed to fetch');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    }
  }, [ideaId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Poll while running
  useEffect(() => {
    if (!data || data.progress.status !== 'running') return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  const handleGenerateAll = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/foundation/${ideaId}`, { method: 'POST' });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error || 'Failed to start');
      }
      // Start polling
      setTimeout(fetchData, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    } finally {
      setGenerating(false);
    }
  };

  const isRunning = data?.progress.status === 'running';
  const docs = data?.docs || {};
  const docCount = Object.keys(docs).length;

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '2rem 1rem' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <Link href={`/analyses/${ideaId}`} style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          &larr; Back to Analysis
        </Link>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>Foundation Documents</h1>
          <p style={{ color: 'var(--text-secondary)', margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
            {docCount}/6 documents generated
          </p>
        </div>
        <button
          onClick={handleGenerateAll}
          disabled={generating || isRunning}
          style={{
            padding: '0.5rem 1.25rem',
            background: generating || isRunning ? 'var(--bg-elevated)' : 'var(--accent-primary)',
            color: generating || isRunning ? 'var(--text-muted)' : 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: generating || isRunning ? 'not-allowed' : 'pointer',
            fontSize: '0.875rem',
            fontWeight: 500,
          }}
        >
          {isRunning ? 'Generating...' : 'Generate All'}
        </button>
      </div>

      {error && (
        <div style={{ padding: '0.75rem 1rem', background: 'var(--bg-error, #fef2f2)', borderRadius: '0.375rem', marginBottom: '1rem', color: 'var(--text-error, #dc2626)', fontSize: '0.875rem' }}>
          {error}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {DOC_CONFIG.map(({ type, label, advisor, requires }) => {
          const doc = docs[type];
          const ready = canGenerate(type, docs);
          const docProgress = data?.progress.status !== 'not_started'
            ? (data?.progress as FoundationProgress).docs?.[type]
            : undefined;

          return (
            <div
              key={type}
              style={{
                border: '1px solid var(--border-primary)',
                borderRadius: '0.5rem',
                padding: '1rem 1.25rem',
                background: 'var(--bg-primary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>{label}</h3>
                    {doc && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        v{doc.version}
                      </span>
                    )}
                    {doc?.editedAt && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)', background: 'var(--bg-elevated)', padding: '0.125rem 0.375rem', borderRadius: '0.25rem' }}>
                        edited
                      </span>
                    )}
                    {docProgress === 'running' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--accent-primary)' }}>generating...</span>
                    )}
                    {docProgress === 'error' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-error, #dc2626)' }}>error</span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0 0' }}>
                    {advisor}{!ready && requires ? ` \u2014 Requires: ${requires}` : ''}
                  </p>
                </div>

                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {doc && (
                    <button
                      onClick={() => setExpandedDoc(expandedDoc === type ? null : type)}
                      style={{
                        padding: '0.25rem 0.75rem',
                        background: 'var(--bg-elevated)',
                        border: '1px solid var(--border-primary)',
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        fontSize: '0.8125rem',
                      }}
                    >
                      {expandedDoc === type ? 'Hide' : 'View'}
                    </button>
                  )}
                </div>
              </div>

              {doc && expandedDoc !== type && (
                <p style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)', margin: '0.5rem 0 0', lineHeight: 1.4 }}>
                  {getPreview(doc.content)}
                </p>
              )}

              {expandedDoc === type && doc && (
                <div style={{ marginTop: '0.75rem', padding: '1rem', background: 'var(--bg-elevated)', borderRadius: '0.375rem', whiteSpace: 'pre-wrap', fontSize: '0.8125rem', lineHeight: 1.6, maxHeight: '400px', overflow: 'auto' }}>
                  {doc.content}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
