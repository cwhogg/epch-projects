'use client';

import { useParams } from 'next/navigation';
import Link from 'next/link';
import ContentCalendarCard from '@/components/ContentCalendarCard';
import AppendFeedbackInput from '@/components/AppendFeedbackInput';
import { useContentCalendar } from '@/hooks/useContentCalendar';

export default function ContentCalendarPage() {
  const params = useParams();
  const analysisId = params.id as string;

  const {
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
  } = useContentCalendar(analysisId);

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
              <div className="mb-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)' }}>
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
            <span
              className="text-xs px-2 py-1.5 rounded-lg"
              style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              {targetId}
            </span>
            <button
              onClick={triggerPublish}
              disabled={publishing}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ background: 'rgba(96, 165, 250, 0.1)', color: 'var(--color-info)', border: '1px solid rgba(96, 165, 250, 0.3)' }}
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
          style={{ background: 'rgba(96, 165, 250, 0.1)', color: 'var(--color-info)' }}
        >
          {publishResult}
        </div>
      )}

      {/* Add New Options Feedback Input */}
      {showFeedbackInput && (
        <AppendFeedbackInput
          feedbackText={feedbackText}
          onChange={setFeedbackText}
          onAppend={() => appendPieces(feedbackText || undefined)}
          onCancel={() => { setShowFeedbackInput(false); setFeedbackText(''); }}
          appending={appending}
        />
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
