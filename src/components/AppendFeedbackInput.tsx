'use client';

interface AppendFeedbackInputProps {
  feedbackText: string;
  onChange: (text: string) => void;
  onAppend: () => void;
  onCancel: () => void;
  appending: boolean;
}

export default function AppendFeedbackInput({ feedbackText, onChange, onAppend, onCancel, appending }: AppendFeedbackInputProps) {
  return (
    <div className="card-static p-4 animate-fade-in space-y-2 sm:space-y-0 sm:flex sm:items-center sm:gap-2">
      <input
        type="text"
        value={feedbackText}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onAppend();
          if (e.key === 'Escape') onCancel();
        }}
        placeholder="Optional: what kind of content do you want?"
        autoFocus
        className="w-full sm:flex-1 text-sm px-3 py-1.5 rounded-lg"
        style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-subtle)' }}
      />
      <div className="flex items-center gap-2">
        <button
          onClick={onAppend}
          disabled={appending}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap flex-1 sm:flex-none"
          style={{ background: 'rgba(255, 107, 91, 0.1)', color: 'var(--accent-coral)', border: '1px solid rgba(255, 107, 91, 0.3)' }}
        >
          {appending ? 'Adding...' : 'Add 3 Pieces'}
        </button>
        <button
          onClick={onCancel}
          className="text-xs px-2 py-1.5 rounded-lg transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
