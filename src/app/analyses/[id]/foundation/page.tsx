'use client';

import { useEffect, useState, useCallback, use } from 'react';
import Link from 'next/link';
import type {
  FoundationDocument,
  FoundationDocType,
  FoundationProgress,
} from '@/types';

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
  { type: 'strategy', label: 'Strategy', advisor: 'Richard Rumelt', requires: null },
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

// SVG icons as components to keep JSX clean
function CheckCircleIcon({ color = 'var(--accent-emerald)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22 4 12 14.01 9 11.01" />
    </svg>
  );
}

function EmptyCircleIcon({ color = 'var(--text-muted)' }: { color?: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ReadyCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-info)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
    </svg>
  );
}

function ErrorCircleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function PlayIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="5 3 19 12 5 21 5 3" />
    </svg>
  );
}

function ChevronUpIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="18 15 12 9 6 15" />
    </svg>
  );
}

function ArrowLeftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5" />
      <path d="M12 19l-7-7 7-7" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="1 4 1 10 7 10" />
      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
    </svg>
  );
}

function RetryIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
    </svg>
  );
}

function WarningIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--color-danger)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <line x1="12" y1="9" x2="12" y2="13" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
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
            href={`/analyses/${ideaId}`}
            style={{
              fontFamily: 'var(--font-body)', fontSize: '0.875rem', color: 'var(--text-muted)',
              textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
              marginBottom: '1rem', transition: 'color 0.2s',
            }}
          >
            <ArrowLeftIcon />
            Back to Analysis
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
            // Expanded view
            <div
              key={type}
              className={`animate-slide-up stagger-${idx + 2}`}
              style={{ borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-card)' }}
            >
              {/* Card header */}
              <div style={{
                background: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
                padding: '1.25rem 1.5rem',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{
                      fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.125rem',
                      letterSpacing: '-0.02em', color: 'var(--text-primary)',
                      display: 'flex', alignItems: 'center', gap: '0.625rem',
                    }}>
                      <CheckCircleIcon />
                      {label}
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        v{doc.version}
                      </span>
                      {doc.editedAt && (
                        <span style={{
                          fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
                          letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                          color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
                          padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                        }}>
                          Edited
                        </span>
                      )}
                    </div>
                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{advisor}</p>
                  </div>
                  <button className="btn btn-ghost btn-sm" onClick={() => setExpandedDoc(null)}>
                    <ChevronUpIcon /> Hide
                  </button>
                </div>

                {/* Metadata row */}
                <div style={{ display: 'flex', gap: '1.5rem', marginTop: '0.75rem', flexWrap: 'wrap' as const }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Generated</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{formatDate(doc.generatedAt)}</span>
                  </div>
                  {doc.editedAt && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                      <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Last Edited</span>
                      <span style={{ color: 'var(--accent-coral)' }}>{formatDate(doc.editedAt)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem' }}>
                    <span style={{ fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase' as const, letterSpacing: '0.05em' }}>Version</span>
                    <span style={{ color: 'var(--text-secondary)' }}>{doc.version}</span>
                  </div>
                </div>
              </div>

              {/* Content area */}
              <div style={{
                background: 'var(--bg-card)',
                borderLeft: '1px solid var(--border-subtle)',
                borderRight: '1px solid var(--border-subtle)',
                borderBottom: '1px solid var(--border-subtle)',
                borderRadius: '0 0 var(--radius-lg) var(--radius-lg)',
                padding: '1.5rem',
              }}>
                <div className="prose-editorial" style={{ whiteSpace: 'pre-wrap' }}>
                  {doc.content}
                </div>

                {/* Footer actions */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  paddingTop: '1.25rem', marginTop: '1.25rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}>
                  <span
                    style={{
                      fontSize: '0.875rem', color: 'var(--text-muted)',
                      display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
                      fontWeight: 500, cursor: 'not-allowed', opacity: 0.5,
                    }}
                    title="Coming in a future update"
                  >
                    <ChatIcon />
                    Update via conversation
                  </span>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <RefreshIcon /> Regenerate
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            // Collapsed card
            <div
              key={type}
              className={`animate-slide-up stagger-${idx + 2}`}
              style={{
                background: 'var(--bg-card)',
                border: `1px solid ${
                  state === 'generating' ? 'rgba(255, 107, 91, 0.25)'
                  : state === 'error' ? 'rgba(248, 113, 113, 0.25)'
                  : 'var(--border-subtle)'
                }`,
                borderRadius: 'var(--radius-lg)',
                padding: '1.25rem 1.5rem',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                opacity: state === 'empty' || state === 'pending' ? 0.5 : 1,
                animation: state === 'generating' ? 'glow-pulse 2s ease-in-out infinite' : undefined,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <div style={{
                    fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1rem',
                    letterSpacing: '-0.02em', color: 'var(--text-primary)',
                    display: 'flex', alignItems: 'center', gap: '0.625rem',
                  }}>
                    {state === 'generating' ? (
                      <span className="spinner" style={{
                        width: 16, height: 16, border: '2px solid var(--border-default)',
                        borderTopColor: 'var(--accent-coral)', borderRadius: '50%',
                        animation: 'spin 0.8s linear infinite', display: 'inline-block',
                      }} />
                    ) : state === 'generated' || state === 'edited' ? (
                      <CheckCircleIcon />
                    ) : state === 'error' ? (
                      <ErrorCircleIcon />
                    ) : state === 'ready' ? (
                      <ReadyCircleIcon />
                    ) : (
                      <EmptyCircleIcon />
                    )}
                    {label}
                    {doc && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 500,
                        color: 'var(--text-muted)', background: 'var(--bg-elevated)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        v{doc.version}
                      </span>
                    )}
                    {state === 'edited' && (
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: '0.6875rem', fontWeight: 600,
                        letterSpacing: '0.05em', textTransform: 'uppercase' as const,
                        color: 'var(--accent-coral)', background: 'var(--accent-coral-soft)',
                        padding: '0.125rem 0.5rem', borderRadius: 'var(--radius-sm)',
                      }}>
                        Edited
                      </span>
                    )}
                    {/* State label pill */}
                    {state === 'generating' && (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                        fontSize: '0.75rem', color: 'var(--accent-coral)',
                      }}>
                        Generating
                      </span>
                    )}
                    {state === 'error' && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>Failed</span>
                    )}
                  </div>
                  <p style={{ fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                    {advisor}
                    {state === 'empty' && requires ? ` \u2014 Requires: ${requires}` : ''}
                    {state === 'generating' ? ` \u2014 generating...` : ''}
                  </p>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  {doc && !isRunning && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setExpandedDoc(type)}>View</button>
                  )}
                  {state === 'generated' || state === 'edited' ? (
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      Regenerate
                    </button>
                  ) : state === 'ready' ? (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <PlayIcon size={14} /> Generate
                    </button>
                  ) : state === 'empty' ? (
                    <button className="btn btn-secondary btn-sm" disabled>
                      <PlayIcon size={14} /> Generate
                    </button>
                  ) : state === 'error' ? (
                    <button
                      className="btn btn-sm"
                      style={{
                        background: 'transparent', color: 'var(--color-danger)',
                        border: '1px solid rgba(248, 113, 113, 0.3)',
                      }}
                      onClick={() => handleGenerate(type)}
                      disabled={generating || isRunning}
                    >
                      <RetryIcon /> Retry
                    </button>
                  ) : null}
                </div>
              </div>

              {/* Preview text for generated docs */}
              {doc && state !== 'generating' && (
                <p style={{
                  fontSize: '0.8125rem', color: 'var(--text-secondary)', marginTop: '0.75rem',
                  lineHeight: 1.5, display: '-webkit-box', WebkitLineClamp: 2,
                  WebkitBoxOrient: 'vertical' as const, overflow: 'hidden',
                }}>
                  {getPreview(doc.content)}
                </p>
              )}

              {/* Shimmer bars for generating state */}
              {state === 'generating' && (
                <>
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '100%', marginTop: '0.75rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '75%', marginTop: '0.5rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                  <div style={{
                    height: 12, borderRadius: 'var(--radius-sm)', width: '50%', marginTop: '0.5rem',
                    background: 'linear-gradient(90deg, var(--bg-elevated) 0%, rgba(255, 107, 91, 0.08) 50%, var(--bg-elevated) 100%)',
                    backgroundSize: '200% 100%', animation: 'shimmer 2s ease-in-out infinite',
                  }} />
                </>
              )}

              {/* Error banner */}
              {state === 'error' && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '0.75rem',
                  padding: '0.75rem 1rem', marginTop: '0.75rem',
                  background: 'rgba(248, 113, 113, 0.08)',
                  border: '1px solid rgba(248, 113, 113, 0.2)',
                  borderRadius: 'var(--radius-md)',
                }}>
                  <WarningIcon />
                  <span style={{ fontSize: '0.8125rem', color: 'var(--color-danger)', flex: 1 }}>
                    Generation failed. Click Retry to try again.
                  </span>
                </div>
              )}

              {/* Requires hint for empty state */}
              {state === 'empty' && requires && (
                <p style={{
                  fontFamily: 'var(--font-body)', fontSize: '0.75rem', color: 'var(--text-muted)',
                  fontStyle: 'italic', marginTop: '0.5rem',
                }}>
                  Waiting for {requires} to be generated before this document can be created.
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
