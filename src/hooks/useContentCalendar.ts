'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { ContentCalendar, ContentPiece } from '@/types';

export function useContentCalendar(analysisId: string) {
  const router = useRouter();

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
  const autoGenerating = useRef(false);

  const refreshPublishedKeys = useCallback(async () => {
    const statusRes = await fetch('/api/publish/status').catch(() => null);
    if (statusRes?.ok) {
      const statusData = await statusRes.json();
      if (Array.isArray(statusData.publishedKeys)) {
        setPublishedKeys(new Set(statusData.publishedKeys as string[]));
      }
    }
  }, []);

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
      await refreshPublishedKeys();
    } catch (err) {
      console.error('Failed to fetch calendar:', err);
    } finally {
      setLoading(false);
    }
  }, [analysisId, refreshPublishedKeys]);

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
      await refreshPublishedKeys();
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
        body: JSON.stringify({ mode: 'full' }),
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
        body: JSON.stringify({ mode: 'append', userFeedback: feedback }),
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

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  // Auto-generate calendar if none exists (skip the extra click)
  useEffect(() => {
    if (!loading && !calendar && !generating && !autoGenerating.current && !error) {
      autoGenerating.current = true;
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
        if (publishedKeys.has(`${analysisId}:${p.id}`)) return 2; // published -> bottom
        if (p.status === 'complete') return 0; // generated but not published -> top
        return 1; // pending/error/generating -> middle
      };
      const diff = rank(a) - rank(b);
      if (diff !== 0) return diff;
      return a.priority - b.priority;
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
    router.push(`/content/${analysisId}/generate`);
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

  return {
    calendar,
    loading,
    generating,
    selectedIds,
    error,
    publishedKeys,
    publishing,
    publishResult,
    targetId,
    showFeedbackInput,
    setShowFeedbackInput,
    feedbackText,
    setFeedbackText,
    appending,
    triggerPublish,
    generateCalendar,
    appendPieces,
    handleReject,
    togglePiece,
    selectAll,
    deselectAll,
    startGeneration,
    getMergedPieces,
    handleMovePiece,
  };
}
