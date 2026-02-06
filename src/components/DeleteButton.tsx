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
      <div className="flex items-center gap-2 animate-fade-in">
        <span className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Delete &quot;{ideaName}&quot;?
        </span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="btn btn-danger text-sm py-1.5"
        >
          {loading ? 'Deleting...' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="btn btn-secondary text-sm py-1.5"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setConfirming(true)}
      className="btn btn-ghost text-sm"
      style={{ color: 'var(--color-danger)' }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="3 6 5 6 21 6" />
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
        <line x1="10" y1="11" x2="10" y2="17" />
        <line x1="14" y1="11" x2="14" y2="17" />
      </svg>
      Delete
    </button>
  );
}
