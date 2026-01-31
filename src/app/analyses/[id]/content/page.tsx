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

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${analysisId}`);
      const data = await res.json();
      if (data.exists && data.calendar) {
        setCalendar(data.calendar);
        // Fetch completed pieces to merge status
        const piecesRes = await fetch(`/api/content/${analysisId}/pieces`).catch(() => null);
        if (piecesRes?.ok) {
          const piecesData = await piecesRes.json();
          if (Array.isArray(piecesData)) {
            setCompletedPieces(piecesData);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [analysisId]);

  const generateCalendar = async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/content/${analysisId}`, { method: 'POST' });
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

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

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

  // Merge calendar pieces with completed piece data
  const getMergedPieces = (): ContentPiece[] => {
    if (!calendar) return [];
    return calendar.pieces.map((p) => {
      const completed = completedPieces.find((cp) => cp.id === p.id);
      return completed || p;
    });
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
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16v2H4zm0 4h16v2H4zm0 4h10v2H4zm0 4h16v2H4z" />
            </svg>
          </div>
          <h2 className="text-xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            Generate Content Options
          </h2>
          <p className="mb-6" style={{ color: 'var(--text-secondary)' }}>
            Create a prioritized content plan based on your SEO research data — blog posts, landing pages, comparisons, and FAQ pages.
          </p>
          {error && (
            <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171' }}>
              {error}
            </div>
          )}
          <button
            onClick={generateCalendar}
            disabled={generating}
            className="btn btn-primary"
          >
            {generating ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Generating Calendar...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Generate Content Options
              </>
            )}
          </button>
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
          <button
            onClick={generateCalendar}
            disabled={generating}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
          >
            {generating ? 'Regenerating...' : 'Regenerate Options'}
          </button>
        </div>
      </div>

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
        {mergedPieces.map((piece) => (
          <ContentCalendarCard
            key={piece.id}
            piece={piece}
            analysisId={analysisId}
            selected={selectedIds.has(piece.id)}
            onToggle={togglePiece}
            disabled={generating}
          />
        ))}
      </div>
    </div>
  );
}
