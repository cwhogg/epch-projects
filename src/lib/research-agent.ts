import { ProductIdea, Analysis } from '@/types';
import { saveProgress, getProgress, saveAnalysisToDb, saveAnalysisContent, updateIdeaStatus, AnalysisProgress } from './db';
import { runFullSEOPipeline, SEOPipelineResult } from './seo-analysis';
import { isOpenAIConfigured } from './openai';
import { isSerpConfigured } from './serp-search';
import { runAgentLifecycle } from './agent-runtime';
import { createResearchTools } from './agent-tools/research';
import { createPlanTools, createScratchpadTools } from './agent-tools/common';
import { emitEvent } from './agent-events';
import { getAnthropic } from './anthropic';
import { CLAUDE_MODEL } from './config';
import { createPrompt, RESEARCH_SYSTEM_PROMPT } from './research-agent-prompts';
import { parseScores, parseRecommendation, parseConfidence, parseRisks, parseSummary } from './research-agent-parsers';

const ANALYSIS_STEPS = [
  { name: 'Competitive Analysis', key: 'competitors' },
  { name: 'SEO: Claude Analysis', key: 'seo-claude' },
  { name: 'SEO: OpenAI Analysis', key: 'seo-openai' },
  { name: 'SEO: Cross-Reference', key: 'seo-compare' },
  { name: 'SEO: SERP Validation', key: 'seo-serp' },
  { name: 'SEO: Synthesis', key: 'seo-synthesis' },
  { name: 'Willingness to Pay Analysis', key: 'wtp' },
  { name: 'Scoring & Synthesis', key: 'scoring' },
];

// Re-export parsers for backward compatibility
export { parseScores, parseRecommendation, parseConfidence, parseRisks, parseSummary } from './research-agent-parsers';

