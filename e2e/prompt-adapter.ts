import { readFileSync } from 'fs';
import { join } from 'path';
import type { EvalScenario, PromptResult } from './types';

export function loadFixture(scenario: EvalScenario, key: string): unknown {
  const rel = scenario.fixtures[key];
  if (!rel) throw new Error(`Fixture "${key}" not found in scenario "${scenario.name}"`);
  const full = join(process.cwd(), 'e2e', rel);
  const raw = readFileSync(full, 'utf-8');
  return rel.endsWith('.txt') ? raw : JSON.parse(raw);
}

export async function buildPromptForScenario(scenario: EvalScenario): Promise<PromptResult> {
  switch (scenario.surface) {
    case 'example':
      return { systemPrompt: 'You are a helpful assistant.' };
    case 'advisor-chat': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const advisorId = scenario.config.advisor as string;
      const docType = scenario.config.docType as string;
      const currentContent = (scenario.config.currentContent as string) || '';

      const advisorPrompt = getAdvisorSystemPrompt(advisorId);
      let contextSection = '';

      if (scenario.fixtures.analysis) {
        const ctx = loadFixture(scenario, 'analysis') as Record<string, unknown>;
        contextSection += '\nANALYSIS RESULTS:\n';
        contextSection += `Product: ${ctx.ideaName}\nDescription: ${ctx.ideaDescription}\n`;
        contextSection += `Target User: ${ctx.targetUser}\nProblem: ${ctx.problemSolved}\n`;
        if (ctx.competitors) contextSection += `\nCompetitors:\n${ctx.competitors}\n`;
        if (Array.isArray(ctx.topKeywords) && ctx.topKeywords.length > 0) {
          const kws = (ctx.topKeywords as Array<{ keyword: string; intentType: string; estimatedCompetitiveness: string }>).slice(0, 10);
          contextSection += `\nTop Keywords:\n${kws.map(k => `- ${k.keyword} (${k.intentType}, competition: ${k.estimatedCompetitiveness})`).join('\n')}\n`;
        }
      }

      if (scenario.fixtures.foundationDocs) {
        const docs = loadFixture(scenario, 'foundationDocs') as Record<string, { type: string; content: string; lastUpdated: string }>;
        contextSection += '\nRELATED FOUNDATION DOCUMENTS:\n';
        for (const doc of Object.values(docs)) {
          contextSection += `\n## ${doc.type.replace(/-/g, ' ').toUpperCase()} (last updated: ${doc.lastUpdated})\n${doc.content}\n`;
        }
      }

      const systemPrompt = `${advisorPrompt}\n\n---\n\nYou are helping the user refine their ${docType} document through conversation.\n${contextSection}\nCURRENT DOCUMENT (${docType.replace(/-/g, ' ')}):\n${currentContent}\n\nRULES:\n- When the user asks you to change the document, make ONLY the requested changes.\n- After making changes, include the full updated document between <updated_document> tags.\n- If the user asks a question without requesting changes, respond conversationally without tags.\n- Keep your conversational response brief.`;

      return { systemPrompt };
    }
    case 'research-scoring': {
      const { createPrompt } = await import('@/lib/research-agent-prompts');
      const idea = loadFixture(scenario, 'idea') as import('@/types').ProductIdea;
      const seoContext = scenario.fixtures.seoContext ? (loadFixture(scenario, 'seoContext') as string) : '';
      return { userMessage: createPrompt(idea, 'scoring', seoContext) };
    }
    case 'content-calendar': {
      const { buildCalendarPrompt } = await import('@/lib/content-prompts');
      const ctx = loadFixture(scenario, 'contentContext') as import('@/lib/content-prompts').ContentContext;
      return { userMessage: buildCalendarPrompt(ctx) };
    }
    default:
      throw new Error(`Unknown surface: "${scenario.surface}" in scenario "${scenario.name}"`);
  }
}
