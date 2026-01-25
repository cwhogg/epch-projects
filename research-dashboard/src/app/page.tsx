import Link from 'next/link';
import { getLeaderboard, getAnalyses } from '@/lib/data';

export const dynamic = 'force-dynamic';

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

export default function Home() {
  const leaderboard = getLeaderboard();
  const analyses = getAnalyses();

  return (
    <div className="space-y-8">
      {/* Leaderboard */}
      <section>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          Idea Leaderboard
        </h2>
        {leaderboard.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              No analyses yet. Add an idea and run the research agent to get started.
            </p>
            <Link
              href="/ideas/new"
              className="inline-block mt-4 bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-4 py-2 rounded-md text-sm font-medium hover:bg-zinc-800 dark:hover:bg-zinc-200"
            >
              Add Your First Idea
            </Link>
          </div>
        ) : (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <table className="w-full">
              <thead className="bg-zinc-50 dark:bg-zinc-800 border-b border-zinc-200 dark:border-zinc-700">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Rank
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Idea
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Recommendation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Confidence
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Top Strength
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 dark:text-zinc-400 uppercase tracking-wider">
                    Top Risk
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-700">
                {leaderboard.map((entry) => (
                  <tr key={entry.ideaId} className="hover:bg-zinc-50 dark:hover:bg-zinc-800">
                    <td className="px-4 py-4 text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      #{entry.rank}
                    </td>
                    <td className="px-4 py-4">
                      <Link
                        href={`/analyses/${entry.ideaId}`}
                        className="text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {entry.ideaName}
                      </Link>
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRecommendationColor(
                          entry.recommendation
                        )}`}
                      >
                        {entry.recommendation}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`text-sm font-medium ${getConfidenceColor(entry.confidence)}`}>
                        {entry.confidence}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600 dark:text-zinc-400">
                      {entry.topStrength}
                    </td>
                    <td className="px-4 py-4 text-sm text-zinc-600 dark:text-zinc-400 max-w-xs truncate">
                      {entry.topRisk}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* All Analyses */}
      <section>
        <h2 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100 mb-4">
          All Analyses
        </h2>
        {analyses.length === 0 ? (
          <div className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-8 text-center">
            <p className="text-zinc-600 dark:text-zinc-400">
              No analyses found. Run the research agent on an idea to generate analyses.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {analyses.map((analysis) => (
              <Link
                key={analysis.id}
                href={`/analyses/${analysis.id}`}
                className="bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800 p-6 hover:border-zinc-300 dark:hover:border-zinc-700 transition-colors"
              >
                <h3 className="font-semibold text-zinc-900 dark:text-zinc-100 mb-2">
                  {analysis.ideaName}
                </h3>
                <p className="text-sm text-zinc-600 dark:text-zinc-400 mb-4 line-clamp-2">
                  {analysis.summary || 'No summary available'}
                </p>
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${getRecommendationColor(
                      analysis.recommendation
                    )}`}
                  >
                    {analysis.recommendation}
                  </span>
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">
                    {new Date(analysis.completedAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="mt-3 flex gap-2">
                  {analysis.hasCompetitorAnalysis && (
                    <span className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 px-2 py-0.5 rounded">
                      Competitors
                    </span>
                  )}
                  {analysis.hasKeywordAnalysis && (
                    <span className="text-xs bg-purple-100 dark:bg-purple-900 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded">
                      Keywords
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