export async function runResearchAgent(idea: ProductIdea, additionalContext?: string): Promise<Analysis> {
  const progress: AnalysisProgress = {
    ideaId: idea.id,
    status: 'running',
    currentStep: 'Starting analysis...',
    steps: ANALYSIS_STEPS.map((s) => ({ name: s.name, status: 'pending' as const })),
  };

  await updateIdeaStatus(idea.id, 'analyzing');
  await saveProgress(idea.id, progress);

  const content: { competitors?: string; keywords?: string; wtp?: string; scoring?: string } = {};

  // Helper to find step index by key
  const stepIndex = (key: string) => ANALYSIS_STEPS.findIndex((s) => s.key === key);

  // Helper to update step status
  const updateStep = async (key: string, status: 'pending' | 'running' | 'complete' | 'error', detail?: string) => {
    const idx = stepIndex(key);
    if (idx >= 0) {
      progress.steps[idx].status = status;
      if (detail) progress.steps[idx].detail = detail;
      progress.currentStep = ANALYSIS_STEPS[idx].name;
      await saveProgress(idea.id, progress);
    }
  };

  try {
    // --- Step 1: Competitive Analysis ---
    await updateStep('competitors', 'running');
    const competitorResponse = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'competitors', additionalContext) }],
    });
    content.competitors = competitorResponse.content[0].type === 'text' ? competitorResponse.content[0].text : '';
    await updateStep('competitors', 'complete', 'Done');

    // --- Steps 2-6: SEO Pipeline (runs Claude + OpenAI in parallel internally) ---
    // Mark OpenAI step as skipped if no key
    if (!isOpenAIConfigured()) {
      await updateStep('seo-openai', 'complete', 'Skipped (no API key)');
    }
    // Mark SERP step as skipped if no key
    if (!isSerpConfigured()) {
      await updateStep('seo-serp', 'complete', 'Skipped (no API key)');
    }

    let seoResult: SEOPipelineResult;
    try {
      seoResult = await runFullSEOPipeline(idea, additionalContext, async (stepKey, detail) => {
        await updateStep(stepKey, 'running', detail);
      });

      // Mark all SEO steps complete
      for (const key of ['seo-claude', 'seo-openai', 'seo-compare', 'seo-serp', 'seo-synthesis']) {
        const idx = stepIndex(key);
        if (idx >= 0 && progress.steps[idx].status === 'running') {
          await updateStep(key, 'complete', progress.steps[idx].detail || 'Done');
        }
      }
    } catch (seoError) {
      console.error('SEO pipeline failed, falling back:', seoError);
      // Mark remaining SEO steps as errored
      for (const key of ['seo-claude', 'seo-openai', 'seo-compare', 'seo-serp', 'seo-synthesis']) {
        const idx = stepIndex(key);
        if (idx >= 0 && progress.steps[idx].status !== 'complete') {
          await updateStep(key, 'error', 'Failed');
        }
      }
      // Fallback: run old-style keyword analysis
      const fallbackResponse = await getAnthropic().messages.create({
        model: CLAUDE_MODEL,
        max_tokens: 3000,
        messages: [{ role: 'user', content: createPrompt(idea, 'keywords', additionalContext) }],
      });
      content.keywords = fallbackResponse.content[0].type === 'text' ? fallbackResponse.content[0].text : '';
      seoResult = undefined as unknown as SEOPipelineResult;
    }

    // Use SEO pipeline markdown if available, otherwise fallback
    if (seoResult) {
      content.keywords = seoResult.markdownReport;
    }

    // --- Step 7: Willingness to Pay ---
    await updateStep('wtp', 'running');
    const wtpResponse = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'wtp', additionalContext) }],
    });
    content.wtp = wtpResponse.content[0].type === 'text' ? wtpResponse.content[0].text : '';
    await updateStep('wtp', 'complete', 'Done');

    // --- Step 8: Scoring & Synthesis (enriched with SEO data) ---
    await updateStep('scoring', 'running');
    const seoContext = seoResult
      ? `\n\nSEO PIPELINE DATA (use this to inform your SEO Opportunity score):\n${buildSEOScoringContext(seoResult)}`
      : '';
    const scoringResponse = await getAnthropic().messages.create({
      model: CLAUDE_MODEL,
      max_tokens: 3000,
      messages: [{ role: 'user', content: createPrompt(idea, 'scoring', (additionalContext || '') + seoContext) }],
    });
    content.scoring = scoringResponse.content[0].type === 'text' ? scoringResponse.content[0].text : '';
    await updateStep('scoring', 'complete', 'Done');

    // Combine into analysis document
    const fullContent = `# ${idea.name}
${idea.description ? `\n*${idea.description}*\n` : ''}
${additionalContext ? `\n> **Analysis Focus:** ${additionalContext}\n` : ''}
---

## Competitive Landscape
${content.competitors || 'Not available'}

## SEO & Keywords
${content.keywords || 'Not available'}

## Willingness to Pay
${content.wtp || 'Not available'}

## Scoring & Recommendation
${content.scoring || 'Not available'}
`;

    // Parse the scoring section for structured data
    const scoringContent = content.scoring || '';
    const scores = parseScores(scoringContent);
    const recommendation = parseRecommendation(scoringContent);
    const confidence = parseConfidence(scoringContent);
    const risks = parseRisks(scoringContent);
    const summary = parseSummary(scoringContent);

    // Create analysis object
    const analysis: Analysis = {
      id: idea.id,
      ideaId: idea.id,
      ideaName: idea.name,
      scores,
      confidence,
      recommendation,
      summary,
      risks,
      completedAt: new Date().toISOString(),
      hasCompetitorAnalysis: !!content.competitors,
      hasKeywordAnalysis: !!content.keywords,
    };

    // Save to database
    await saveAnalysisToDb(analysis);
    await saveAnalysisContent(idea.id, {
      main: fullContent,
      competitors: content.competitors,
      keywords: content.keywords,
      seoData: seoResult ? JSON.stringify({
        synthesis: seoResult.synthesis,
        dataSources: seoResult.synthesis.dataSources,
      }) : undefined,
    });
    await updateIdeaStatus(idea.id, 'complete');

    // Generate validation canvas assumptions (best-effort, don't block analysis completion)
    const { tryGenerateCanvas } = await import('./validation-canvas');
    await tryGenerateCanvas(idea.id, 'research-agent');

    // Update progress
    progress.status = 'complete';
    progress.currentStep = 'Analysis complete!';
    progress.result = analysis;
    await saveProgress(idea.id, progress);

    return analysis;
  } catch (error) {
    progress.status = 'error';
    progress.error = error instanceof Error ? error.message : 'Unknown error';
    progress.currentStep = 'Analysis failed';
    await saveProgress(idea.id, progress);
    await updateIdeaStatus(idea.id, 'pending');
    throw error;
  }
}

