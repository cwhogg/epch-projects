'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

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

      router.push('/');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setFormData((prev) => ({ ...prev, documentContent: text }));
    } catch (err) {
      setError('Failed to read file');
    }
  };

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-6">
        Add New Product Idea
      </h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-red-700 dark:text-red-300">
            {error}
          </div>
        )}

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Product Name *
          </label>
          <input
            type="text"
            required
            value={formData.name}
            onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., SecondLook"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            One-Line Description *
          </label>
          <input
            type="text"
            required
            value={formData.description}
            onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., AI-powered medical second opinion for rare diseases"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Target User *
          </label>
          <input
            type="text"
            required
            value={formData.targetUser}
            onChange={(e) => setFormData((prev) => ({ ...prev, targetUser: e.target.value }))}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Patients with undiagnosed rare diseases"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
            Problem Solved *
          </label>
          <textarea
            required
            value={formData.problemSolved}
            onChange={(e) => setFormData((prev) => ({ ...prev, problemSolved: e.target.value }))}
            rows={3}
            className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder="e.g., Patients struggle to get accurate diagnoses for rare diseases..."
          />
        </div>

        <div className="border-t border-zinc-200 dark:border-zinc-700 pt-6">
          <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-4">
            Additional Resources (Optional)
          </h3>

          <div className="space-y-4">
            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Landing Page URL
              </label>
              <input
                type="url"
                value={formData.url}
                onChange={(e) => setFormData((prev) => ({ ...prev, url: e.target.value }))}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://example.vercel.app"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                GitHub Repository
              </label>
              <input
                type="url"
                value={formData.githubRepo}
                onChange={(e) => setFormData((prev) => ({ ...prev, githubRepo: e.target.value }))}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                placeholder="https://github.com/user/repo"
              />
            </div>

            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Upload Description Document
              </label>
              <input
                type="file"
                accept=".txt,.md,.pdf"
                onChange={handleFileUpload}
                className="w-full text-sm text-zinc-500 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-zinc-100 dark:file:bg-zinc-800 file:text-zinc-700 dark:file:text-zinc-300 hover:file:bg-zinc-200 dark:hover:file:bg-zinc-700"
              />
              {formData.documentContent && (
                <p className="mt-2 text-sm text-green-600 dark:text-green-400">
                  Document loaded ({formData.documentContent.length} characters)
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm text-zinc-600 dark:text-zinc-400 mb-2">
                Or paste document content
              </label>
              <textarea
                value={formData.documentContent}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, documentContent: e.target.value }))
                }
                rows={6}
                className="w-full px-4 py-2 border border-zinc-300 dark:border-zinc-700 rounded-lg bg-white dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                placeholder="Paste any additional context, notes, or documentation..."
              />
            </div>
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={loading}
            className="flex-1 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-6 py-3 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Saving...' : 'Save Idea'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/')}
            className="px-6 py-3 rounded-lg font-medium border border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            Cancel
          </button>
        </div>
      </form>

      <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-2">Running the Research Agent</h3>
        <p className="text-sm text-blue-700 dark:text-blue-300">
          After saving your idea, run the research agent from the command line to generate the analysis:
        </p>
        <code className="block mt-2 p-2 bg-blue-100 dark:bg-blue-900/40 rounded text-sm font-mono text-blue-800 dark:text-blue-200">
          claude &quot;Analyze the idea: [idea-name] following the research agent playbook&quot;
        </code>
      </div>
    </div>
  );
}
