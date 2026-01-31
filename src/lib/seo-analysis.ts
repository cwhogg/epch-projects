import Anthropic from '@anthropic-ai/sdk';
import { ProductIdea } from '@/types';
import { getOpenAI, isOpenAIConfigured } from './openai';
import { SERPResult, batchSearchGoogle, isSerpConfigured } from './serp-search';
import {
  buildClaudeKnowledgeContext,
  buildOpenAIKnowledgeContext,
  buildScoringGuidelines,
  detectVertical,
  SERP_CRITERIA,
  CONTENT_GAP_TYPES,
} from './seo-knowledge';

// ---------- Types ----------

export interface SEOKeyword {
  keyword: string;
  intentType: 'Informational' | 'Navigational' | 'Commercial' | 'Transactional';
  estimatedVolume: 'High' | 'Medium' | 'Low' | 'Unknown';
  estimatedCompetitiveness: 'High' | 'Medium' | 'Low' | 'Unknown';
  contentGapHypothesis: string;
  relevanceToMillionARR: 'High' | 'Medium' | 'Low';
  rationale: string;
  opportunityScore?: number;
  contentGapType?: string;
  serpSignals?: string[];
}

export interface SEOContentStrategy {
  topOpportunities: string[];
  recommendedAngle: string;
  communitySignals: string[];
}

export interface SEODifficultyAssessment {
  dominantPlayers: string[];
  roomForNewEntrant: boolean;
  reasoning: string;
}

export interface SEOAnalysisResult {
  keywords: SEOKeyword[];
  contentStrategy: SEOContentStrategy;
  difficultyAssessment: SEODifficultyAssessment;
}

export interface SEOComparison {
  agreedKeywords: string[];
  claudeUniqueKeywords: string[];
  openaiUniqueKeywords: string[];
  totalClaudeKeywords: number;
  totalOpenAIKeywords: number;
}

export interface SEOSynthesis {
  topKeywords: SEOKeyword[];
  serpValidated: SERPValidatedKeyword[];
  contentStrategy: SEOContentStrategy;
  difficultyAssessment: SEODifficultyAssessment;
  comparison: SEOComparison | null;
  synthesisNarrative: string;
  dataSources: string[];
}

export interface SERPValidatedKeyword {
  keyword: string;
  serpData: SERPResult;
  competitorDomains: string[];
  hasContentGap: boolean;
  serpInsight: string;
  contentGapTypes?: string[];
  greenFlags?: string[];
  redFlags?: string[];
}

export interface SEOPipelineResult {
  synthesis: SEOSynthesis;
  claudeRaw: SEOAnalysisResult;
  openaiRaw: SEOAnalysisResult | null;
  serpResults: SERPResult[];
  markdownReport: string;
}

// ---------- JSON Schema for LLM Output ----------

const SEO_OUTPUT_SCHEMA = `{
  "keywords": [
    {
      "keyword": "string",
      "intentType": "Informational | Navigational | Commercial | Transactional",
      "estimatedVolume": "High | Medium | Low | Unknown",
      "estimatedCompetitiveness": "High | Medium | Low | Unknown",
      "contentGapHypothesis": "string - what content is missing that this keyword reveals",
      "relevanceToMillionARR": "High | Medium | Low",
      "rationale": "string - why this keyword matters for a $1M ARR niche business",
      "opportunityScore": "number 1-10 (optional) - overall opportunity rating",
      "contentGapType": "Format | Freshness | Depth | Angle | Audience (optional) - primary gap type",
      "serpSignals": ["string (optional) - observable SERP signals like 'Reddit ranking', 'thin content'"]
    }
  ],
  "contentStrategy": {
    "topOpportunities": ["string - top 3 content opportunities"],
    "recommendedAngle": "string - the recommended content angle",
    "communitySignals": ["string - where target users gather and what they say"]
  },
  "difficultyAssessment": {
    "dominantPlayers": ["string - who dominates search for this niche"],
    "roomForNewEntrant": true/false,
    "reasoning": "string - why there is or isn't room"
  }
}`;

// ---------- Claude SEO Analysis ----------

