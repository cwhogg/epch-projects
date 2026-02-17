'use client';

import type { CSSProperties } from 'react';
import type { FoundationDocument, FoundationDocType } from '@/types';
import { CheckCircleIcon, ChevronUpIcon, ChatIcon, RefreshIcon } from './FoundationIcons';

interface ExpandedDocCardProps {
  type: FoundationDocType;
  label: string;
  advisor: string;
  doc: FoundationDocument;
  idx: number;
  generating: boolean;
  isRunning: boolean;
  versionBadgeStyle: CSSProperties;
  editedBadgeStyle: CSSProperties;
  onCollapse: () => void;
  onRegenerate: (type: FoundationDocType) => void;
  formatDate: (iso: string) => string;
}

export default function ExpandedDocCard({
  type, label, advisor, doc, idx, generating, isRunning,
  versionBadgeStyle, editedBadgeStyle,
  onCollapse, onRegenerate, formatDate,
}: ExpandedDocCardProps) {
  return (
    <div
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
              <span style={versionBadgeStyle}>
                v{doc.version}
              </span>
              {doc.editedAt && (
                <span style={editedBadgeStyle}>
                  Edited
                </span>
              )}
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>{advisor}</p>
          </div>
          <button className="btn btn-ghost btn-sm" onClick={onCollapse}>
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
              onClick={() => onRegenerate(type)}
              disabled={generating || isRunning}
            >
              <RefreshIcon /> Regenerate
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
