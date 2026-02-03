'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { PaintedDoorProgress } from '@/types';

export default function PaintedDoorProgressPage() {
  const params = useParams();
  const analysisId = params.id as string;

  const [progress, setProgress] = useState<PaintedDoorProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [triggered, setTriggered] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const pollProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/painted-door/${analysisId}`);
      if (!res.ok) return;
      const data = await res.json();
      if (data.status === 'not_started' && !triggered) {
        return; // Haven't triggered yet
      }
      setProgress(data as PaintedDoorProgress);

      // Stop polling when complete or error
      if (data.status === 'complete' || data.status === 'error') {
        if (pollRef.current) {
          clearInterval(pollRef.current);
          pollRef.current = null;
        }
      }
    } catch (err) {
      console.error('Failed to poll progress:', err);
    }
  }, [analysisId, triggered]);

  const triggerGeneration = useCallback(async () => {
    try {
      setTriggered(true);
      setError(null);
      const res = await fetch(`/api/painted-door/${analysisId}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to start site generation');
        return;
      }
      // Start polling
      pollRef.current = setInterval(pollProgress, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start');
    }
  }, [analysisId, pollProgress]);

  useEffect(() => {
    // Check if already in progress or completed
    const checkExisting = async () => {
      try {
        const res = await fetch(`/api/painted-door/${analysisId}`);
        if (!res.ok) {
          setLoading(false);
          return;
        }
        const data = await res.json();
        if (data.status === 'not_started') {
          setLoading(false);
          // Auto-trigger
          triggerGeneration();
          return;
        }
        setProgress(data as PaintedDoorProgress);
        setTriggered(true);
        setLoading(false);

        // If still running, start polling
        if (data.status === 'running' || data.status === 'pending') {
          pollRef.current = setInterval(pollProgress, 3000);
        }
      } catch {
        setLoading(false);
      }
    };

    checkExisting();

    return () => {
      if (pollRef.current) {
        clearInterval(pollRef.current);
      }
    };
  }, [analysisId]); // eslint-disable-line react-hooks/exhaustive-deps

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
        );
      case 'running':
        return (
          <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        );
      case 'error':
        return (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        );
      default:
        return (
          <div
            className="w-4 h-4 rounded-full"
            style={{ border: '2px solid var(--border-default)' }}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="card-static p-8 text-center animate-fade-in">
          <div className="w-8 h-8 mx-auto mb-4">
            <svg className="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          </div>
          <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
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

        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
          Launch Painted Door Site
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          {progress?.currentStep || 'Initializing...'}
        </p>
      </div>

      {/* Error */}
      {error && (
        <div
          className="p-4 rounded-lg text-sm animate-fade-in"
          style={{ background: 'rgba(248, 113, 113, 0.1)', color: '#f87171', border: '1px solid rgba(248, 113, 113, 0.2)' }}
        >
          {error}
        </div>
      )}

      {/* Progress Steps */}
      {progress && progress.steps.length > 0 && (
        <div className="card-static p-5 animate-slide-up stagger-2">
          <div className="space-y-0">
            {progress.steps.map((step, index) => (
              <div key={index} className="flex items-start gap-3 relative">
                {/* Connector line */}
                {index < progress.steps.length - 1 && (
                  <div
                    className="absolute left-[7px] top-[24px] w-[2px] h-[calc(100%-8px)]"
                    style={{
                      background: step.status === 'complete'
                        ? 'rgba(52, 211, 153, 0.3)'
                        : 'var(--border-subtle)',
                    }}
                  />
                )}

                {/* Icon */}
                <div className="flex-shrink-0 mt-1 z-10">{getStepIcon(step.status)}</div>

                {/* Content */}
                <div className="flex-1 pb-5">
                  <div className="flex items-center gap-2">
                    <span
                      className="text-sm font-medium"
                      style={{
                        color: step.status === 'complete'
                          ? '#34d399'
                          : step.status === 'running'
                          ? 'var(--text-primary)'
                          : step.status === 'error'
                          ? '#f87171'
                          : 'var(--text-muted)',
                      }}
                    >
                      {step.name}
                    </span>
                  </div>
                  {step.detail && (
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {step.detail}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Brand Preview */}
      {progress?.result?.brand && (
        <div className="card-static p-5 animate-slide-up stagger-3">
          <h2 className="font-display text-base mb-3" style={{ color: 'var(--text-primary)' }}>
            Brand Identity
          </h2>
          <div className="space-y-3">
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Name</span>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{progress.result.brand.siteName}</p>
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Tagline</span>
              <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{progress.result.brand.tagline}</p>
            </div>
            <div>
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Colors</span>
              <div className="flex gap-1.5 mt-1">
                {Object.entries(progress.result.brand.colors).map(([name, color]) => (
                  <div
                    key={name}
                    className="w-6 h-6 rounded"
                    style={{ background: color, border: '1px solid var(--border-subtle)' }}
                    title={`${name}: ${color}`}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Completion */}
      {progress?.status === 'complete' && progress.result && (
        <div
          className="card-static p-5 animate-slide-up stagger-4"
          style={{ borderColor: 'rgba(52, 211, 153, 0.3)' }}
        >
          <h2 className="font-display text-base mb-3 flex items-center gap-2" style={{ color: '#34d399' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Site Deployed
          </h2>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>URL:</span>
              <a
                href={progress.result.siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline transition-colors hover:text-[var(--accent-coral)]"
                style={{ color: 'var(--text-primary)' }}
              >
                {progress.result.siteUrl}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Repo:</span>
              <a
                href={progress.result.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm underline transition-colors hover:text-[var(--accent-coral)]"
                style={{ color: 'var(--text-secondary)' }}
              >
                {progress.result.repoOwner}/{progress.result.repoName}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Signups:</span>
              <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                {progress.result.signupCount}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Retry on error */}
      {progress?.status === 'error' && (
        <div className="flex justify-center">
          <button
            onClick={() => triggerGeneration()}
            className="btn btn-primary"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
