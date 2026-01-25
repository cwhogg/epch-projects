import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getAnalysis } from '@/lib/data';
import { getAnalysisFromDb, getAnalysisContent, isRedisConfigured } from '@/lib/db';
import MarkdownContent from '@/components/MarkdownContent';
import ReanalyzeForm from '@/components/ReanalyzeForm';
import { Analysis } from '@/types';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ id: string }>;
}

interface AnalysisData {
  analysis: Analysis;
  content: { main: string; competitors?: string; keywords?: string };
}

async function getAnalysisData(id: string): Promise<AnalysisData | null> {
  // Try database first if configured
  if (isRedisConfigured()) {
    const analysis = await getAnalysisFromDb(id);
    if (analysis) {
      const content = await getAnalysisContent(id);
      return {
        analysis,
        content: content || { main: 'Analysis content not available' },
      };
    }
  }

  // Fall back to file system
  return getAnalysis(id);
}

function getRecommendationColor(rec: string) {
  switch (rec) {
    case 'Test First':
      return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
    case 'Test Later':
      return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200';
    case "Don't Test":
      return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
    default:
      return 'bg-zinc-100 text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200';
  }
}

function getConfidenceColor(conf: string) {
  switch (conf) {
    case 'High':
      return 'text-green-600 dark:text-green-400';
    case 'Medium':
      return 'text-yellow-600 dark:text-yellow-400';
    case 'Low':
      return 'text-red-600 dark:text-red-400';
    default:
      return 'text-zinc-500 dark:text-zinc-400';
  }
}

export default async function AnalysisPage({ params }: PageProps) {
  const { id } = await params;
  const result = await getAnalysisData(id);

  if (!result) {
    notFound();
  }

  const { analysis, content } = result;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <Link
            href="/"
            className="text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 mb-2 inline-block"
          >
            ← Back to Leaderboard
          </Link>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100">
            {analysis.ideaName}
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400 mt-2">
            Analyzed on {new Date(analysis.completedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <span
            className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${getRecommendationColor(
              analysis.recommendation
            )}`}
          >
            {analysis.recommendation}
          </span>
          <span className={`text-sm font-medium ${getConfidenceColor(analysis.confidence)}`}>
            {analysis.confidence} Confidence
          </span>
        </div>
      </div>

      {/* Scores Grid */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Scores</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { key: 'seoOpportunity', label: 'SEO Opportunity' },
            { key: 'competitiveLandscape', label: 'Competition' },
            { key: 'willingnessToPay', label: 'Willingness to Pay' },
            { key: 'differentiationPotential', label: 'Differentiation' },
            { key: 'expertiseAlignment', label: 'Expertise' },
            { key: 'overall', label: 'Overall' },
          ].map(({ key, label }) => {
            const score = analysis.scores[key as keyof typeof analysis.scores];
            return (
              <div key={key} className="text-center">
                <div className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
                  {score !== null ? `${score}/10` : '?'}
                </div>
                <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{label}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Risks */}
      {analysis.risks && analysis.risks.length > 0 && (
        <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">Key Risks</h2>
          <ul className="space-y-2">
            {analysis.risks.map((risk, index) => (
              <li key={index} className="flex items-start gap-2">
                <span className="text-red-500 dark:text-red-400">•</span>
                <span className="text-zinc-700 dark:text-zinc-300">{risk}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Re-analyze */}
      <ReanalyzeForm ideaId={analysis.id} />

      {/* Main Analysis */}
      <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6">
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100 mb-4">
          Full Analysis
        </h2>
        <MarkdownContent content={content.main} />
      </div>
    </div>
  );
}
