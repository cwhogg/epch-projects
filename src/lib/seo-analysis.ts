import Anthropic from '@anthropic-ai/sdk';
import { ProductIdea } from '@/types';
import { getOpenAI, isOpenAIConfigured } from './openai';
import { SERPResult, batchSearchGoogle, isSerpConfigured } from './serp-search';

// ---------- Types ----------

export interface SEOKeyword {
  keyword: string;
  intentType: 'Informational' | 'Navigational' | 'Commercial' | 'Transactional';
  estimatedVolume: 'High' | 'Medium' | 'Low' | 'Unknown';
  estimatedCompetitiveness: 'High' | 'Medium' | 'Low' | 'Unknown';
  contentGapHypothesis: string;
  relevanceToMillionARR: 'High' | 'Medium' | 'Low';
  rationale: string;
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
      "rationale": "string - why this keyword matters for a $1M ARR niche business"
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

  const prompt = `You are a SENIOR SEO STRATEGIST with 15 years of experience in niche B2B SaaS markets.
Your specialty: finding underserved, long-tail keyword opportunities for businesses targeting $1M ARR.

You approach SEO methodically:
- Start with problem-aware queries (what do people search when they have this problem?)
- Map the full keyword funnel: awareness → consideration → decision
- Identify content gaps where existing players have thin or no coverage
- Think about community signals (Reddit, forums, Quora) as keyword sources
- Focus on keywords a small team could actually rank for

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 3000)}` : ''}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}

Generate 15-20 niche, long-tail keywords this product should target. Focus on UNDERSERVED opportunities, not obvious high-competition terms.

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

  const prompt = `You are a SCRAPPY FOUNDER who bootstrapped a B2B SaaS to $1M ARR.
You know exactly what people search when they're desperate for a solution.

Your approach to keyword research:
- Start with pain-point queries ("how to fix...", "why does... keep failing", "[competitor] sucks")
- Think about what people type at 2am when they're frustrated
- Focus on "alternatives to..." and "best [X] for [specific use case]" queries
- Consider Reddit/forum language - real people don't use marketing speak
- Find the keywords big companies ignore because they're "too niche"

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${idea.documentContent ? `\nContext:\n${idea.documentContent.substring(0, 3000)}` : ''}
${additionalContext ? `\nAdditional Context:\n${additionalContext}` : ''}

Generate 15-20 niche, long-tail keywords. Focus on pain-point searches that indicate HIGH buying intent from people who would pay for this product.

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
    const hasContentGap = detectContentGap(serp);
    const serpInsight = generateSerpInsight(serp, hasContentGap);

    return {
      keyword: serp.keyword,
      serpData: serp,
      competitorDomains,
      hasContentGap,
      serpInsight,
    };
  });

  return { serpResults, validated };
}

function detectContentGap(serp: SERPResult): boolean {
  // Content gap indicators:
  // 1. Few organic results
  if (serp.organicResults.length < 5) return true;
  // 2. Results are mostly generic/big sites, not specialized
  const genericDomains = ['wikipedia.org', 'youtube.com', 'reddit.com', 'quora.com', 'medium.com'];
  const genericCount = serp.organicResults.filter((r) =>
    genericDomains.some((d) => r.domain.includes(d))
  ).length;
  if (genericCount >= 3) return true;
  // 3. Snippets don't closely match the query
  const lowRelevanceSnippets = serp.organicResults.filter(
    (r) => r.snippet.length < 50
  ).length;
  if (lowRelevanceSnippets >= 4) return true;
  return false;
}

function generateSerpInsight(serp: SERPResult, hasContentGap: boolean): string {
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
## LLM Cross-Reference
- Keywords agreed on by both LLMs: ${comparison.agreedKeywords.length}
- Claude-unique keywords: ${comparison.claudeUniqueKeywords.length}
- OpenAI-unique keywords: ${comparison.openaiUniqueKeywords.length}
- Agreed keywords (highest confidence): ${comparison.agreedKeywords.slice(0, 10).join(', ')}
- Claude-unique: ${comparison.claudeUniqueKeywords.slice(0, 5).join(', ')}
- OpenAI-unique: ${comparison.openaiUniqueKeywords.slice(0, 5).join(', ')}
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

  const prompt = `You are synthesizing SEO research from multiple sources into a final report.