// ---------------------------------------------------------------------------
// V2: Agentic research with tool use
// ---------------------------------------------------------------------------

async function runResearchAgentV2(idea: ProductIdea, additionalContext?: string): Promise<Analysis> {
  await updateIdeaStatus(idea.id, 'analyzing');

  // Map tool names to progress step indices
  const toolStepMap: Record<string, number> = {
    create_plan: 0,
    get_idea_details: 0,
    get_expertise_profile: 0,
    search_serp: 1,
    fetch_page: 1,
    save_competitor_analysis: 1,
    run_seo_pipeline: 2,
    save_wtp_analysis: 3,
    save_final_analysis: 4,
  };

  // Progress tracking — initialized inside makeConfig so resume state is available
  let progress: AnalysisProgress;

  try {
    await runAgentLifecycle(
      'research',
      idea.id,
      (runId, isResume, pausedState) => {
        if (pausedState) {
          console.log(`[research-v2] Resuming paused run ${runId} (resume #${pausedState.resumeCount + 1})`);
        }

        // Load existing progress on resume, or create fresh
        // Note: getProgress is async but we initialize synchronously here.
        // The async load happens via onProgress callbacks during the run.
        if (isResume) {
          progress = {
            ideaId: idea.id,
            status: 'running',
            currentStep: 'Resuming analysis...',
            steps: [
              { name: 'Planning', status: 'complete' as const },
              { name: 'Competitive Analysis', status: 'pending' as const },
              { name: 'SEO Pipeline', status: 'pending' as const },
              { name: 'Willingness to Pay', status: 'pending' as const },
              { name: 'Scoring & Synthesis', status: 'pending' as const },
              { name: 'Saving Results', status: 'pending' as const },
            ],
          };
        } else {
          progress = {
            ideaId: idea.id,
            status: 'running',
            currentStep: 'Starting agentic analysis...',
            steps: [
              { name: 'Planning', status: 'pending' as const },
              { name: 'Competitive Analysis', status: 'pending' as const },
              { name: 'SEO Pipeline', status: 'pending' as const },
              { name: 'Willingness to Pay', status: 'pending' as const },
              { name: 'Scoring & Synthesis', status: 'pending' as const },
              { name: 'Saving Results', status: 'pending' as const },
            ],
          };
        }
        // Fire-and-forget initial progress save
        saveProgress(idea.id, progress);

        const tools = [
          ...createPlanTools(runId),
          ...createScratchpadTools(),
          ...createResearchTools(idea, additionalContext),
        ];

        return {
          agentId: 'research',
          runId,
          model: CLAUDE_MODEL,
          maxTokens: 4096,
          maxTurns: 25,
          tools,
          systemPrompt: RESEARCH_SYSTEM_PROMPT,
          onProgress: async (step, detail) => {
            console.log(`[research-v2] ${step}: ${detail ?? ''}`);

            if (step === 'tool_call' && detail) {
              const toolNames = detail.split(', ');
              for (const name of toolNames) {
                const stepIdx = toolStepMap[name];
                if (stepIdx !== undefined) {
                  if (progress.steps[stepIdx].status === 'pending') {
                    progress.steps[stepIdx].status = 'running';
                    for (let i = 0; i < stepIdx; i++) {
                      if (progress.steps[i].status === 'running') {
                        progress.steps[i].status = 'complete';
                      }
                    }
                  }
                  progress.currentStep = progress.steps[stepIdx].name;
                }
              }
              await saveProgress(idea.id, progress);
            } else if (step === 'complete') {
              for (const s of progress.steps) {
                if (s.status !== 'error') s.status = 'complete';
              }
              progress.status = 'complete';
              progress.currentStep = 'Analysis complete!';
              await saveProgress(idea.id, progress);
            } else if (step === 'error') {
              progress.status = 'error';
              progress.error = detail;
              progress.currentStep = 'Analysis failed';
              await saveProgress(idea.id, progress);
            }
          },
        };
      },
      () => `Analyze this product idea:

Name: ${idea.name}
${idea.description ? `Description: ${idea.description}` : ''}
${idea.targetUser ? `Target User: ${idea.targetUser}` : ''}
${idea.problemSolved ? `Problem Solved: ${idea.problemSolved}` : ''}
${idea.url ? `URL: ${idea.url}` : ''}
${additionalContext ? `\nAdditional Context: ${additionalContext}` : ''}

Conduct a thorough market research analysis. Start by creating a plan, then work through competitors, SEO, willingness to pay, and final scoring. Save your findings at each step.`,
    );
  } catch (err) {
    if (err instanceof Error && err.message === 'AGENT_PAUSED') {
      throw err;
    }
    await updateIdeaStatus(idea.id, 'pending');
    throw err;
  }

  // Emit event for inter-agent communication
  await emitEvent({
    type: 'analysis_complete',
    agentId: 'research',
    ideaId: idea.id,
    timestamp: new Date().toISOString(),
    payload: { ideaName: idea.name },
  });

  // Fetch the saved analysis (save_final_analysis tool persisted it)
  const { getAnalysisFromDb } = await import('./db');
  const analysis = await getAnalysisFromDb(idea.id);
  if (!analysis) {
    throw new Error('Analysis not found after agent completed');
  }

  return analysis;
}

