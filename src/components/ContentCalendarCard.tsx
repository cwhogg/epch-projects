'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ContentPiece } from '@/types';
import { ContentTypeBadge } from './ContentTypeIcon';

interface ContentCalendarCardProps {
  piece: ContentPiece;
  analysisId: string;
  selected: boolean;
  onToggle: (id: string) => void;
  onReject?: (pieceId: string, reason?: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  queueRank?: number;
  disabled?: boolean;
  published?: boolean;
}

function StatusBadge({ status, published }: { status: ContentPiece['status']; published?: boolean }) {
  let bg: string;
  let color: string;
  let label: string;

  if (published) {
    bg = 'rgba(96, 165, 250, 0.15)'; color = 'var(--color-info)'; label = 'Published';
  } else if (status === 'complete') {
    bg = 'rgba(52, 211, 153, 0.15)'; color = 'var(--accent-emerald)'; label = 'Generated';
  } else if (status === 'generating') {
    bg = 'rgba(255, 107, 91, 0.15)'; color = 'var(--accent-coral)'; label = 'Generating...';
  } else if (status === 'error') {
    bg = 'rgba(248, 113, 113, 0.15)'; color = 'var(--color-danger)'; label = 'Error';
  } else {
    bg = 'var(--bg-elevated)'; color = 'var(--text-muted)'; label = 'Not Generated';
  }

  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ background: bg, color }}
    >
      {label}
    </span>
  );
}

export default function ContentCalendarCard({ piece, analysisId, selected, onToggle, onReject, onMoveUp, onMoveDown, queueRank, disabled, published }: ContentCalendarCardProps) {
  const isComplete = piece.status === 'complete';
  const isGenerating = piece.status === 'generating';
  const [showRejectInput, setShowRejectInput] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [isHovered, setIsHovered] = useState(false);

  const canReject = !isComplete && !isGenerating && !published && onReject;

  const handleReject = () => {
    if (onReject) {
      onReject(piece.id, rejectReason || undefined);
      setShowRejectInput(false);
      setRejectReason('');
    }
  };

  return (
    <div
      className="p-4 rounded-lg transition-all relative group"
      style={{
        background: selected ? 'rgba(255, 107, 91, 0.05)' : 'var(--bg-elevated)',
        border: `1px solid ${selected ? 'rgba(255, 107, 91, 0.3)' : 'var(--border-subtle)'}`,
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {/* Reject X button — top-right on hover */}
      {canReject && isHovered && !showRejectInput && (
        <button
          onClick={() => setShowRejectInput(true)}
          className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)' }}
          title="Reject this piece"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      {/* Inline reject reason input */}
      {showRejectInput && (
        <div className="mb-3 flex items-center gap-2">
          <input
            type="text"
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleReject();
              if (e.key === 'Escape') { setShowRejectInput(false); setRejectReason(''); }
            }}
            placeholder="Reason (optional)"
            autoFocus
            className="flex-1 text-xs px-2 py-1 rounded-md"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          />
          <button
            onClick={handleReject}
            className="text-xs px-2 py-1 rounded-md transition-colors"
            style={{ background: 'rgba(248, 113, 113, 0.15)', color: 'var(--color-danger)' }}
          >
            Reject
          </button>
          <button
            onClick={() => { setShowRejectInput(false); setRejectReason(''); }}
            className="text-xs px-2 py-1 rounded-md transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            Cancel
          </button>
        </div>
      )}

      <div className="flex items-start gap-3">
        {/* Checkbox */}
        <div className="pt-0.5">
          {isComplete ? (
            <Link
              href={`/content/${analysisId}/${piece.id}`}
              className="w-5 h-5 rounded flex items-center justify-center"
              style={{ background: 'rgba(52, 211, 153, 0.15)' }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            </Link>
          ) : (
            <button
              onClick={() => onToggle(piece.id)}
              disabled={disabled || isGenerating}
              className="w-5 h-5 rounded border-2 flex items-center justify-center transition-colors"
              style={{
                borderColor: selected ? 'var(--accent-coral)' : 'var(--border-default)',
                background: selected ? 'var(--accent-coral)' : 'transparent',
                cursor: disabled || isGenerating ? 'not-allowed' : 'pointer',
                opacity: disabled ? 0.5 : 1,
              }}
            >
              {selected && (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              )}
            </button>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">

          {/* Reorder arrows for queued (complete, not published) pieces */}
          {(onMoveUp || onMoveDown) && (
            <div className="float-right ml-2 flex flex-col gap-0.5">
              <button
                onClick={onMoveUp}
                disabled={!onMoveUp}
                className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                style={{ background: onMoveUp ? 'var(--bg-surface)' : 'transparent', color: onMoveUp ? 'var(--text-secondary)' : 'var(--border-subtle)', cursor: onMoveUp ? 'pointer' : 'default' }}
                title="Move up (publish sooner)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 15l-6-6-6 6" />
                </svg>
              </button>
              <button
                onClick={onMoveDown}
                disabled={!onMoveDown}
                className="w-6 h-6 rounded flex items-center justify-center transition-colors"
                style={{ background: onMoveDown ? 'var(--bg-surface)' : 'transparent', color: onMoveDown ? 'var(--text-secondary)' : 'var(--border-subtle)', cursor: onMoveDown ? 'pointer' : 'default' }}
                title="Move down (publish later)"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {queueRank !== undefined && (
              <span className="text-xs font-display font-semibold" style={{ color: 'var(--accent-coral)' }}>
                #{queueRank}
              </span>
            )}
            <ContentTypeBadge type={piece.type} />
            <StatusBadge status={piece.status} published={published} />
          </div>

          <h3 className="text-sm font-medium mb-1">
            {isComplete ? (
              <Link
                href={`/content/${analysisId}/${piece.id}`}
                className="underline decoration-1 underline-offset-2 transition-colors hover:text-[var(--accent-coral)]"
                style={{ color: 'var(--text-primary)' }}
              >
                {piece.title}
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="inline-block ml-1 -mt-0.5">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </Link>
            ) : (
              <span style={{ color: 'var(--text-primary)' }}>{piece.title}</span>
            )}
          </h3>

          <p className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
            {piece.rationale}
          </p>

          <div className="flex flex-wrap gap-1">
            {piece.targetKeywords.map((kw, i) => (
              <span
                key={i}
                className="text-xs px-1.5 py-0.5 rounded"
                style={{ background: 'var(--bg-surface)', color: 'var(--text-muted)' }}
              >
                {kw}
              </span>
            ))}
          </div>

          {piece.contentGap && (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              <span style={{ color: 'var(--accent-emerald)' }}>Gap:</span> {piece.contentGap}
            </div>
          )}

          {isComplete && piece.wordCount && (
            <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
              {piece.wordCount.toLocaleString()} words
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
