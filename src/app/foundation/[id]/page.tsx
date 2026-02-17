'use client';

import { useEffect, useState, useCallback, use, type CSSProperties } from 'react';
import Link from 'next/link';
import type {
  FoundationDocument,
  FoundationDocType,
  FoundationProgress,
} from '@/types';
import { ArrowLeftIcon, PlayIcon, WarningIcon } from './FoundationIcons';
import ExpandedDocCard from './ExpandedDocCard';
import CollapsedDocCard from './CollapsedDocCard';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

type DocMap = Partial<Record<FoundationDocType, FoundationDocument>>;

interface FoundationData {
  progress: FoundationProgress | { status: 'not_started' };
  docs: DocMap;
}

const DOC_CONFIG: {
  type: FoundationDocType;
  label: string;
  advisor: string;
  requires: string | null;
}[] = [
  { type: 'strategy', label: 'Strategy', advisor: 'Seth Godin', requires: null },
  { type: 'positioning', label: 'Positioning Statement', advisor: 'April Dunford', requires: 'Strategy' },
  { type: 'brand-voice', label: 'Brand Voice', advisor: 'Brand Copywriter', requires: 'Positioning' },
  { type: 'design-principles', label: 'Design Principles', advisor: 'Derived', requires: 'Positioning + Strategy' },
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
  const lines = content.split('\n').filter((l) => l.trim()).slice(0, 3);
  const preview = lines.join(' ').slice(0, 200);
  return preview.length < lines.join(' ').length ? preview + '...' : preview;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

type CardState = 'empty' | 'ready' | 'generating' | 'generated' | 'edited' | 'error' | 'pending';

function getCardState(
  docType: FoundationDocType,
  doc: FoundationDocument | undefined,
  canGen: boolean,
  docProgress: string | undefined,
): CardState {
  if (docProgress === 'running') return 'generating';
  if (docProgress === 'error') return 'error';
  if (docProgress === 'pending' && !doc) return 'pending';
  if (doc?.editedAt) return 'edited';
  if (doc) return 'generated';
  if (canGen) return 'ready';
  return 'empty';
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

  useEffect(() => {
    if (!data || data.progress.status !== 'running') return;
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [data, fetchData]);

  const handleGenerate = async (docType?: FoundationDocType) => {
    setGenerating(true);
    setError(null);
    try {
      const body: Record<string, unknown> = {};
      if (docType) body.docType = docType;
      const res = await fetch(`/api/foundation/${ideaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to start');
      }
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
  const progress = data?.progress.status !== 'not_started' ? (data?.progress as FoundationProgress) : null;

  const versionBadgeStyle: CSSProperties = {
    fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
    color: 'var(--text-muted)', background: 'var(--bg-elevated)',
    padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
  };
  const editedBadgeStyle: CSSProperties = {
    fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
    letterSpacing: '0.05em', textTransform: 'uppercase',
    color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
    padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
  };

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '0 1.5rem', paddingBottom: '4rem' }}>
      {/* Page Header */}
      <div className="animate-slide-up stagger-1" style={{ position: 'relative', padding: '2rem 0 1.5rem' }}>
        {/* Decorative gradient */}
        <div style={{
          position: 'absolute', top: -40, left: -80, width: 400, height: 300,
          background: 'radial-gradient(ellipse, rgba(167, 139, 250, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none', zIndex: 0,
        }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <Link
            href="/"
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--text-muted)',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              marginBottom: '1rem', transition: 'color 0.2s',
            }}
          >
            <ArrowLeftIcon />
            Back to Projects
          </Link>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
            <div>
              <h1 style={{
                fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.75rem',
                letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: 0, lineHeight: 1.2,
              }}>
                Foundation Documents
              </h1>
              <p style={{
                fontFamily: 'var(--font-body)', fontSize: '0.875rem',
                color: 'var(--text-secondary)', marginTop: '0.25rem',
              }}>
                {isRunning
                  ? `Generating \u2014 ${docCount}/6 complete`
                  : `${docCount}/6 documents generated`}
              </p>
            </div>
            {isRunning ? (
              <button className="btn btn-secondary" disabled style={{ gap: '0.5rem' }}>
                <span className="spinner" style={{
                  width: 16, height: 16, border: '2px solid var(--border-default)',
                  borderTopColor: 'var(--accent-coral)', borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite', display: 'inline-block',
                }} />
                Generating...
              </button>
            ) : (
              <button className="btn btn-primary" onClick={() => handleGenerate()} disabled={generating}>
                <PlayIcon />
                Generate All
              </button>
            )}
          </div>

          {/* Progress bar (only during generation) */}
          {isRunning && (
            <div style={{ marginTop: '1rem' }}>
              <div style={{
                width: '100%', height: 4, background: 'var(--bg-elevated)',
                borderRadius: 'var(--radius-full)', overflow: 'hidden',
              }}>
                <div style={{
                  height: '100%', borderRadius: 'var(--radius-full)',
                  background: 'linear-gradient(90deg, var(--accent-coral) 0%, var(--accent-emerald) 100%)',
                  transition: 'width 0.6s ease',
                  width: `${Math.round((docCount / 6) * 100)}%`,
                }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{docCount} of 6 documents</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                  {progress?.currentStep || ''}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Global error */}
      {error && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.75rem 1rem',
          background: 'rgba(248, 113, 113, 0.08)',
          border: '1px solid rgba(248, 113, 113, 0.2)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
        }}>
          <WarningIcon />
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', flex: 1 }}>{error}</span>
        </div>
      )}

      {/* Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', marginTop: '0.5rem' }}>
        {DOC_CONFIG.map(({ type, label, advisor, requires }, idx) => {
          const doc = docs[type];
          const canGen = canGenerate(type, docs);
          const docProgress = progress?.docs?.[type];
          const state = getCardState(type, doc, canGen, docProgress);
          const isExpanded = expandedDoc === type;

          return isExpanded && doc ? (
            <ExpandedDocCard
              key={type}
              type={type}
              label={label}
              advisor={advisor}
              doc={doc}
              idx={idx}
              generating={generating}
              isRunning={isRunning}
              versionBadgeStyle={versionBadgeStyle}
              editedBadgeStyle={editedBadgeStyle}
              onCollapse={() => setExpandedDoc(null)}
              onRegenerate={handleGenerate}
              formatDate={formatDate}
            />
          ) : (
            <CollapsedDocCard
              key={type}
              type={type}
              label={label}
              advisor={advisor}
              requires={requires}
              doc={doc}
              state={state}
              idx={idx}
              generating={generating}
              isRunning={isRunning}
              versionBadgeStyle={versionBadgeStyle}
              editedBadgeStyle={editedBadgeStyle}
              onExpand={setExpandedDoc}
              onGenerate={handleGenerate}
              getPreview={getPreview}
            />
          );
        })}
      </div>
    </div>
  );
}