Product: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}

## Claude SEO Analysis (senior strategist perspective)
Top keywords: ${claudeResult.keywords.slice(0, 10).map((k) => `${k.keyword} (${k.intentType}, relevance: ${k.relevanceToMillionARR})`).join(', ')}
Content strategy: ${claudeResult.contentStrategy.recommendedAngle}
Room for new entrant: ${claudeResult.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'} - ${claudeResult.difficultyAssessment.reasoning}
${openaiSection}${comparisonSection}${serpSection}

Data sources used: ${dataSources.join(', ')}

Write a concise synthesis narrative (3-5 paragraphs) that:
1. Identifies the highest-confidence keyword opportunities (especially agreed-upon ones)
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
    await onProgress('seo-compare', `${comparison.agreedKeywords.length} keywords agreed upon`);
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
  parts.push(`| Keyword | Intent | Est. Volume | Est. Competition | ARR Relevance | Gap Hypothesis |`);
  parts.push(`|---------|--------|-------------|------------------|---------------|----------------|`);
  for (const kw of synthesis.topKeywords.slice(0, 15)) {
    parts.push(`| ${kw.keyword} | ${kw.intentType} | ${kw.estimatedVolume} | ${kw.estimatedCompetitiveness} | ${kw.relevanceToMillionARR} | ${kw.contentGapHypothesis} |`);
  }
  parts.push('');

  // SERP validation
  if (synthesis.serpValidated.length > 0) {
    parts.push(`### SERP Validation\n`);
    for (const v of synthesis.serpValidated) {
      parts.push(`**"${v.keyword}"** ${v.hasContentGap ? '(Content Gap!)' : '(Competitive)'}`);
      parts.push(`${v.serpInsight}`);
      if (v.serpData.peopleAlsoAsk.length > 0) {
        parts.push(`People Also Ask: ${v.serpData.peopleAlsoAsk.slice(0, 3).map((q) => `"${q.question}"`).join(', ')}`);
      }
      parts.push('');
    }
  }

  // Comparison
  if (synthesis.comparison) {
    parts.push(`### LLM Cross-Reference\n`);
    parts.push(`- **Both LLMs agreed on:** ${synthesis.comparison.agreedKeywords.length} keywords`);
    parts.push(`- **Claude-unique:** ${synthesis.comparison.claudeUniqueKeywords.length} keywords`);
    parts.push(`- **OpenAI-unique:** ${synthesis.comparison.openaiUniqueKeywords.length} keywords`);
    if (synthesis.comparison.agreedKeywords.length > 0) {
      parts.push(`\nAgreed keywords (highest confidence): ${synthesis.comparison.agreedKeywords.join(', ')}`);
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
  const keywords = Array.isArray(parsed.keywords)
    ? parsed.keywords.map((k: Record<string, unknown>) => ({
        keyword: String(k.keyword || ''),
        intentType: validateEnum(k.intentType, ['Informational', 'Navigational', 'Commercial', 'Transactional'], 'Informational'),
        estimatedVolume: validateEnum(k.estimatedVolume, ['High', 'Medium', 'Low', 'Unknown'], 'Unknown'),
        estimatedCompetitiveness: validateEnum(k.estimatedCompetitiveness, ['High', 'Medium', 'Low', 'Unknown'], 'Unknown'),
        contentGapHypothesis: String(k.contentGapHypothesis || ''),
        relevanceToMillionARR: validateEnum(k.relevanceToMillionARR, ['High', 'Medium', 'Low'], 'Medium'),
        rationale: String(k.rationale || ''),
      }))
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
