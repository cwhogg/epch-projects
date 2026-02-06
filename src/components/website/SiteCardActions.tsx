'use client';

import { useState } from 'react';
import Link from 'next/link';

interface SiteCardActionsProps {
  ideaId?: string;
  siteUrl?: string;
  status: string;
  isBuiltProduct?: boolean;
  detailsHref?: string;
}

export default function SiteCardActions({
  ideaId,
  siteUrl,
  status,
  isBuiltProduct,
  detailsHref,
}: SiteCardActionsProps) {
  const [showVerification, setShowVerification] = useState(false);
  const [verificationFile, setVerificationFile] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null);

  async function handleUploadVerification() {
    if (!verificationFile.trim() || !ideaId) return;

    setIsUploading(true);
    setUploadResult(null);

    try {
      // Extract filename from input (handle both full filename and just the code)
      let filename = verificationFile.trim();
      if (!filename.endsWith('.html')) {
        filename = `${filename}.html`;
      }
      if (!filename.startsWith('google')) {
        filename = `google${filename}`;
      }

      const content = `google-site-verification: ${filename}`;

      const res = await fetch(`/api/painted-door/${ideaId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filePath: `public/${filename}`,
          content,
          message: 'Add Google Search Console verification file',
        }),
      });

      const data = await res.json();

      if (res.ok) {
        setUploadResult({ success: true, message: `Added ${filename} — site will redeploy automatically` });
        setVerificationFile('');
      } else {
        setUploadResult({ success: false, message: data.error || 'Upload failed' });
      }
    } catch {
      setUploadResult({ success: false, message: 'Network error' });
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div className="space-y-3 pt-1">
      <div className="flex items-center gap-2 flex-wrap">
        {siteUrl && (status === 'live' || isBuiltProduct) && (
          <a
            href={siteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'rgba(56, 189, 248, 0.1)',
              color: '#38bdf8',
              border: '1px solid rgba(56, 189, 248, 0.25)',
            }}
          >
            Visit site
          </a>
        )}
        {ideaId && status === 'live' && (
          <Link
            href={`/analyses/${ideaId}/content`}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'rgba(255, 107, 91, 0.1)',
              color: '#ff6b5b',
              border: '1px solid rgba(255, 107, 91, 0.25)',
            }}
          >
            Create Content
          </Link>
        )}
        {detailsHref && (
          <Link
            href={detailsHref}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: 'rgba(167, 139, 250, 0.1)',
              color: '#a78bfa',
              border: '1px solid rgba(167, 139, 250, 0.25)',
            }}
          >
            Details
          </Link>
        )}
        {ideaId && status === 'live' && !isBuiltProduct && (
          <button
            onClick={() => setShowVerification(!showVerification)}
            className="text-xs px-3 py-1.5 rounded-lg transition-colors"
            style={{
              background: showVerification ? 'rgba(34, 197, 94, 0.2)' : 'rgba(34, 197, 94, 0.1)',
              color: '#22c55e',
              border: '1px solid rgba(34, 197, 94, 0.25)',
            }}
          >
            {showVerification ? 'Close' : 'GSC Verify'}
          </button>
        )}
      </div>

      {showVerification && ideaId && (
        <div
          className="p-3 rounded-lg space-y-2"
          style={{ background: 'rgba(34, 197, 94, 0.05)', border: '1px solid rgba(34, 197, 94, 0.15)' }}
        >
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Add Google Search Console verification file
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={verificationFile}
              onChange={(e) => setVerificationFile(e.target.value)}
              placeholder="google1234abc.html"
              className="flex-1 text-xs px-2 py-1.5 rounded"
              style={{
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border-color)',
                color: 'var(--text-primary)',
              }}
            />
            <button
              onClick={handleUploadVerification}
              disabled={isUploading || !verificationFile.trim()}
              className="text-xs px-3 py-1.5 rounded transition-colors disabled:opacity-50"
              style={{
                background: '#22c55e',
                color: 'white',
              }}
            >
              {isUploading ? '...' : 'Add'}
            </button>
          </div>
          {uploadResult && (
            <p
              className="text-xs"
              style={{ color: uploadResult.success ? '#22c55e' : '#ef4444' }}
            >
              {uploadResult.message}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
