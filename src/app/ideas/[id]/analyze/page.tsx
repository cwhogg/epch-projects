'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';

interface AnalysisStep {
  name: string;
  status: 'pending' | 'running' | 'complete' | 'error';
  detail?: string;
}

interface AnalysisProgress {
  ideaId: string;
  status: 'pending' | 'running' | 'complete' | 'error' | 'not_started';
  currentStep: string;
  steps: AnalysisStep[];
  error?: string;
  result?: {
    id: string;
    recommendation: string;
  };
}

const defaultSteps: AnalysisStep[] = [
  { name: 'Competitive Analysis', status: 'pending' },
  { name: 'SEO & Keywords', status: 'pending' },
  { name: 'Willingness to Pay', status: 'pending' },
  { name: 'Scoring', status: 'pending' },
];

export default function AnalyzePage() {
  const params = useParams();
  const router = useRouter();
  const ideaId = params.id as string;

  const [progress, setProgress] = useState<AnalysisProgress | null>(null);
  const [started, setStarted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startAnalysis = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${ideaId}`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to start analysis');
      }
      setStarted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start analysis');
    }
  }, [ideaId]);

  const checkProgress = useCallback(async () => {
    try {
      const res = await fetch(`/api/analyze/${ideaId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to check progress');
      }
      const data = await res.json();
      setProgress(data);

      if (data.status === 'complete' && data.result) {
        setTimeout(() => {
          router.push(`/analyses/${data.result.id}`);
        }, 1500);
      }
    } catch (err) {
      console.error('Error checking progress:', err);
    }
  }, [ideaId, router]);

  useEffect(() => {
    if (!started) {
      startAnalysis();
    }
  }, [started, startAnalysis]);

  useEffect(() => {
    if (!started) return;

    const interval = setInterval(() => {
      checkProgress();
    }, 2000);

    checkProgress();

    return () => clearInterval(interval);
  }, [started, checkProgress]);

  const steps = progress?.steps || defaultSteps;
  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const progressPercent = (completedCount / steps.length) * 100;

  if (error) {
    return (
      <div className="max-w-lg mx-auto">
        <div
          className="card-static p-6 sm:p-8 animate-fade-in"
          style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.1) 0%, rgba(248, 113, 113, 0.05) 100%)',
            borderColor: 'rgba(239, 68, 68, 0.2)',
          }}
        >
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(239, 68, 68, 0.2)' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="15" y1="9" x2="9" y2="15" />
                <line x1="9" y1="9" x2="15" y2="15" />
              </svg>
            </div>
            <h2 className="font-display text-lg" style={{ color: 'var(--text-primary)' }}>
              Analysis Failed
            </h2>
          </div>
          <p className="text-sm mb-6" style={{ color: '#f87171' }}>{error}</p>
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              onClick={() => {
                setError(null);
                setStarted(false);
              }}
              className="btn btn-primary"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 2v6h-6" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M3 22v-6h6" />
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
              </svg>
              Retry
            </button>
            <Link href="/" className="btn btn-secondary">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <div className="card-static p-6 sm:p-8 relative overflow-hidden">
        {/* Ambient gradient background */}
        <div
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background: progress?.status === 'complete'
              ? 'radial-gradient(ellipse at top, rgba(52, 211, 153, 0.15) 0%, transparent 60%)'
              : 'radial-gradient(ellipse at top, rgba(255, 107, 91, 0.15) 0%, transparent 60%)',
          }}
        />

        {/* Header */}
        <div className="text-center mb-8 animate-slide-up stagger-1 relative">
          <div
            className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${
              progress?.status === 'complete' ? '' : 'animate-glow'
            }`}
            style={{
              background: progress?.status === 'complete'
                ? 'rgba(52, 211, 153, 0.15)'
                : 'var(--accent-coral-soft)',
            }}
          >
            {progress?.status === 'complete' ? (
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5" />
              </svg>
            ) : (
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--accent-coral)"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-float"
              >
                <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </svg>
            )}
          </div>
          <h1 className="text-xl sm:text-2xl font-display mb-2" style={{ color: 'var(--text-primary)' }}>
            {progress?.status === 'complete' ? 'Analysis Complete!' : 'Analyzing...'}
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            {progress?.status === 'complete'
              ? 'Redirecting to results...'
              : progress?.currentStep || 'Starting analysis...'}
          </p>
        </div>

        {/* Progress Bar */}
        <div className="mb-6 animate-slide-up stagger-2 relative">
          <div
            className="h-2 rounded-full overflow-hidden"
            style={{ background: 'var(--border-default)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700 ease-out relative overflow-hidden"
              style={{
                width: `${progressPercent}%`,
                background: progress?.status === 'complete'
                  ? 'linear-gradient(90deg, #34d399 0%, #4ade80 100%)'
                  : 'linear-gradient(90deg, var(--accent-coral) 0%, #ff8f6b 50%, var(--accent-coral) 100%)',
                backgroundSize: progress?.status === 'complete' ? '100% 100%' : '200% 100%',
                animation: progress?.status === 'complete' ? 'none' : 'shimmer 2s ease-in-out infinite',
              }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
            <span>{completedCount} of {steps.length} steps</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
        </div>

        {/* Steps */}
        <div className="space-y-3 mb-6 animate-slide-up stagger-3">
          {steps.map((step, index) => (
            <div
              key={index}
              className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                step.status === 'running' ? 'step-active' : ''
              }`}
              style={{
                background:
                  step.status === 'running'
                    ? 'var(--accent-coral-soft)'
                    : step.status === 'complete'
                    ? 'rgba(52, 211, 153, 0.1)'
                    : 'var(--bg-elevated)',
                border: `1px solid ${
                  step.status === 'running'
                    ? 'rgba(255, 107, 91, 0.3)'
                    : step.status === 'complete'
                    ? 'rgba(52, 211, 153, 0.3)'
                    : 'var(--border-subtle)'
                }`,
              }}
            >
              {/* Icon */}
              <div className="shrink-0">
                {step.status === 'complete' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : step.status === 'running' ? (
                  <svg className="animate-spin" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                ) : step.status === 'error' ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="15" y1="9" x2="9" y2="15" />
                    <line x1="9" y1="9" x2="15" y2="15" />
                  </svg>
                ) : (
                  <div
                    className="w-5 h-5 rounded-full"
                    style={{ border: '2px solid var(--border-default)' }}
                  />
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div
                  className="text-sm font-medium"
                  style={{
                    color:
                      step.status === 'running'
                        ? 'var(--accent-coral)'
                        : step.status === 'complete'
                        ? '#34d399'
                        : 'var(--text-secondary)',
                  }}
                >
                  {step.name}
                </div>
                {step.detail && (
                  <div className="text-xs truncate" style={{ color: 'var(--text-muted)' }}>
                    {step.detail}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Completion Message */}
        {progress?.status === 'complete' && (
          <div
            className="p-4 rounded-lg mb-4 animate-fade-in"
            style={{
              background: 'rgba(52, 211, 153, 0.1)',
              border: '1px solid rgba(52, 211, 153, 0.3)',
            }}
          >
            <p className="text-sm font-medium text-center" style={{ color: '#34d399' }}>
              Redirecting to your analysis...
            </p>
          </div>
        )}

        {/* Footer */}
        <div
          className="flex justify-between items-center pt-4 animate-slide-up"
          style={{ borderTop: '1px solid var(--border-subtle)', animationDelay: '0.4s' }}
        >
          <Link
            href="/"
            className="text-sm flex items-center gap-1 transition-colors"
            style={{ color: 'var(--text-muted)' }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Cancel
          </Link>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            ~1-2 min
          </span>
        </div>
      </div>
    </div>
  );
}