/**
 * Entry point that switches between v1 (procedural) and v2 (agentic).
 */
export async function runResearchAgentAuto(
  idea: ProductIdea,
  additionalContext?: string,
): Promise<Analysis> {
  if (process.env.AGENT_V2 === 'true') {
    return runResearchAgentV2(idea, additionalContext);
  }
  return runResearchAgent(idea, additionalContext);
}

function buildSEOScoringContext(seoResult: SEOPipelineResult): string {
  const parts: string[] = [];
  const syn = seoResult.synthesis;
  const dq = seoResult.dataQuality;

  // Data quality warnings — tell the scorer what data is reliable
  if (!dq.claudeSucceeded && !dq.openaiSucceeded) {
    parts.push(`⚠ DATA QUALITY WARNING: Both LLM keyword analyses failed. Base your SEO score primarily on SERP validation results below.`);
  } else if (!dq.claudeSucceeded) {
    parts.push(`⚠ DATA QUALITY WARNING: Claude SEO analysis failed (0 keywords returned — parse error). The "Room for new entrant" and "Dominant players" fields below are UNRELIABLE defaults. Base your SEO score on the OpenAI keywords and SERP validation results instead.`);
  } else if (!dq.openaiSucceeded) {
    parts.push(`Note: OpenAI SEO analysis was not available. Using Claude keywords and SERP validation only.`);
  }

  parts.push(`Data sources: ${syn.dataSources.join(', ')}`);
  parts.push(`Total keywords identified: ${syn.topKeywords.length} (Claude: ${dq.claudeKeywordCount}, OpenAI: ${dq.openaiKeywordCount})`);

  if (syn.comparison) {
    parts.push(`Keyword overlap: ${syn.comparison.agreedKeywords.length} agreed, ${syn.comparison.claudeUniqueKeywords.length} Claude-unique, ${syn.comparison.openaiUniqueKeywords.length} OpenAI-unique`);
  }

  if (syn.serpValidated.length > 0) {
    const gaps = syn.serpValidated.filter((v) => v.hasContentGap).length;
    parts.push(`SERP-validated keywords: ${syn.serpValidated.length}`);
    parts.push(`Content gaps found: ${gaps} of ${syn.serpValidated.length} (${gaps === syn.serpValidated.length ? '100% gap rate — strong SEO signal' : `${Math.round(gaps / syn.serpValidated.length * 100)}% gap rate`})`);
    for (const v of syn.serpValidated) {
      const flags = [
        ...(v.greenFlags?.map((f) => `✓ ${f}`) ?? []),
        ...(v.redFlags?.map((f) => `✗ ${f}`) ?? []),
      ];
      parts.push(`  - "${v.keyword}": ${v.hasContentGap ? 'GAP' : 'competitive'}${flags.length > 0 ? ` [${flags.join(', ')}]` : ''}`);
    }
  }

  // Only include these if Claude analysis actually succeeded (otherwise they're unreliable defaults)
  if (dq.claudeSucceeded) {
    parts.push(`Room for new entrant: ${syn.difficultyAssessment.roomForNewEntrant ? 'Yes' : 'No'}`);
    if (syn.difficultyAssessment.dominantPlayers.length > 0) {
      parts.push(`Dominant players: ${syn.difficultyAssessment.dominantPlayers.join(', ')}`);
    }
  }

  return parts.join('\n');
}