export async function runClaudeSEOAnalysis(
  idea: ProductIdea,
  additionalContext?: string,
): Promise<SEOAnalysisResult> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  const knowledgeContext = buildClaudeKnowledgeContext(idea);

  const prompt = `You are a SENIOR SEO STRATEGIST with 15 years of experience in niche B2B SaaS markets.
Your specialty: finding underserved, long-tail keyword opportunities for businesses targeting $1M ARR.

You approach SEO methodically:
- Start with problem-aware queries (what do people search when they have this problem?)
- Map the full keyword funnel: awareness → consideration → decision
- Identify content gaps where existing players have thin or no coverage
- Think about community signals (Reddit, forums, Quora) as keyword sources
- Focus on keywords a small team could actually rank for

${knowledgeContext}

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 3000)}` : ''}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}

Generate 15-20 niche, long-tail keywords this product should target. Focus on UNDERSERVED opportunities, not obvious high-competition terms.

For each keyword, include an opportunityScore (1-10) and identify the contentGapType if applicable (Format, Freshness, Depth, Angle, or Audience).

IMPORTANT: Do NOT fabricate search volume data. Use estimates based on your understanding of the niche.

Respond ONLY with valid JSON matching this schema:
${SEO_OUTPUT_SCHEMA}`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 3000,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  return parseSEOJSON(text);
}

// ---------- OpenAI SEO Analysis ----------

export async function runOpenAISEOAnalysis(
  idea: ProductIdea,
  additionalContext?: string,
): Promise<SEOAnalysisResult | null> {
  const openai = getOpenAI();
  if (!openai) return null;

  const openaiKnowledgeContext = buildOpenAIKnowledgeContext(idea);

  const prompt = `You are a SCRAPPY FOUNDER who bootstrapped a B2B SaaS to $1M ARR.
You know exactly what people search when they're desperate for a solution.

Your approach to keyword research:
- Start with pain-point queries ("how to fix...", "why does... keep failing", "[competitor] sucks")
- Think about what people type at 2am when they're frustrated
- Focus on "alternatives to..." and "best [X] for [specific use case]" queries
- Consider Reddit/forum language - real people don't use marketing speak
- Find the keywords big companies ignore because they're "too niche"

${openaiKnowledgeContext}

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 3000)}` : ''}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}

Generate 15-20 niche, long-tail keywords. Focus on pain-point searches that indicate HIGH buying intent from people who would pay for this product.

For each keyword, include an opportunityScore (1-10) and identify the contentGapType if applicable (Format, Freshness, Depth, Angle, or Audience).

IMPORTANT: Do NOT fabricate search volume numbers. Estimate based on niche understanding.

Respond ONLY with valid JSON matching this schema:
${SEO_OUTPUT_SCHEMA}`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      max_tokens: 3000,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.choices[0]?.message?.content || '';
    return parseSEOJSON(text);
  } catch (error) {
    console.error('OpenAI SEO analysis failed:', error);
    return null;
  }
}

// ---------- Compare Results ----------

export function compareSEOResults(
  claudeResult: SEOAnalysisResult,
  openaiResult: SEOAnalysisResult | null,
): SEOComparison | null {
  if (!openaiResult) return null;

  const claudeKeywords = claudeResult.keywords.map((k) => k.keyword.toLowerCase().trim());
  const openaiKeywords = openaiResult.keywords.map((k) => k.keyword.toLowerCase().trim());

  const agreed: string[] = [];
  const claudeOnly: string[] = [];
  const openaiOnly: string[] = [];

  for (const ck of claudeKeywords) {
    if (fuzzyMatch(ck, openaiKeywords)) {
      agreed.push(ck);
    } else {
      claudeOnly.push(ck);
    }
  }

  for (const ok of openaiKeywords) {
    if (!fuzzyMatch(ok, claudeKeywords)) {
      openaiOnly.push(ok);
    }
  }

  return {
    agreedKeywords: agreed,
    claudeUniqueKeywords: claudeOnly,
    openaiUniqueKeywords: openaiOnly,
    totalClaudeKeywords: claudeKeywords.length,
    totalOpenAIKeywords: openaiKeywords.length,
  };
}

function fuzzyMatch(keyword: string, list: string[]): boolean {
  const normalized = keyword.replace(/[^a-z0-9 ]/g, '').trim();
  return list.some((item) => {
    const normalizedItem = item.replace(/[^a-z0-9 ]/g, '').trim();
    // Exact match
    if (normalized === normalizedItem) return true;
    // One contains the other
    if (normalized.includes(normalizedItem) || normalizedItem.includes(normalized)) return true;
    // Word overlap >= 60%
    const words1 = new Set(normalized.split(/\s+/));
    const words2 = new Set(normalizedItem.split(/\s+/));
    const intersection = [...words1].filter((w) => words2.has(w));
    const minSize = Math.min(words1.size, words2.size);
    return minSize > 0 && intersection.length / minSize >= 0.6;
  });
}

