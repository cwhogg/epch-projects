import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { advisorRegistry } from '@/lib/advisors/registry';
import { buildContentContext } from '@/lib/content-context';
import { getAllFoundationDocs, getIdeaFromDb } from '@/lib/db';
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';
import {
  getPaintedDoorSite,
} from '@/lib/painted-door-db';
import type { BuildMode } from '@/types';

export const maxDuration = 300;

export async function assembleSystemPrompt(
  ideaId: string,
  mode: BuildMode,
): Promise<string> {
  // 1. Julian's advisor prompt
  const advisorPrompt = getAdvisorSystemPrompt('julian-shapiro');

  // 2. Landing Page Assembly framework
  const framework = getFrameworkPrompt('landing-page-assembly');

  // 3. Foundation documents
  const foundationDocsRecord = await getAllFoundationDocs(ideaId);
  const nonNullDocs = Object.values(foundationDocsRecord).filter(
    (d): d is NonNullable<typeof d> => d !== null && d !== undefined
  );

  let foundationSection: string;
  if (nonNullDocs.length === 0) {
    foundationSection = 'No foundation documents are available yet. Note which documents would be helpful and proceed with the information you have.';
  } else {
    foundationSection = nonNullDocs
      .map((doc) => `### ${doc.type} (updated ${doc.editedAt || doc.generatedAt})\n${doc.content}`)
      .join('\n\n');
  }

  // 4. Idea analysis / content context
  const ctx = await buildContentContext(ideaId);
  const idea = await getIdeaFromDb(ideaId);
  let ideaSection = '';
  if (idea) {
    ideaSection = `### Product\n- **Name:** ${idea.name}\n- **Description:** ${idea.description}\n- **Target User:** ${idea.targetUser}\n- **Problem Solved:** ${idea.problemSolved}`;
    if (idea.url) ideaSection += `\n- **URL:** ${idea.url}`;
  }
  if (ctx) {
    ideaSection += `\n\n### Keywords\n${ctx.topKeywords.map((k) => `- ${k.keyword} (${k.intentType})`).join('\n')}`;
    ideaSection += `\n\n### Competitors\n${ctx.competitors}`;
  }

  // 5. Current site state (for regeneration)
  const existingSite = await getPaintedDoorSite(ideaId);
  let siteSection = '';
  if (existingSite?.status === 'live') {
    siteSection = `\n\n## Existing Site\nThis is a REBUILD. An existing site is live at ${existingSite.siteUrl}.\nReview what exists and propose targeted changes vs. a full rebuild where appropriate.`;
  }

  // 6. Mode instruction
  const modeInstruction = mode === 'interactive'
    ? `## Mode: Interactive ("Build with me")
You are in interactive mode. At the end of steps 1 (Extract Ingredients), 3 (Write Hero), 4 (Assemble Page), and 6 (Advisor Review), you MUST pause and present your work for user feedback before continuing. At each checkpoint, summarize what you've done and ask for the user's input.

When you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
    : `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Run through all 8 steps continuously without stopping. You should narrate your progress as you go — the user is watching the chat in real time. Do not wait for user input between steps.`;

  // 7. Advisor roster
  const advisorsWithExpertise = advisorRegistry.filter((a) => a.evaluationExpertise);
  const advisorRoster = advisorsWithExpertise
    .map((a) => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `${advisorPrompt}

${framework ? `## FRAMEWORK\n${framework}\n` : ''}
---

## Your Task

You are building a landing page for a product. Follow your Landing Page Assembly framework through all 8 steps. Use the foundation documents below as your source of truth — never contradict what's already decided. Fill gaps where docs don't specify exact values.

${modeInstruction}

## Foundation Documents
${foundationSection}

## Product & Analysis
${ideaSection}
${siteSection}

## Available Advisors for Consultation
Use the consult_advisor tool when a decision falls outside your core expertise.
${advisorRoster}

## Build Tools
You have access to all website build tools (design_brand, assemble_site_files, create_repo, push_files, etc.) plus consult_advisor. Use them when you reach the appropriate step.

## Output
Respond conversationally — this is a chat, not a report. When you use a tool, explain what you're doing and why. When consulting an advisor, share their key insights with the user.`;
}

// POST handler will be added in Task 6
