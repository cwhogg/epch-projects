'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import ContentCalendarCard from '@/components/ContentCalendarCard';
import { ContentCalendar, ContentPiece } from '@/types';

export default function ContentCalendarPage() {
  const params = useParams();
  const router = useRouter();
  const analysisId = params.id as string;

  const [calendar, setCalendar] = useState<ContentCalendar | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [completedPieces, setCompletedPieces] = useState<ContentPiece[]>([]);
  const [publishedKeys, setPublishedKeys] = useState<Set<string>>(new Set());
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<string | null>(null);
  const [targetId, setTargetId] = useState<string>('secondlook');
  const [showFeedbackInput, setShowFeedbackInput] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [appending, setAppending] = useState(false);
  const [targetSaved, setTargetSaved] = useState(false);
  const [publishTargets, setPublishTargets] = useState<{ id: string; siteUrl: string }[]>([
    { id: 'secondlook', siteUrl: 'https://secondlook.vercel.app' },
    { id: 'study-platform', siteUrl: 'https://nofone.us' },
  ]);

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${analysisId}`);
      const data = await res.json();
      // Use suggested target from painted door site if available
      if (data.suggestedTargetId && !calendar) {
        setTargetId(data.suggestedTargetId);
      }
      if (data.exists && data.calendar) {
        setCalendar(data.calendar);
        if (data.calendar.targetId) setTargetId(data.calendar.targetId);
        // Fetch completed pieces to merge status
        const piecesRes = await fetch(`/api/content/${analysisId}/pieces`).catch(() => null);
        if (piecesRes?.ok) {
          const piecesData = await piecesRes.json();
          if (Array.isArray(piecesData)) {
            setCompletedPieces(piecesData);
          }
        }
      }
      // Fetch published status
      const statusRes = await fetch('/api/publish/status').catch(() => null);
      if (statusRes?.ok) {
        const statusData = await statusRes.json();
        if (Array.isArray(statusData.publishedKeys)) {
          setPublishedKeys(new Set(statusData.publishedKeys as string[]));
        }
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  const triggerPublish = async () => {
    setPublishing(true);
    setPublishResult(null);
    try {
      const res = await fetch('/api/cron/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ideaId: analysisId }),
      });
      const data = await res.json();
      setPublishResult(data.detail || data.action);
      // Refresh published keys
      const statusRes = await fetch('/api/publish/status').catch(() => null);
      if (statusRes?.ok) {
        const statusData = await statusRes.json();
        if (Array.isArray(statusData.publishedKeys)) {
          setPublishedKeys(new Set(statusData.publishedKeys as string[]));
        }
      }
    } catch (err) {
      setPublishResult(err instanceof Error ? err.message : 'Publish failed');
    } finally {
      setPublishing(false);
    }
  };

  const generateCalendar = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${analysisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, mode: 'full' }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to generate calendar');
      }
      const data = await res.json();
      setCalendar(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate calendar');
    } finally {
      setGenerating(false);
    }
  };

  const appendPieces = async (feedback?: string) => {
    setAppending(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${analysisId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId, mode: 'append', userFeedback: feedback }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to add new options');
      }
      const data = await res.json();
      setCalendar(data);
      setShowFeedbackInput(false);
      setFeedbackText('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add new options');
    } finally {
      setAppending(false);
    }
  };

  const handleReject = async (pieceId: string, reason?: string) => {
    try {
      const res = await fetch(`/api/content/${analysisId}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', reason }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.calendar) {
          setCalendar(data.calendar);
        }
      }
    } catch (err) {
      console.error('Failed to reject piece:', err);
    }
  };

  const handleTargetChange = async (newTarget: string) => {
    setTargetId(newTarget);
    if (calendar) {
      // Update existing calendar's target
      const res = await fetch(`/api/content/${analysisId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetId: newTarget }),
      }).catch(() => null);
      if (res?.ok) {
        setTargetSaved(true);
        setTimeout(() => setTargetSaved(false), 1500);
      }
    }
  };

  const [autoGenerating, setAutoGenerating] = useState(false);

  useEffect(() => {
    fetchCalendar();
    // Fetch dynamic publish targets
    fetch('/api/publish-targets')
      .then((res) => res.ok ? res.json() : null)
      .then((targets) => {
        if (Array.isArray(targets) && targets.length > 0) {
          setPublishTargets(targets.map((t: { id: string; siteUrl: string }) => ({ id: t.id, siteUrl: t.siteUrl })));
        }
      })
      .catch(() => {}); // Keep defaults on error
  }, [fetchCalendar]);

  // Auto-generate calendar if none exists (skip the extra click)
  useEffect(() => {
    if (!loading && !calendar && !generating && !autoGenerating && !error) {
      setAutoGenerating(true);
      generateCalendar();
    }
  }, [loading, calendar]); // eslint-disable-line react-hooks/exhaustive-deps

  const togglePiece = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAll = () => {
    if (!calendar) return;
    const pendingIds = getMergedPieces().filter((p) => p.status !== 'complete').map((p) => p.id);
    setSelectedIds(new Set(pendingIds));
  };

  const deselectAll = () => {
    setSelectedIds(new Set());
  };

  const startGeneration = () => {
    if (selectedIds.size === 0) return;
    const ids = Array.from(selectedIds);
    // Store selected IDs for the generate page
    sessionStorage.setItem(`content-gen-${analysisId}`, JSON.stringify(ids));
    router.push(`/analyses/${analysisId}/content/generate`);
  };

  // Merge calendar pieces with completed piece data, sort pending first
  const getMergedPieces = (): ContentPiece[] => {
    if (!calendar) return [];
    const merged = calendar.pieces
      .filter((p) => (p.type as string) !== 'landing-page') // skip deprecated type
      .map((p) => {
        const completed = completedPieces.find((cp) => cp.id === p.id);
        // Use completed piece data but keep calendar's priority (user may have reordered)
        if (completed) return { ...completed, priority: p.priority };
        return p;
      });
    // Sort: generated-not-published first (ranked), then not-generated, then published
    return merged.sort((a, b) => {
      const rank = (p: ContentPiece) => {
        if (publishedKeys.has(`${analysisId}:${p.id}`)) return 2; // published → bottom
        if (p.status === 'complete') return 0; // generated but not published → top
        return 1; // pending/error/generating → middle
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.priority - b.priority;
    });
  };

  const handleMovePiece = async (pieceId: string, direction: 'up' | 'down') => {
    const sorted = getMergedPieces();
    const isQueuedTier = (p: ContentPiece) =>
      p.status === 'complete' && !publishedKeys.has(`${analysisId}:${p.id}`);

    const tierPieces = sorted.filter(isQueuedTier);
    const idx = tierPieces.findIndex((p) => p.id === pieceId);
    if (idx === -1) return;

    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= tierPieces.length) return;

    // Swap in the full sorted list
    const fullIdx = sorted.findIndex((p) => p.id === tierPieces[idx].id);
    const fullSwapIdx = sorted.findIndex((p) => p.id === tierPieces[swapIdx].id);
    [sorted[fullIdx], sorted[fullSwapIdx]] = [sorted[fullSwapIdx], sorted[fullIdx]];

    // Build new order and assign sequential priorities
    const pieceOrder = sorted.map((p) => p.id);
    const priorityMap = new Map(pieceOrder.map((id, i) => [id, i + 1]));

    // Optimistic update
    if (calendar) {
      const updated = {
        ...calendar,
        pieces: calendar.pieces.map((p) => ({
          ...p,
          priority: priorityMap.get(p.id) ?? p.priority,
        })),
      };
      updated.pieces.sort((a, b) => a.priority - b.priority);
      setCalendar(updated);
    }

    // Persist
    await fetch(`/api/content/${analysisId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pieceOrder }),
    }).catch(() => {});
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="card-static p-8 text-center animate-fade-in">
          <div className="w-8 h-8 mx-auto mb-4">
            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Loading content options...</p>
        </div>
      </div>
    );
  }

  if (!calendar) {
    return (
      <div className="max-w-3xl mx-auto">
        <Link
          href={`/analyses/${analysisId}`}
          className="inline-flex items-center gap-1 text-sm mb-6 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Analysis
        </Link>

        <div className="card-static p-8 sm:p-12 text-center animate-slide-up">
          <div
            className="w-16 h-16 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--accent-coral-soft)' }}
          >
            {generating ? (
              <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
            ) : (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z" />
              </svg>
            )}
          </div>
          {error ? (
            <>
              <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
                Generation Failed
              </h2>
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}>
                {error}
              </div>
              <button
                onClick={generateCalendar}
                disabled={generating}
                className="btn btn-primary"
              >
                Retry
              </button>
            </>
          ) : (
            <>
              <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
                Generating Content Plan...
              </h2>
              <p style={{ color: 'var(--text-secondary)' }}>
                Creating a prioritized content plan based on your SEO research data.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  const mergedPieces = getMergedPieces();
  const completedCount = mergedPieces.filter((p) => p.status === 'complete').length;
  const pendingCount = mergedPieces.filter((p) => p.status !== 'complete').length;

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-slide-up stagger-1">
        <Link
          href={`/analyses/${analysisId}`}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Analysis
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
              Content Options
            </h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
              {calendar.ideaName} &middot; {mergedPieces.length} pieces &middot; {completedCount} generated
            </p>
          </div>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="relative">
              <select
                value={targetId}
                onChange={(e) => handleTargetChange(e.target.value)}
                className="text-xs pl-2 pr-6 py-1.5 rounded-lg cursor-pointer"
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: `1px solid ${targetSaved ? 'rgba(52, 211, 153, 0.5)' : 'var(--border-subtle)'}`, backgroundImage: 'url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%239ca3af\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'%3E%3Cpath d=\'M6 9l6 6 6-6\'/%3E%3C/svg%3E")', backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center', WebkitAppearance: 'none', appearance: 'none' as const, transition: 'border-color 0.2s' }}
              >
                {publishTargets.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.id === 'study-platform' ? 'nofone.us' : t.id}
                  </option>
                ))}
              </select>
              {targetSaved && (
                <span className="absolute -bottom-5 left-0 text-xs animate-fade-in" style={{ color: '#34d399' }}>
                  Saved
                </span>
              )}
            </div>
            <button
              onClick={triggerPublish}
              disabled={publishing}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa', border: '1px solid rgba(96, 165, 250, 0.3)' }}
            >
              {publishing ? 'Publishing...' : 'Publish Next'}
            </button>
            <button
              onClick={() => setShowFeedbackInput(true)}
              disabled={appending}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
            >
              {appending ? 'Adding...' : 'Add New Options'}
            </button>
          </div>
        </div>
      </div>

      {/* Publish Result */}
      {publishResult && (
        <div
          className="p-3 rounded-lg text-sm animate-fade-in"
          style={{ background: 'rgba(96, 165, 250, 0.1)', color: '#60a5fa' }}
        >
          {publishResult}
        </div>
      )}

      {/* Add New Options Feedback Input */}
      {showFeedbackInput && (
        <div className="card-static p-4 animate-fade-in space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
          <input
            type="text"
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') appendPieces(feedbackText || undefined);
              if (e.key === 'Escape') { setShowFeedbackInput(false); setFeedbackText(''); }
            }}
            placeholder="Optional: what kind of content do you want?"
            autoFocus
            className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-lg"
            style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
          />
          <div className="flex items-center gap-2">
            <button
              onClick={() => appendPieces(feedbackText || undefined)}
              disabled={appending}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-1 sm:flex-none"
              style={{ background: 'rgba(255, 107, 91, 0.1)', color: 'var(--accent-coral)', border: '1px solid rgba(255, 107, 91, 0.3)' }}
            >
              {appending ? 'Adding...' : 'Add 3 Pieces'}
            </button>
            <button
              onClick={() => { setShowFeedbackInput(false); setFeedbackText(''); }}
              className="text-xs px-2 py-1.5 rounded-lg transition-colors"
              style={{ color: 'var(--text-muted)' }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Strategy Summary */}
      <div className="card-static p-5 animate-slide-up stagger-2">
        <h2 className="font-display text-base mb-2 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20V10" />
            <path d="M18 20V4" />
            <path d="M6 20v-4" />
          </svg>
          Strategy
        </h2>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          {calendar.strategySummary}
        </p>
      </div>

      {/* Actions */}
      {pendingCount > 0 && (
        <div className="flex items-center justify-between animate-slide-up stagger-2">
          <div className="flex gap-2">
            <button onClick={selectAll} className="text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
              Select All Pending
            </button>
            {selectedIds.size > 0 && (
              <button onClick={deselectAll} className="text-xs px-3 py-1.5 rounded-lg transition-colors" style={{ color: 'var(--text-muted)' }}>
                Deselect All
              </button>
            )}
          </div>

          <button
            onClick={startGeneration}
            disabled={selectedIds.size === 0}
            className="btn btn-primary text-sm"
            style={{ opacity: selectedIds.size === 0 ? 0.5 : 1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            Generate Selected ({selectedIds.size})
          </button>
        </div>
      )}

      {/* Content Pieces */}
      <div className="space-y-3 animate-slide-up stagger-3">
        {(() => {
          const queuedPieces = mergedPieces.filter((p) => p.status === 'complete' && !publishedKeys.has(`${analysisId}:${p.id}`));
          return mergedPieces.map((piece) => {
            const isQueued = piece.status === 'complete' && !publishedKeys.has(`${analysisId}:${piece.id}`);
            const queueIdx = isQueued ? queuedPieces.findIndex((p) => p.id === piece.id) : -1;

            return (
              <ContentCalendarCard
                key={piece.id}
                piece={piece}
                analysisId={analysisId}
                selected={selectedIds.has(piece.id)}
                onToggle={togglePiece}
                onReject={handleReject}
                onMoveUp={isQueued && queueIdx > 0 ? () => handleMovePiece(piece.id, 'up') : undefined}
                onMoveDown={isQueued && queueIdx < queuedPieces.length - 1 ? () => handleMovePiece(piece.id, 'down') : undefined}
                queueRank={isQueued ? queueIdx + 1 : undefined}
                disabled={generating || appending}
                published={publishedKeys.has(`${analysisId}:${piece.id}`)}
              />
            );
          });
        })()}
      </div>
    </div>
  );
}