// ---------- SERP Validation ----------

export async function validateWithGoogleSearch(
  keywords: SEOKeyword[],
): Promise<{ serpResults: SERPResult[]; validated: SERPValidatedKeyword[] }> {
  if (!isSerpConfigured()) {
    return { serpResults: [], validated: [] };
  }

  // Pick top 8 keywords by relevance
  const topKeywords = keywords
    .filter((k) => k.relevanceToMillionARR !== 'Low')
    .slice(0, 8)
    .map((k) => k.keyword);

  if (topKeywords.length === 0) {
    return { serpResults: [], validated: [] };
  }

  const serpResults = await batchSearchGoogle(topKeywords);

  const validated: SERPValidatedKeyword[] = serpResults.map((serp) => {
    const competitorDomains = [...new Set(serp.organicResults.map((r) => r.domain))];
    const gapAnalysis = detectContentGap(serp);
    const serpInsight = generateSerpInsight(serp, gapAnalysis.hasGap);
    const flagAnalysis = detectSERPFlags(serp);

    return {
      keyword: serp.keyword,
      serpData: serp,
      competitorDomains,
      hasContentGap: gapAnalysis.hasGap,
      serpInsight,
      contentGapTypes: gapAnalysis.gapTypes,
      greenFlags: flagAnalysis.green,
      redFlags: flagAnalysis.red,
    };
  });

  return { serpResults, validated };
}

interface ContentGapAnalysis {
  hasGap: boolean;
  gapTypes: string[];
}

function detectContentGap(serp: SERPResult): ContentGapAnalysis {
  const gapTypes: string[] = [];
  const criteria = SERP_CRITERIA['general-niche'];

  // 1. Few organic results → Depth gap
  if (serp.organicResults.length < 5) {
    gapTypes.push('Depth');
  }

  // 2. Results are mostly generic/big sites, not specialized → Audience gap
  const genericCount = serp.organicResults.filter((r) =>
    criteria.genericDomains.some((d) => r.domain.includes(d))
  ).length;
  if (genericCount >= 3) {
    gapTypes.push('Audience');
  }

  // 3. Forum/Reddit results in top positions → Depth gap (no authoritative content)
  const forumDomains = ['reddit.com', 'quora.com', 'stackexchange.com', 'stackoverflow.com'];
  const forumCount = serp.organicResults.filter((r) =>
    forumDomains.some((d) => r.domain.includes(d))
  ).length;
  if (forumCount >= 2) {
    if (!gapTypes.includes('Depth')) gapTypes.push('Depth');
  }

  // 4. Snippets don't closely match the query → Angle gap
  const lowRelevanceSnippets = serp.organicResults.filter(
    (r) => r.snippet.length < 50
  ).length;
  if (lowRelevanceSnippets >= 4) {
    gapTypes.push('Angle');
  }

  // 5. People Also Ask present → potential Format or Depth gap
  if (serp.peopleAlsoAsk.length >= 3) {
    if (!gapTypes.includes('Depth')) gapTypes.push('Depth');
  }

  // 6. Authority domains dominating → check for Freshness or Format gaps
  const authorityCount = serp.organicResults.filter((r) =>
    criteria.authorityDomains.some((d) => r.domain.includes(d))
  ).length;
  if (authorityCount >= 3 && gapTypes.length === 0) {
    // All authority sites, but check if there's a format gap
    gapTypes.push('Format');
  }

  return {
    hasGap: gapTypes.length > 0,
    gapTypes,
  };
}

function detectSERPFlags(serp: SERPResult): { green: string[]; red: string[] } {
  const green: string[] = [];
  const red: string[] = [];
  const criteria = SERP_CRITERIA['general-niche'];

  // Green flags
  const forumDomains = ['reddit.com', 'quora.com', 'stackexchange.com'];
  const hasForums = serp.organicResults.some((r) =>
    forumDomains.some((d) => r.domain.includes(d))
  );
  if (hasForums) green.push('Forums ranking in top results');

  const shortSnippets = serp.organicResults.filter((r) => r.snippet.length < 80).length;
  if (shortSnippets >= 3) green.push('Thin content in results');

  if (serp.peopleAlsoAsk.length > 0) green.push('People Also Ask present');

  if (serp.organicResults.length < 7) green.push('Few organic results');

  // Red flags
  const authorityCount = serp.organicResults.slice(0, 5).filter((r) =>
    criteria.authorityDomains.some((d) => r.domain.includes(d))
  ).length;
  if (authorityCount >= 3) red.push('Authority domains dominating top 5');

  const uniqueDomains = new Set(serp.organicResults.slice(0, 5).map((r) => r.domain));
  if (uniqueDomains.size <= 2) red.push('Top results dominated by few domains');

  return { green, red };
}

