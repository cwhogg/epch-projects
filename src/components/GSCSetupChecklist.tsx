'use client';

import { useState } from 'react';
import ChecklistItem from './ChecklistItem';

export default function GSCSetupChecklist({ onRefresh }: { onRefresh: () => Promise<void> }) {
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [refreshing, setRefreshing] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const email = 'epch-research-dashboard@epch-research-dashboard.iam.gserviceaccount.com';
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers or when clipboard API is blocked
      const textArea = document.createElement('textarea');
      textArea.value = email;
      textArea.style.position = 'fixed';
      textArea.style.opacity = '0';
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const toggleStep = (step: number) => {
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(step)) {
        next.delete(step);
      } else {
        next.add(step);
      }
      return next;
    });
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  return (
    <div className="space-y-4">
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
        No GSC properties found. Complete these steps to connect Google Search Console:
      </p>

      <div className="space-y-3">
        <ChecklistItem
          step={1}
          title="Add property in Google Search Console"
          completed={checkedSteps.has(1)}
          onToggle={() => toggleStep(1)}
        >
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>
              Go to{' '}
              <a
                href="https://search.google.com/search-console"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 underline"
                style={{ color: 'var(--accent-coral)' }}
              >
                Google Search Console
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </a>
            </li>
            <li>Click the property dropdown (top-left) → <strong>Add property</strong></li>
            <li>Choose <strong>URL prefix</strong> and enter your site URL (e.g., <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--bg-default)' }}>https://secondlook.vercel.app</code>)</li>
          </ol>
        </ChecklistItem>

        <ChecklistItem
          step={2}
          title="Verify ownership"
          completed={checkedSteps.has(2)}
          onToggle={() => toggleStep(2)}
        >
          <p>Choose one verification method:</p>
          <ul className="list-disc pl-4 space-y-1">
            <li><strong>HTML tag</strong> — Add a <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--bg-default)' }}>&lt;meta&gt;</code> tag to your site&apos;s <code className="text-xs px-1 py-0.5 rounded" style={{ background: 'var(--bg-default)' }}>&lt;head&gt;</code></li>
            <li><strong>DNS record</strong> — Add a TXT record to your domain&apos;s DNS settings</li>
            <li><strong>HTML file</strong> — Upload a verification file to your site root</li>
          </ul>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            For Vercel sites, the HTML tag method is usually easiest — add it to your root layout.
          </p>
        </ChecklistItem>

        <ChecklistItem
          step={3}
          title="Grant access to service account"
          completed={checkedSteps.has(3)}
          onToggle={() => toggleStep(3)}
        >
          <ol className="list-decimal pl-4 space-y-1.5">
            <li>In GSC, go to <strong>Settings → Users and permissions</strong></li>
            <li>Click <strong>Add user</strong></li>
            <li>Enter this email and select <strong>Full</strong> permission:</li>
          </ol>
          <div className="mt-2 p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg-default)' }}>
            <code className="text-xs flex-1 break-all">epch-research-dashboard@epch-research-dashboard.iam.gserviceaccount.com</code>
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0"
              title="Copy to clipboard"
            >
              {copied ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        </ChecklistItem>

        <ChecklistItem
          step={4}
          title="Wait for data (optional)"
          completed={checkedSteps.has(4)}
          onToggle={() => toggleStep(4)}
        >
          <ul className="list-disc pl-4 space-y-1">
            <li>GSC starts collecting data immediately after verification</li>
            <li>Initial data appears within <strong>24-48 hours</strong></li>
            <li>Full historical data may take <strong>3-5 days</strong></li>
          </ul>
          <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
            You can link the property now even if there&apos;s no data yet.
          </p>
        </ChecklistItem>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="btn btn-primary text-sm"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Checking...
            </>
          ) : (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              Check for Properties
            </>
          )}
        </button>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
          After adding the service account, click to refresh
        </span>
      </div>
    </div>
  );
}
