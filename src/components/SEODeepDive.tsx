interface SEOSynthesisData {
  synthesis: {
    topKeywords: { keyword: string; intentType: string; estimatedVolume: string; estimatedCompetitiveness: string; relevanceToMillionARR: string; contentGapHypothesis: string }[];
    serpValidated: { keyword: string; hasContentGap: boolean; serpInsight: string; competitorDomains: string[]; serpData: { peopleAlsoAsk: { question: string }[] } }[];
    comparison: { agreedKeywords: string[]; claudeUniqueKeywords: string[]; openaiUniqueKeywords: string[] } | null;
    dataSources: string[];
    synthesisNarrative: string;
  };
}

export default function SEODeepDive({ seoDataJson }: { seoDataJson?: string }) {
  if (!seoDataJson) return null;

  let seoData: SEOSynthesisData;
  try {
    seoData = JSON.parse(seoDataJson) as SEOSynthesisData;
  } catch (error) {
    console.debug('[analysis-detail] data fetch failed:', error);
    return null;
  }

  const { synthesis } = seoData;
  if (!synthesis) return null;

  const competitivenessStyles: Record<string, { background: string; color: string }> = {
    Low: { background: 'rgba(52, 211, 153, 0.1)', color: 'var(--accent-emerald)' },
    Medium: { background: 'rgba(251, 191, 36, 0.1)', color: 'var(--accent-amber)' },
    High: { background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)' },
  };

  return (
    <div className="card-static p-5 sm:p-6 animate-slide-up stagger-3">
      <h2 className="font-display text-base mb-4 flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        SEO Deep Dive
      </h2>

      <p className="text-xs mb-4" style={{ color: 'var(--text-muted)' }}>
        Sources: {synthesis.dataSources.join(' + ')}
      </p>

      {/* Cross-Reference Summary */}
      {synthesis.comparison && (
        <div className="mb-5">
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            LLM Cross-Reference
          </h3>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="p-3 rounded-lg" style={{ background: 'rgba(52, 211, 153, 0.1)', border: '1px solid rgba(52, 211, 153, 0.2)' }}>
              <div className="text-lg font-display" style={{ color: 'var(--accent-emerald)' }}>
                {synthesis.comparison.agreedKeywords.length}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Agreed</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(99, 102, 241, 0.1)', border: '1px solid rgba(99, 102, 241, 0.2)' }}>
              <div className="text-lg font-display" style={{ color: 'var(--color-indigo)' }}>
                {synthesis.comparison.claudeUniqueKeywords.length}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Claude Only</div>
            </div>
            <div className="p-3 rounded-lg" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
              <div className="text-lg font-display" style={{ color: 'var(--accent-amber)' }}>
                {synthesis.comparison.openaiUniqueKeywords.length}
              </div>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>OpenAI Only</div>
            </div>
          </div>
          {synthesis.comparison.agreedKeywords.length > 0 && (
            <div className="mt-3">
              <span className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>
                Highest confidence:{' '}
              </span>
              <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {synthesis.comparison.agreedKeywords.slice(0, 8).join(', ')}
              </span>
            </div>
          )}
        </div>
      )}

      {/* SERP Validated Keywords */}
      {synthesis.serpValidated.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            SERP-Validated Keywords
          </h3>
          <div className="space-y-2">
            {synthesis.serpValidated.map((v, i) => (
              <div
                key={i}
                className="p-3 rounded-lg"
                style={{
                  background: v.hasContentGap ? 'rgba(52, 211, 153, 0.05)' : 'var(--bg-elevated)',
                  border: `1px solid ${v.hasContentGap ? 'rgba(52, 211, 153, 0.2)' : 'var(--border-subtle)'}`,
                }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    &quot;{v.keyword}&quot;
                  </span>
                  {v.hasContentGap && (
                    <span
                      className="text-xs px-2 py-0.5 rounded-full"
                      style={{ background: 'rgba(52, 211, 153, 0.15)', color: 'var(--accent-emerald)' }}
                    >
                      Content Gap
                    </span>
                  )}
                </div>
                <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {v.serpInsight}
                </p>
                {v.serpData.peopleAlsoAsk.length > 0 && (
                  <div className="mt-1.5 text-xs" style={{ color: 'var(--text-muted)' }}>
                    People Also Ask: {v.serpData.peopleAlsoAsk.slice(0, 2).map((q) => `"${q.question}"`).join(', ')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Keywords */}
      {synthesis.topKeywords.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-secondary)' }}>
            Top Keywords ({synthesis.topKeywords.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)' }}>
                  <th className="text-left py-2 pr-3 font-medium">Keyword</th>
                  <th className="text-left py-2 pr-3 font-medium">Intent</th>
                  <th className="text-left py-2 pr-3 font-medium">Competition</th>
                  <th className="text-left py-2 font-medium">ARR Relevance</th>
                </tr>
              </thead>
              <tbody>
                {synthesis.topKeywords.slice(0, 12).map((kw, i) => (
                  <tr
                    key={i}
                    style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-secondary)' }}
                  >
                    <td className="py-2 pr-3">{kw.keyword}</td>
                    <td className="py-2 pr-3">{kw.intentType}</td>
                    <td className="py-2 pr-3">
                      <span
                        className="px-1.5 py-0.5 rounded"
                        style={competitivenessStyles[kw.estimatedCompetitiveness ?? ''] ?? competitivenessStyles.High}
                      >
                        {kw.estimatedCompetitiveness}
                      </span>
                    </td>
                    <td className="py-2">{kw.relevanceToMillionARR}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