function generateSerpInsight(serp: SERPResult, hasContentGap: boolean): string {
  // Note: hasContentGap is now derived from ContentGapAnalysis.hasGap
  const parts: string[] = [];

  if (hasContentGap) {
    parts.push('Content gap detected - limited specialized coverage.');
  } else {
    parts.push('Competitive SERP - established players present.');
  }

  if (serp.organicResults.length > 0) {
    const topDomains = serp.organicResults.slice(0, 3).map((r) => r.domain);
    parts.push(`Top domains: ${topDomains.join(', ')}.`);
  }

  if (serp.peopleAlsoAsk.length > 0) {
    parts.push(`${serp.peopleAlsoAsk.length} "People Also Ask" questions found.`);
  }

  if (serp.relatedSearches.length > 0) {
    parts.push(`${serp.relatedSearches.length} related searches discovered.`);
  }

  return parts.join(' ');
}

// ---------- Synthesis ----------

export async function synthesizeSEOAnalysis(
  idea: ProductIdea,
  claudeResult: SEOAnalysisResult,
  openaiResult: SEOAnalysisResult | null,
  comparison: SEOComparison | null,
  validated: SERPValidatedKeyword[],
): Promise<SEOSynthesis> {
  const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY || '',
  });

  const dataSources = ['Claude SEO Analysis'];
  if (openaiResult) dataSources.push('OpenAI SEO Analysis');
  if (validated.length > 0) dataSources.push(`Google SERP Validation (${validated.length} keywords)`);

  const comparisonSection = comparison
    ? `
## LLM Cross-Reference (two complementary perspectives — all keywords are valuable)
- Keywords from both LLMs: ${comparison.agreedKeywords.length} overlapping, ${comparison.claudeUniqueKeywords.length} Claude-unique, ${comparison.openaiUniqueKeywords.length} OpenAI-unique
- Claude (strategist) keywords: ${[...comparison.agreedKeywords, ...comparison.claudeUniqueKeywords].slice(0, 10).join(', ')}
- OpenAI (founder) keywords: ${[...comparison.agreedKeywords, ...comparison.openaiUniqueKeywords].slice(0, 10).join(', ')}
Note: Low overlap is normal — each LLM brings a different lens (strategic vs. pain-point). Unique keywords are equally valuable.
`
    : '';

  const serpSection = validated.length > 0
    ? `
## SERP Validation Results
${validated.map((v) => `- **"${v.keyword}"**: ${v.serpInsight}`).join('\n')}

Content gaps found: ${validated.filter((v) => v.hasContentGap).length} of ${validated.length} keywords
`
    : '';

  const openaiSection = openaiResult
    ? `
## OpenAI Keyword Suggestions (scrappy founder perspective)
Top keywords: ${openaiResult.keywords.slice(0, 10).map((k) => k.keyword).join(', ')}
Recommended angle: ${openaiResult.contentStrategy.recommendedAngle}
`
    : '';

  const scoringGuidelines = buildScoringGuidelines();

  const prompt = `You are synthesizing SEO research from multiple sources into a final report.

${scoringGuidelines}

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}

## Claude SEO Analysis (senior strategist perspective)
Top keywords: ${claudeResult.keywords.slice(0, 10).map((k) => `${k.keyword} (${k.intentType}, relevance: ${k.relevanceToMillionARR}${k.opportunityScore ? `, score: ${k.opportunityScore}` : ''})`).join(', ')}
Content strategy: ${claudeResult.contentStrategy.recommendedAngle}
Room for new entrant: ${claudeResult.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'} - ${claudeResult.difficultyAssessment.reasoning}
${openaiSection}${comparisonSection}${serpSection}

Data sources used: ${dataSources.join(', ')}

Write a concise synthesis narrative (3-5 paragraphs) that:
1. Identifies the best keyword opportunities from ALL sources — treat Claude and OpenAI keywords as complementary perspectives, not redundant. Keywords unique to one LLM are just as valuable as overlapping ones; overlap is a minor confidence signal, not the primary filter.
2. Highlights any content gaps validated by real SERP data
3. Recommends a content strategy for a small team targeting $1M ARR
4. Notes any cautions or areas where the data was limited

Be direct and actionable. No fluff.`;

  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 2000,
    messages: [{ role: 'user', content: prompt }],
  });

  const narrative = response.content[0].type === 'text' ? response.content[0].text : '';

  // Merge keywords: agreed keywords first, then Claude unique, then OpenAI unique
  const allKeywords = mergeKeywords(claudeResult, openaiResult, comparison);

  return {
    topKeywords: allKeywords.slice(0, 20),
    serpValidated: validated,
    contentStrategy: claudeResult.contentStrategy,
    difficultyAssessment: claudeResult.difficultyAssessment,
    comparison,
    synthesisNarrative: narrative,
    dataSources,
  };
}

