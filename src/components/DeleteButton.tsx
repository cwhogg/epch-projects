'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface DeleteButtonProps {
  ideaId: string;
  ideaName: string;
}

export default function DeleteButton({ ideaId, ideaName }: DeleteButtonProps) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDelete = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/ideas?id=${ideaId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        router.push('/');
        router.refresh();
      } else {
        alert('Failed to delete idea');
      }
    } catch (error) {
      console.error('Delete failed:', error);
      alert('Failed to delete idea');
    }
    setLoading(false);
    setConfirming(false);
  };

  if (confirming) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">Delete {ideaName}?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
        >
          {loading ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-3 py-1 text-sm border border-zinc-300 dark:border-zinc-700 rounded text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="text-sm text-red-600 dark:text-red-400 hover:underline"
    >
      Delete
    </button>
  );
}
