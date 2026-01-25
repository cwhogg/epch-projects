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

      // Redirect to analysis page when complete
      if (data.status === 'complete' && data.result) {
        setTimeout(() => {
          router.push(`/analyses/${data.result.id}`);
        }, 2000);
      }
    } catch (err) {
      console.error('Error checking progress:', err);
    }
  }, [ideaId, router]);

  // Start analysis on mount
  useEffect(() => {
    if (!started) {
      startAnalysis();
    }
  }, [started, startAnalysis]);

  // Poll for progress
  useEffect(() => {
    if (!started) return;

    const interval = setInterval(() => {
      checkProgress();
    }, 2000);

    // Initial check
    checkProgress();

    return () => clearInterval(interval);
  }, [started, checkProgress]);

  const getStepIcon = (status: string) => {
    switch (status) {
      case 'complete':
        return (
          <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        );
      case 'running':
        return (
          <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        );
      case 'error':
        return (
          <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-zinc-300 dark:border-zinc-600" />;
    }
  };

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">Analysis Error</h2>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <div className="flex gap-4">
            <button
              onClick={() => {
                setError(null);
                setStarted(false);
              }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
            >
              Retry
            </button>
            <Link
              href="/"
              className="px-4 py-2 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8">
        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-2">
          Analyzing Your Idea
        </h1>
        <p className="text-zinc-600 dark:text-zinc-400 mb-8">
          {progress?.currentStep || 'Starting analysis...'}
        </p>

        {/* Progress Steps */}
        <div className="space-y-4 mb-8">
          {(progress?.steps || [
            { name: 'Competitive Analysis', status: 'pending' },
            { name: 'SEO & Keyword Research', status: 'pending' },
            { name: 'Willingness to Pay Analysis', status: 'pending' },
            { name: 'Scoring & Synthesis', status: 'pending' },
          ]).map((step, index) => (
            <div
              key={index}
              className={`flex items-center gap-4 p-4 rounded-lg transition-colors ${
                step.status === 'running'
                  ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800'
                  : step.status === 'complete'
                  ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
                  : 'bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700'
              }`}
            >
              {getStepIcon(step.status)}
              <div className="flex-1">
                <div className="font-medium text-zinc-900 dark:text-zinc-100">{step.name}</div>
                {step.detail && (
                  <div className="text-sm text-zinc-500 dark:text-zinc-400">{step.detail}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Completion Message */}
        {progress?.status === 'complete' && (
          <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 mb-4">
            <p className="text-green-700 dark:text-green-300 font-medium">
              Analysis complete! Redirecting to results...
            </p>
          </div>
        )}

        {/* Error Message */}
        {progress?.status === 'error' && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 mb-4">
            <p className="text-red-700 dark:text-red-300">{progress.error || 'An error occurred'}</p>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-between items-center pt-4 border-t border-zinc-200 dark:border-zinc-700">
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            ← Back to Dashboard
          </Link>
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            This may take 1-2 minutes
          </div>
        </div>
      </div>
    </div>
  );
}