function mergeKeywords(
  claudeResult: SEOAnalysisResult,
  openaiResult: SEOAnalysisResult | null,
  comparison: SEOComparison | null,
): SEOKeyword[] {
  if (!openaiResult || !comparison) return claudeResult.keywords;

  const merged: SEOKeyword[] = [];
  const seen = new Set<string>();

  // First: agreed keywords from Claude's version (highest confidence)
  for (const kw of claudeResult.keywords) {
    const normalized = kw.keyword.toLowerCase().trim();
    if (comparison.agreedKeywords.some((a) => fuzzyMatch(a, [normalized]))) {
      merged.push(kw);
      seen.add(normalized);
    }
  }

  // Second: remaining Claude keywords
  for (const kw of claudeResult.keywords) {
    const normalized = kw.keyword.toLowerCase().trim();
    if (!seen.has(normalized)) {
      merged.push(kw);
      seen.add(normalized);
    }
  }

  // Third: OpenAI-unique keywords
  for (const kw of openaiResult.keywords) {
    const normalized = kw.keyword.toLowerCase().trim();
    if (!fuzzyMatch(normalized, [...seen])) {
      merged.push(kw);
      seen.add(normalized);
    }
  }

  return merged;
}

// ---------- Orchestrator ----------

export async function runFullSEOPipeline(
  idea: ProductIdea,
  additionalContext?: string,
  onProgress?: (step: string, detail?: string) => Promise<void>,
): Promise<SEOPipelineResult> {
  // Phase 1+2: Run Claude and OpenAI in parallel
  if (onProgress) await onProgress('seo-claude', 'Starting Claude SEO analysis...');

  const [claudeResult, openaiResult] = await Promise.all([
    runClaudeSEOAnalysis(idea, additionalContext),
    isOpenAIConfigured()
      ? (async () => {
          if (onProgress) await onProgress('seo-openai', 'Starting OpenAI SEO analysis...');
          return runOpenAISEOAnalysis(idea, additionalContext);
        })()
      : Promise.resolve(null),
  ]);

  if (onProgress) await onProgress('seo-claude', 'Claude found ' + claudeResult.keywords.length + ' keywords');
  if (openaiResult && onProgress) {
    await onProgress('seo-openai', 'OpenAI found ' + openaiResult.keywords.length + ' keywords');
  }

  // Phase 3: Compare results
  if (onProgress) await onProgress('seo-compare', 'Comparing LLM results...');
  const comparison = compareSEOResults(claudeResult, openaiResult);
  if (comparison && onProgress) {
    const totalKeywords = comparison.agreedKeywords.length + comparison.claudeUniqueKeywords.length + comparison.openaiUniqueKeywords.length;
    await onProgress('seo-compare', `${totalKeywords} total keywords from both LLMs (${comparison.agreedKeywords.length} overlapping)`);
  }

  // Phase 4: SERP validation
  if (onProgress) await onProgress('seo-serp', 'Validating top keywords against Google...');
  const allKeywords = mergeKeywords(claudeResult, openaiResult, comparison);
  const { serpResults, validated } = await validateWithGoogleSearch(allKeywords);
  if (onProgress) {
    const gapsFound = validated.filter((v) => v.hasContentGap).length;
    await onProgress('seo-serp', validated.length > 0
      ? `${gapsFound} content gaps found in ${validated.length} searches`
      : 'Skipped (no SERPAPI key)');
  }

  // Phase 5: Synthesis
  if (onProgress) await onProgress('seo-synthesis', 'Synthesizing all SEO data...');
  const synthesis = await synthesizeSEOAnalysis(idea, claudeResult, openaiResult, comparison, validated);
  if (onProgress) await onProgress('seo-synthesis', 'Synthesis complete');

  // Generate markdown report
  const markdownReport = generateMarkdownReport(synthesis, claudeResult, openaiResult);

  return {
    synthesis,
    claudeRaw: claudeResult,
    openaiRaw: openaiResult,
    serpResults,
    markdownReport,
  };
}

