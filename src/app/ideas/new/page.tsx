'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function NewIdeaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    targetUser: '',
    problemSolved: '',
    url: '',
    githubRepo: '',
    documentContent: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/ideas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        throw new Error('Failed to save idea');
      }

      const idea = await res.json();
      router.push(`/ideas/${idea.id}/analyze`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFormData((prev) => ({ ...prev, documentContent: text }));
    } catch {
      setError('Failed to read file');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-8 animate-slide-up stagger-1">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-sm mb-4 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5" />
            <path d="M12 19l-7-7 7-7" />
          </svg>
          Back
        </Link>
        <h1 className="text-2xl sm:text-3xl font-display" style={{ color: 'var(--text-primary)' }}>
          New Product Idea
        </h1>
        <p className="mt-2" style={{ color: 'var(--text-secondary)' }}>
          Enter details or just upload a document. Our AI will do the rest.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Error */}
        {error && (
          <div
            className="p-4 rounded-lg animate-fade-in"
            style={{
              background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(248, 113, 113, 0.1) 100%)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              color: '#f87171',
            }}
          >
            {error}
          </div>
        )}

        {/* Product Name */}
        <div className="animate-slide-up stagger-2">
          <label className="input-label">
            Product Name <span style={{ color: 'var(--accent-coral)' }}>*</span>
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className="input"
            placeholder="e.g., SecondLook"
          />
        </div>

        {/* Description */}
        <div className="animate-slide-up stagger-3">
          <label className="input-label">One-Line Description</label>
          <input
            type="text"
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="input"
            placeholder="e.g., AI-powered medical second opinion for rare diseases"
          />
        </div>

        {/* Two column grid on larger screens */}
        <div className="grid gap-4 sm:grid-cols-2 animate-slide-up stagger-4">
          <div>
            <label className="input-label">Target User</label>
            <input
              type="text"
              value={formData.targetUser}
              onChange={(e) => setFormData((prev) => ({ ...prev, targetUser: e.target.value }))}
              className="input"
              placeholder="e.g., Rare disease patients"
            />
          </div>
          <div>
            <label className="input-label">Landing Page URL</label>
            <input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
              className="input"
              placeholder="https://..."
            />
          </div>
        </div>

        {/* Problem Solved */}
        <div className="animate-slide-up stagger-5">
          <label className="input-label">Problem Solved</label>
          <textarea
            value={formData.problemSolved}
            onChange={(e) => setFormData((prev) => ({ ...prev, problemSolved: e.target.value }))}
            rows={3}
            className="input"
            style={{ resize: 'vertical', minHeight: '80px' }}
            placeholder="What problem does this solve?"
          />
        </div>

        {/* Document Upload Section */}
        <div
          className="card-static p-5 sm:p-6 animate-slide-up"
          style={{ animationDelay: '0.3s' }}
        >
          <h3 className="font-display text-base mb-4" style={{ color: 'var(--text-primary)' }}>
            Additional Context
          </h3>

          {/* File Upload */}
          <div className="mb-4">
            <label
              className="group flex flex-col items-center justify-center p-6 rounded-lg cursor-pointer transition-all hover:border-[var(--accent-coral)] hover:bg-[var(--accent-coral-soft)]"
              style={{
                border: '2px dashed var(--border-default)',
                background: 'var(--bg-elevated)',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-muted)"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mb-2 transition-all group-hover:stroke-[var(--accent-coral)] group-hover:-translate-y-1"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm font-medium transition-colors group-hover:text-[var(--accent-coral)]" style={{ color: 'var(--text-secondary)' }}>
                Drop a file or click to upload
              </span>
              <span className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                .txt, .md, or .pdf
              </span>
              <input
                type="file"
                accept=".txt,.md,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            {formData.documentContent && (
              <p className="mt-2 text-sm" style={{ color: '#34d399' }}>
                Document loaded ({formData.documentContent.length.toLocaleString()} characters)
              </p>
            )}
          </div>

          {/* Text Area */}
          <div>
            <label className="input-label">Or paste content</label>
            <textarea
              value={formData.documentContent}
              onChange={(e) => setFormData((prev) => ({ ...prev, documentContent: e.target.value }))}
              rows={5}
              className="input font-mono text-sm"
              style={{ resize: 'vertical' }}
              placeholder="Paste notes, specs, or any additional context..."
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4 animate-slide-up" style={{ animationDelay: '0.35s' }}>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="btn btn-secondary flex-1 sm:flex-none"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading || !formData.name.trim()}
            className="btn btn-primary flex-1"
          >
            {loading ? (
              <>
                <svg className="animate-spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Analyzing...
              </>
            ) : (
              <>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                Analyze Idea
              </>
            )}
          </button>
        </div>
      </form>

      {/* Info Card */}
      <div
        className="mt-8 p-5 rounded-lg animate-slide-up"
        style={{
          animationDelay: '0.4s',
          background: 'var(--accent-coral-soft)',
          border: '1px solid rgba(255, 107, 91, 0.2)',
        }}
      >
        <h3 className="font-display font-medium mb-2" style={{ color: 'var(--accent-coral)' }}>
          What happens next?
        </h3>
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Our AI analyzes your idea across 4 dimensions: competitive landscape, SEO opportunity,
          willingness to pay, and differentiation potential. Just provide a name — upload a doc
          for better results.
        </p>
      </div>
    </div>
  );
}
