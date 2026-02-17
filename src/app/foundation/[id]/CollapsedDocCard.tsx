'use client';

import type { CSSProperties } from 'react';
import Link from 'next/link';
import type { FoundationDocument, FoundationDocType } from '@/types';
import {
  CheckCircleIcon, EmptyCircleIcon, ReadyCircleIcon, ErrorCircleIcon,
  PlayIcon, RetryIcon, WarningIcon, ChatIcon,
} from './FoundationIcons';

type CardState = 'empty' | 'ready' | 'generating' | 'generated' | 'edited' | 'error' | 'pending';

interface CollapsedDocCardProps {
  ideaId: string;
  type: FoundationDocType;
  label: string;
  advisor: string;
  requires: string | null;
  doc: FoundationDocument | undefined;
  state: CardState;
  idx: number;
  generating: boolean;
  isRunning: boolean;
  versionBadgeStyle: CSSProperties;
  editedBadgeStyle: CSSProperties;
  onExpand: (type: FoundationDocType) => void;
  onGenerate: (type: FoundationDocType) => void;
  getPreview: (content: string) => string;
}

export default function CollapsedDocCard({
  ideaId, type, label, advisor, requires, doc, state, idx, generating, isRunning,
  versionBadgeStyle, editedBadgeStyle,
  onExpand, onGenerate, getPreview,
}: CollapsedDocCardProps) {
  return (
    <div
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
              <span style={versionBadgeStyle}>
                v{doc.version}
              </span>
            )}
            {state === 'edited' && (
              <span style={editedBadgeStyle}>
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
            <button className="btn btn-ghost btn-sm" onClick={() => onExpand(type)}>View</button>
          )}
          {state === 'generated' || state === 'edited' ? (
            <Link
              href={`/foundation/${ideaId}/edit/${type}`}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
                textDecoration: 'none',
              }}
            >
              <ChatIcon size={14} /> Update
            </Link>
          ) : state === 'ready' ? (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => onGenerate(type)}
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
              onClick={() => onGenerate(type)}
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
}
