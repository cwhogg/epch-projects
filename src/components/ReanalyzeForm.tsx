'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface ReanalyzeFormProps {
  ideaId: string;
}

export default function ReanalyzeForm({ ideaId }: ReanalyzeFormProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [context, setContext] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReanalyze = async () => {
    if (!context.trim()) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/analyze/${ideaId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additionalContext: context }),
      });

      if (res.ok) {
        router.push(`/ideas/${ideaId}/analyze`);
      }
    } catch (error) {
      console.error('Failed to start re-analysis:', error);
    }
    setLoading(false);
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
      >
        Re-analyze with new context
      </button>
    );
  }

  return (
    <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-4">
      <h3 className="text-sm font-medium text-zinc-900 dark:text-zinc-100 mb-2">
        Add Context for Re-analysis
      </h3>
      <textarea
        value={context}
        onChange={(e) => setContext(e.target.value)}
        placeholder="Add new information, clarifications, or focus areas for the analysis..."
        rows={3}
        className="w-full px-3 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="flex gap-2 mt-3">
        <button
          onClick={handleReanalyze}
          disabled={loading || !context.trim()}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? 'Starting...' : 'Re-analyze'}
        </button>
        <button
          onClick={() => {
            setIsOpen(false);
            setContext('');
          }}
          className="px-4 py-2 text-sm border border-zinc-300 dark:border-zinc-700 rounded-lg text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