function generateMarkdownReport(
  synthesis: SEOSynthesis,
  claudeResult: SEOAnalysisResult,
  openaiResult: SEOAnalysisResult | null,
): string {
  const parts: string[] = [];

  parts.push(`## SEO & Keyword Research\n`);
  parts.push(`*Data sources: ${synthesis.dataSources.join(', ')}*\n`);

  // Synthesis narrative
  parts.push(`### Analysis\n`);
  parts.push(synthesis.synthesisNarrative);
  parts.push('');

  // Top keywords table
  parts.push(`### Top Keywords\n`);
  const hasScores = synthesis.topKeywords.some((kw) => kw.opportunityScore != null);
  if (hasScores) {
    parts.push(`| Keyword | Intent | Est. Volume | Est. Competition | ARR Relevance | Score | Gap Type | Gap Hypothesis |`);
    parts.push(`|---------|--------|-------------|------------------|---------------|-------|----------|----------------|`);
    for (const kw of synthesis.topKeywords.slice(0, 15)) {
      parts.push(`| ${kw.keyword} | ${kw.intentType} | ${kw.estimatedVolume} | ${kw.estimatedCompetitiveness} | ${kw.relevanceToMillionARR} | ${kw.opportunityScore ?? '-'} | ${kw.contentGapType ?? '-'} | ${kw.contentGapHypothesis} |`);
    }
  } else {
    parts.push(`| Keyword | Intent | Est. Volume | Est. Competition | ARR Relevance | Gap Hypothesis |`);
    parts.push(`|---------|--------|-------------|------------------|---------------|----------------|`);
    for (const kw of synthesis.topKeywords.slice(0, 15)) {
      parts.push(`| ${kw.keyword} | ${kw.intentType} | ${kw.estimatedVolume} | ${kw.estimatedCompetitiveness} | ${kw.relevanceToMillionARR} | ${kw.contentGapHypothesis} |`);
    }
  }
  parts.push('');

  // SERP validation
  if (synthesis.serpValidated.length > 0) {
    parts.push(`### SERP Validation\n`);
    for (const v of synthesis.serpValidated) {
      const gapLabel = v.hasContentGap
        ? `(Content Gap${v.contentGapTypes?.length ? ': ' + v.contentGapTypes.join(', ') : ''}!)`
        : '(Competitive)';
      parts.push(`**"${v.keyword}"** ${gapLabel}`);
      parts.push(`${v.serpInsight}`);
      if (v.greenFlags?.length) {
        parts.push(`Green flags: ${v.greenFlags.join('; ')}`);
      }
      if (v.redFlags?.length) {
        parts.push(`Red flags: ${v.redFlags.join('; ')}`);
      }
      if (v.serpData.peopleAlsoAsk.length > 0) {
        parts.push(`People Also Ask: ${v.serpData.peopleAlsoAsk.slice(0, 3).map((q) => `"${q.question}"`).join(', ')}`);
      }
      parts.push('');
    }
  }

  // Comparison
  if (synthesis.comparison) {
    parts.push(`### LLM Cross-Reference\n`);
    parts.push(`Two complementary perspectives — Claude (senior strategist) and OpenAI (scrappy founder) — each surface different keyword opportunities. All keywords are valuable regardless of overlap.\n`);
    parts.push(`- **Overlapping:** ${synthesis.comparison.agreedKeywords.length} keywords (both LLMs identified)`);
    parts.push(`- **Claude-unique:** ${synthesis.comparison.claudeUniqueKeywords.length} keywords (strategic/analytical lens)`);
    parts.push(`- **OpenAI-unique:** ${synthesis.comparison.openaiUniqueKeywords.length} keywords (pain-point/community lens)`);
    if (synthesis.comparison.agreedKeywords.length > 0) {
      parts.push(`\nOverlapping keywords: ${synthesis.comparison.agreedKeywords.join(', ')}`);
    }
    parts.push('');
  }

  // Content strategy
  parts.push(`### Content Strategy\n`);
  parts.push(`**Recommended angle:** ${synthesis.contentStrategy.recommendedAngle}\n`);
  parts.push(`**Top opportunities:**`);
  for (const opp of synthesis.contentStrategy.topOpportunities) {
    parts.push(`- ${opp}`);
  }
  parts.push('');

  // Difficulty assessment
  parts.push(`### SEO Difficulty Assessment\n`);
  parts.push(`**Room for new entrant:** ${synthesis.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'}`);
  parts.push(`**Dominant players:** ${synthesis.difficultyAssessment.dominantPlayers.join(', ')}`);
  parts.push(`**Reasoning:** ${synthesis.difficultyAssessment.reasoning}`);

  return parts.join('\n');
}

