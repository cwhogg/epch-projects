'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
const MarkdownContent = dynamic(() => import('@/components/MarkdownContent'), { ssr: false });
import { ContentTypeBadge } from '@/components/ContentTypeIcon';
import { ContentPiece } from '@/types';

export default function ContentPieceViewerPage() {
  const params = useParams();
  const analysisId = params.id as string;
  const pieceId = params.pieceId as string;

  const [piece, setPiece] = useState<ContentPiece | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchPiece = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${analysisId}/pieces/${pieceId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load content');
      }
      const data = await res.json();
      setPiece(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, [analysisId, pieceId]);

  useEffect(() => {
    fetchPiece();
  }, [fetchPiece]);

  const copyToClipboard = async () => {
    if (!piece?.markdown) return;
    try {
      await navigator.clipboard.writeText(piece.markdown);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
      const textarea = document.createElement('textarea');
      textarea.value = piece.markdown;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadMarkdown = () => {
    if (!piece?.markdown) return;
    const blob = new Blob([piece.markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${piece.slug}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card-static p-8 text-center animate-fade-in">
          <div className="w-8 h-8 mx-auto mb-4">
            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Loading content...</p>
        </div>
      </div>
    );
  }

  if (error || !piece) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="card-static p-8 text-center animate-fade-in">
          <h2 className="font-display text-lg mb-2" style={{ color: 'var(--text-primary)' }}>
            Content Not Found
          </h2>
          <p className="text-sm mb-4" style={{ color: 'var(--color-danger)' }}>
            {error || 'This content piece could not be loaded.'}
          </p>
          <Link href={`/analyses/${analysisId}/content`} className="btn btn-primary">
            Back to Content Options
          </Link>
        </div>
      </div>
    );
  }

  // Strip YAML frontmatter for rendering
  const displayContent = piece.markdown?.replace(/^---[\s\S]*?---\n*/, '') || '';

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="animate-slide-up stagger-1">
        <Link
          href={`/analyses/${analysisId}/content`}
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors hover:text-[var(--accent-coral)]"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back to Content Options
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <ContentTypeBadge type={piece.type} />
              {piece.wordCount && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {piece.wordCount.toLocaleString()} words
                </span>
              )}
            </div>
            <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
              {piece.title}
            </h1>
            {piece.generatedAt && (
              <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
                Generated {new Date(piece.generatedAt).toLocaleDateString()}
              </p>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={copyToClipboard}
              className="btn btn-secondary text-sm"
            >
              {copied ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-emerald)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                  Copied!
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                  Copy
                </>
              )}
            </button>
            <button
              onClick={downloadMarkdown}
              className="btn btn-secondary text-sm"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download
            </button>
          </div>
        </div>
      </div>

      {/* Keywords */}
      <div className="flex flex-wrap gap-1.5 animate-slide-up stagger-2">
        {piece.targetKeywords.map((kw, i) => (
          <span
            key={i}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}
          >
            {kw}
          </span>
        ))}
      </div>

      {/* Content */}
      <div className="card-static p-5 sm:p-8 animate-slide-up stagger-3">
        <div className="prose-editorial">
          <MarkdownContent content={displayContent} />
        </div>
      </div>
    </div>
  );
}
