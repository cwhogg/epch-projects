import { readFileSync } from 'fs';
import { join } from 'path';
import type { EvalScenario, PromptResult } from './types';

export function loadFixture(scenario: EvalScenario, key: string): unknown {
  const rel = scenario.fixtures[key];
  if (!rel) throw new Error(`Fixture "${key}" not found in scenario "${scenario.name}"`);
  const full = join(process.cwd(), 'e2e', 'fixtures', rel);
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
    case 'framework-assembly': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const { getFrameworkPrompt } = await import('@/lib/frameworks/framework-loader');
      const frameworkId = scenario.config.framework as string;
      const advisorId = scenario.config.advisor as string;
      const frameworkPrompt = getFrameworkPrompt(frameworkId);
      if (!frameworkPrompt) throw new Error(`Framework not found: ${frameworkId}`);
      return { systemPrompt: `${getAdvisorSystemPrompt(advisorId)}\n\n---\n\n${frameworkPrompt}` };
    }
    case 'content-calendar': {
      const { buildCalendarPrompt } = await import('@/lib/content-prompts');
      const ctx = loadFixture(scenario, 'contentContext') as import('@/lib/content-prompts').ContentContext;
      return { userMessage: buildCalendarPrompt(ctx) };
    }
    case 'website-chat': {
      const { getAdvisorSystemPrompt } = await import('@/lib/advisors/prompt-loader');
      const { getFrameworkPrompt } = await import('@/lib/frameworks/framework-loader');
      const { advisorRegistry } = await import('@/lib/advisors/registry');

      const mode = (scenario.config.mode as string) || 'autonomous';

      // 1. Julian Shapiro advisor prompt (website builder default)
      const advisorPrompt = getAdvisorSystemPrompt('julian-shapiro');

      // 2. Landing Page Assembly framework
      const framework = getFrameworkPrompt('landing-page-assembly');

      // 3. Foundation documents from fixture
      let foundationSection = 'No foundation documents are available yet.';
      if (scenario.fixtures.foundationDocs) {
        const docs = loadFixture(scenario, 'foundationDocs') as Record<string, { type: string; content: string; lastUpdated: string }>;
        foundationSection = Object.values(docs)
          .map(doc => `### ${doc.type} (updated ${doc.lastUpdated})\n${doc.content}`)
          .join('\n\n');
      }

      // 4. Idea/analysis section from fixture
      let ideaSection = '';
      if (scenario.fixtures.analysis) {
        const ctx = loadFixture(scenario, 'analysis') as Record<string, unknown>;
        ideaSection = `### Product\n- **Name:** ${ctx.ideaName}\n- **Description:** ${ctx.ideaDescription}\n- **Target User:** ${ctx.targetUser}\n- **Problem Solved:** ${ctx.problemSolved}`;
        if (Array.isArray(ctx.topKeywords)) {
          const kws = (ctx.topKeywords as Array<{ keyword: string; intentType: string }>).slice(0, 10);
          ideaSection += `\n\n### Keywords\n${kws.map(k => `- ${k.keyword} (${k.intentType})`).join('\n')}`;
        }
        if (ctx.competitors) {
          ideaSection += `\n\n### Competitors\n${ctx.competitors}`;
        }
      }

      // 5. Mode instruction — mirrors assembleSystemPrompt in painted-door chat route
      const modeInstruction = mode === 'interactive'
        ? `## Mode: Interactive ("Build with me")\nYou are in interactive mode. Follow the 6-stage process. At every copy-producing stage (0, 1, 2a-2e, 3), you MUST pause and present your work for user feedback before continuing. You MUST call consult_advisor for the required advisors at each stage before presenting your synthesis.\n\nWhen you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
        : `## Mode: Autonomous ("You've got this")\nYou are in autonomous mode. Complete ONLY the current stage. You will be automatically advanced to the next stage — do not attempt to work ahead. You MUST call consult_advisor for the required advisors at this stage before finishing. Narrate your progress as you go.`;

      // 6. Advisor roster
      const advisorsWithExpertise = advisorRegistry.filter(a => a.evaluationExpertise);
      const advisorRoster = advisorsWithExpertise
        .map(a => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
        .join('\n');

      // In eval context, tools are not available. Adapt instructions so the model
      // produces textual output (describing what it would do) and the judge does
      // not penalise for missing tool calls.
      const evalPreamble = `## Eval Context\nTools are NOT available in this evaluation. Instead of calling tools (consult_advisor, lock_section_copy, assemble_site_files, etc.), describe the action you would take and produce the output inline. Do not reference tool calls as if you can execute them.\n\n`;

      return {
        systemPrompt: `${advisorPrompt}\n\n${framework ? `## FRAMEWORK\n${framework}\n` : ''}---\n\n${evalPreamble}## Your Task\n\nYou are building a landing page for a product. Follow the Landing Page Assembly framework through all 6 stages. Use the foundation documents below as your source of truth. Fill gaps where docs don't specify exact values.\n\n${modeInstruction}\n\n## Content Quality Rules\n- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist and should never be referenced.\n- Never use em dashes (-- or unicode em dash). Use periods, commas, colons, or semicolons instead.\n- Keep each message concise. The user is reading a chat, not a report.\n- Before finalizing any copy, check it against the AI slop blocklist in the framework. If any pattern appears, rewrite that sentence.\n\n## Foundation Documents\n${foundationSection}\n\n## Product & Analysis\n${ideaSection}\n\n## Available Advisors for Consultation\n${advisorRoster}\n\n## Output\nRespond conversationally. Describe your reasoning and present copy directly.`,
      };
    }
    default:
      throw new Error(`Unknown surface: "${scenario.surface}" in scenario "${scenario.name}"`);
  }
}