// ---------- Helpers ----------

function parseSEOJSON(text: string): SEOAnalysisResult {
  // Try to extract JSON from the response
  let jsonStr = text.trim();

  // Strip markdown code fences if present
  const codeBlockMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    jsonStr = codeBlockMatch[1].trim();
  }

  try {
    const parsed = JSON.parse(jsonStr);
    return validateSEOResult(parsed);
  } catch {
    // Try to find JSON object in the text
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return validateSEOResult(parsed);
      } catch {
        // Fall through to default
      }
    }
    console.error('Failed to parse SEO JSON, returning defaults');
    return getDefaultSEOResult();
  }
}

function validateSEOResult(parsed: Record<string, unknown>): SEOAnalysisResult {
  const keywords: SEOKeyword[] = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k: Record<string, unknown>) => {
        const kw: SEOKeyword = {
          keyword: String(k.keyword || ''),
          intentType: validateEnum(k.intentType, ['Informational', 'Navigational', 'Commercial', 'Transactional'], 'Informational'),
          estimatedVolume: validateEnum(k.estimatedVolume, ['High', 'Medium', 'Low', 'Unknown'], 'Unknown'),
          estimatedCompetitiveness: validateEnum(k.estimatedCompetitiveness, ['High', 'Medium', 'Low', 'Unknown'], 'Unknown'),
          contentGapHypothesis: String(k.contentGapHypothesis || ''),
          relevanceToMillionARR: validateEnum(k.relevanceToMillionARR, ['High', 'Medium', 'Low'], 'Medium'),
          rationale: String(k.rationale || ''),
        };
        if (k.opportunityScore != null) {
          const score = Number(k.opportunityScore);
          if (!isNaN(score) && score >= 1 && score <= 10) kw.opportunityScore = score;
        }
        if (k.contentGapType && typeof k.contentGapType === 'string') {
          const validGapTypes = ['Format', 'Freshness', 'Depth', 'Angle', 'Audience'];
          if (validGapTypes.includes(k.contentGapType)) kw.contentGapType = k.contentGapType;
        }
        if (Array.isArray(k.serpSignals)) {
          kw.serpSignals = k.serpSignals.map(String);
        }
        return kw;
      })
    : [];

  const cs = (parsed.contentStrategy || {}) as Record<string, unknown>;
  const da = (parsed.difficultyAssessment || {}) as Record<string, unknown>;

  return {
    keywords,
    contentStrategy: {
      topOpportunities: Array.isArray(cs.topOpportunities) ? cs.topOpportunities.map(String) : [],
      recommendedAngle: String(cs.recommendedAngle || ''),
      communitySignals: Array.isArray(cs.communitySignals) ? cs.communitySignals.map(String) : [],
    },
    difficultyAssessment: {
      dominantPlayers: Array.isArray(da.dominantPlayers) ? da.dominantPlayers.map(String) : [],
      roomForNewEntrant: Boolean(da.roomForNewEntrant),
      reasoning: String(da.reasoning || ''),
    },
  };
}

function validateEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  const str = String(value);
  return allowed.includes(str as T) ? (str as T) : fallback;
}

function getDefaultSEOResult(): SEOAnalysisResult {
  return {
    keywords: [],
    contentStrategy: {
      topOpportunities: [],
      recommendedAngle: 'Unable to determine',
      communitySignals: [],
    },
    difficultyAssessment: {
      dominantPlayers: [],
      roomForNewEntrant: false,
      reasoning: 'Analysis could not be completed',
    },
  };
}
