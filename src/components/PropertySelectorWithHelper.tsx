'use client';

import { useState, useEffect } from 'react';

export interface GSCProperty {
  siteUrl: string;
  permissionLevel: string;
}

export default function PropertySelectorWithHelper({
  properties,
  selectedProperty,
  onSelectProperty,
  onRefresh,
  onLink,
  linking,
  ideaId,
}: {
  properties: GSCProperty[];
  selectedProperty: string;
  onSelectProperty: (url: string) => void;
  onRefresh: () => Promise<void>;
  onLink: () => Promise<void>;
  linking: boolean;
  ideaId: string;
}) {
  const [showHelper, setShowHelper] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [copiedEmail, setCopiedEmail] = useState(false);
  const [siteUrl, setSiteUrl] = useState<string | null>(null);

  // Fetch the painted door site URL for this idea
  useEffect(() => {
    async function fetchSiteUrl() {
      try {
        const res = await fetch('/api/painted-door/sites');
        if (res.ok) {
          const sites = await res.json();
          const site = sites.find((s: { ideaId: string; siteUrl: string }) => s.ideaId === ideaId);
          if (site?.siteUrl) {
            setSiteUrl(site.siteUrl);
          }
        }
      } catch { /* ignore */ }
    }
    fetchSiteUrl();
  }, [ideaId]);

  const copyToClipboard = async (text: string, setCopied: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textArea = document.createElement('textarea');
      textArea.value = text;
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  const CopyButton = ({ copied, onClick }: { copied: boolean; onClick: () => void }) => (
    <button
      onClick={onClick}
      className="p-1.5 rounded hover:bg-white/10 transition-colors shrink-0"
      title="Copy to clipboard"
    >
      {copied ? (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      ) : (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
        </svg>
      )}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Property selector */}
      <div className="flex items-center gap-3">
        <select
          value={selectedProperty}
          onChange={(e) => onSelectProperty(e.target.value)}
          className="flex-1 px-3 py-2 rounded-lg text-sm"
          style={{
            background: 'var(--bg-elevated)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {properties.map((p) => (
            <option key={p.siteUrl} value={p.siteUrl}>
              {p.siteUrl} ({p.permissionLevel})
            </option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="text-xs px-3 py-1.5 rounded-lg transition-colors"
          style={{ background: 'var(--bg-elevated)', color: 'var(--text-muted)', border: '1px solid var(--border-subtle)' }}
        >
          {refreshing ? '...' : 'Refresh'}
        </button>
        <button
          onClick={onLink}
          disabled={linking || !selectedProperty}
          className="btn btn-primary text-sm"
        >
          {linking ? 'Linking...' : 'Link Property'}
        </button>
      </div>

      {/* Add new property helper toggle */}
      <button
        onClick={() => setShowHelper(!showHelper)}
        className="flex items-center gap-2 text-sm transition-colors"
        style={{ color: 'var(--text-muted)' }}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: showHelper ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
        Don&apos;t see your property? Add a new one
      </button>

      {/* Collapsible checklist */}
      {showHelper && (
        <div
          className="p-4 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="space-y-4">
            {/* Step 1: Copy site URL */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>1</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Copy your site URL</p>
                {siteUrl && (
                  <div className="mt-1.5 p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg-default)' }}>
                    <code className="text-xs flex-1 break-all">{siteUrl}</code>
                    <CopyButton copied={copiedUrl} onClick={() => copyToClipboard(siteUrl, setCopiedUrl)} />
                  </div>
                )}
              </div>
            </div>

            {/* Step 2: Go to GSC */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>2</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>
                  Go to{' '}
                  <a
                    href="https://search.google.com/search-console"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 underline"
                    style={{ color: 'var(--accent-coral)' }}
                  >
                    Google Search Console
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                </p>
              </div>
            </div>

            {/* Step 3: Add property */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>3</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Click dropdown in top left → <strong>+ Add property</strong></p>
              </div>
            </div>

            {/* Step 4: URL prefix */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>4</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Choose <strong>URL prefix</strong> and paste your site URL</p>
              </div>
            </div>

            {/* Step 5: Verify */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>5</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Site should verify automatically</p>
              </div>
            </div>

            {/* Step 6: Add service account */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>6</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>In <strong>Settings → Users and permissions</strong>, add this email as a <strong>Full</strong> user:</p>
                <div className="mt-1.5 p-2 rounded flex items-center gap-2" style={{ background: 'var(--bg-default)' }}>
                  <code className="text-xs flex-1 break-all">epch-research-dashboard@epch-research-dashboard.iam.gserviceaccount.com</code>
                  <CopyButton copied={copiedEmail} onClick={() => copyToClipboard('epch-research-dashboard@epch-research-dashboard.iam.gserviceaccount.com', setCopiedEmail)} />
                </div>
              </div>
            </div>

            {/* Step 7: Refresh */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>7</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Click <strong>Refresh</strong> above — your property will appear in the dropdown</p>
              </div>
            </div>

            {/* Step 8: Link */}
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium" style={{ background: 'var(--accent-coral-soft)', color: 'var(--accent-coral)' }}>8</div>
              <div className="flex-1">
                <p style={{ color: 'var(--text-secondary)' }}>Select your property and click <strong>Link Property</strong></p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
