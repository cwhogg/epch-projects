import { getAdvisorSystemPrompt } from '@/lib/advisors/prompt-loader';
import { advisorRegistry } from '@/lib/advisors/registry';
import { createWebsiteTools } from '@/lib/agent-tools/website';
import { createConsultAdvisorTool } from '@/lib/agent-tools/website-chat';
import Anthropic from '@anthropic-ai/sdk';
import { getAnthropic } from '@/lib/anthropic';
import { CLAUDE_MODEL } from '@/lib/config';
import { buildContentContext } from '@/lib/content-context';
import { getAllFoundationDocs, getIdeaFromDb } from '@/lib/db';
import { getFrameworkPrompt } from '@/lib/frameworks/framework-loader';
import {
  getBuildSession,
  getConversationHistory,
  getPaintedDoorSite,
  saveBuildSession,
  saveConversationHistory,
} from '@/lib/painted-door-db';
import type { BuildMode, BuildSession, ChatMessage, ChatRequestBody, StreamEndSignal, ToolDefinition } from '@/types';
import { WEBSITE_BUILD_STEPS } from '@/types';

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ideaId } = await params;

  // Parse request body
  let body: ChatRequestBody;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body.type) {
    return Response.json({ error: 'Missing type field' }, { status: 400 });
  }

  // Validate idea exists
  const idea = await getIdeaFromDb(ideaId);
  if (!idea) {
    return Response.json({ error: 'Idea not found' }, { status: 404 });
  }

  // Handle mode selection — initialize session
  if (body.type === 'mode_select') {
    if (!body.mode) {
      return Response.json({ error: 'Missing mode for mode_select' }, { status: 400 });
    }

    const session: BuildSession = {
      ideaId,
      mode: body.mode,
      currentStep: 0,
      steps: WEBSITE_BUILD_STEPS.map((s) => ({
        name: s.name,
        status: 'pending' as const,
      })),
      artifacts: {},
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await saveBuildSession(ideaId, session);
    await saveConversationHistory(ideaId, []);
  }

  // Load or verify session exists
  const session = await getBuildSession(ideaId);
  if (!session) {
    return Response.json({ error: 'No build session found. Start with mode_select.' }, { status: 400 });
  }

  // Advance session from frontend continue signal
  if (body.type === 'continue' && body.step !== undefined && body.step > session.currentStep) {
    for (let i = 0; i <= body.step; i++) {
      if (session.steps[i]) session.steps[i].status = 'complete';
    }
    session.currentStep = body.step;
    if (body.step + 1 < session.steps.length && session.steps[body.step + 1]) {
      session.steps[body.step + 1].status = 'active';
    }
    await saveBuildSession(ideaId, session);
  }

  // Build conversation messages
  const history = await getConversationHistory(ideaId);

  // Add new user message to history
  if (body.type === 'user' && body.content) {
    history.push({
      role: 'user',
      content: body.content,
      timestamp: new Date().toISOString(),
    });
  } else if (body.type === 'mode_select') {
    history.push({
      role: 'user',
      content: `I choose "${session.mode === 'interactive' ? 'Build with me' : "You've got this"}" mode. Let's begin!`,
      timestamp: new Date().toISOString(),
    });
  } else if (body.type === 'continue') {
    history.push({
      role: 'user',
      content: `Continue to the next step (step ${(body.step ?? session.currentStep) + 1}).`,
      timestamp: new Date().toISOString(),
    });
  }

  // Assemble system prompt
  const systemPrompt = await assembleSystemPrompt(ideaId, session.mode);

  // Convert history to Anthropic message format (last 40 messages to stay within context)
  const anthropicMessages = history.slice(-40).map((m) => ({
    role: m.role as 'user' | 'assistant',
    content: m.content,
  }));

  // Create tools array: existing website tools + consult_advisor
  const websiteTools = createWebsiteTools(ideaId);
  const consultTool = createConsultAdvisorTool(ideaId);
  const allTools = [...websiteTools, consultTool];

  // Stream the agent loop response
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        try {
          await runAgentStream(controller, encoder, systemPrompt, anthropicMessages, allTools, session, ideaId, history);
        } catch (error) {
          console.error('[chat] Stream error:', error);
          controller.error(error);
        }
      },
    }),
    {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      },
    },
  );
}

async function runAgentStream(
  controller: ReadableStreamDefaultController,
  encoder: TextEncoder,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: ToolDefinition[],
  session: BuildSession,
  ideaId: string,
  history: ChatMessage[],
): Promise<void> {
  const anthropicTools = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema as Anthropic.Tool.InputSchema,
  }));

  const MAX_TOOL_ROUNDS = 15;
  let currentMessages: Anthropic.MessageParam[] = [...messages];
  let assistantText = '';

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const stream = getAnthropic().messages.stream({
      model: CLAUDE_MODEL,
      max_tokens: 4096,
      system: systemPrompt,
      messages: currentMessages,
      tools: anthropicTools,
    });

    // Stream text deltas to the client
    let roundText = '';
    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        controller.enqueue(encoder.encode(event.delta.text));
        roundText += event.delta.text;
      }
    }

    assistantText += roundText;

    // Get the full message to check for tool_use blocks
    const finalMessage = await stream.finalMessage();
    const toolUseBlocks = finalMessage.content.filter(
      (block): block is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
        block.type === 'tool_use'
    );

    if (toolUseBlocks.length === 0) {
      break;
    }

    // Execute tool calls in parallel
    const toolResults = await Promise.all(
      toolUseBlocks.map(async (toolCall) => {
        const tool = tools.find((t) => t.name === toolCall.name);
        if (!tool) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: `Error: Unknown tool "${toolCall.name}"`,
            is_error: true,
          };
        }
        try {
          const result = await tool.execute(toolCall.input);
          const resultStr = typeof result === 'string' ? result : JSON.stringify(result);
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: resultStr,
          };
        } catch (error) {
          return {
            type: 'tool_result' as const,
            tool_use_id: toolCall.id,
            content: `Error: ${error instanceof Error ? error.message : String(error)}`,
            is_error: true,
          };
        }
      }),
    );

    // Advance session step based on tools called this round
    const toolNamesCalled = toolUseBlocks.map((t) => t.name);
    advanceSessionStep(session, toolNamesCalled);

    // Add assistant message + tool results to conversation for next round
    currentMessages = [
      ...currentMessages,
      { role: 'assistant' as const, content: finalMessage.content },
      { role: 'user' as const, content: toolResults.map((r) => ({
        type: 'tool_result' as const,
        tool_use_id: r.tool_use_id,
        content: r.content,
        ...(r.is_error ? { is_error: r.is_error } : {}),
      })) },
    ];
  }

  // Save assistant text to history
  if (assistantText) {
    history.push({
      role: 'assistant',
      content: assistantText,
      timestamp: new Date().toISOString(),
    });
    await saveConversationHistory(ideaId, history);
  }

  // Determine and emit stream end signal
  const signal = determineStreamEndSignal(session);
  controller.enqueue(encoder.encode(`\n__SIGNAL__:${JSON.stringify(signal)}`));

  session.updatedAt = new Date().toISOString();
  await saveBuildSession(ideaId, session);
  controller.close();
}

const TOOL_COMPLETES_STEP: Record<string, number> = {
  get_idea_context: 0,        // Extract Ingredients
  design_brand: 1,            // Design Brand Identity
  // Step 2 (Write Hero) has no tool — advances via frontend continue
  assemble_site_files: 3,     // Assemble Page
  evaluate_brand: 4,          // Pressure Test
  validate_code: 4,           // Pressure Test
  consult_advisor: 5,         // Advisor Review (gated: currentStep >= 4)
  create_repo: 6,             // Build & Deploy
  push_files: 6,              // Build & Deploy
  create_vercel_project: 6,   // Build & Deploy
  trigger_deploy: 6,          // Build & Deploy
  check_deploy_status: 6,     // Build & Deploy
  verify_site: 7,             // Verify
  finalize_site: 7,           // Verify
};

/**
 * Advance session step based on which tools were called this round.
 * Mutates session in place. Only moves forward, never backward.
 */
export function advanceSessionStep(
  session: BuildSession,
  toolNames: string[],
): void {
  let maxStep = session.currentStep;
  for (const name of toolNames) {
    const step = TOOL_COMPLETES_STEP[name];
    if (step === undefined) continue;
    if (name === 'consult_advisor' && session.currentStep < 4) continue;
    if (step > maxStep) maxStep = step;
  }

  if (maxStep > session.currentStep) {
    for (let i = 0; i <= maxStep; i++) {
      if (session.steps[i]) session.steps[i].status = 'complete';
    }
    session.currentStep = maxStep;
    if (maxStep + 1 < session.steps.length && session.steps[maxStep + 1]) {
      session.steps[maxStep + 1].status = 'active';
    }
  }
}

export function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
  const stepConfig = WEBSITE_BUILD_STEPS[session.currentStep];

  // Build complete
  if (session.currentStep >= WEBSITE_BUILD_STEPS.length - 1 &&
      session.steps[session.currentStep]?.status === 'complete') {
    return {
      action: 'complete',
      result: {
        siteUrl: session.artifacts.siteUrl || '',
        repoUrl: '',
      },
    };
  }

  // Deploy step — use polling
  if (session.currentStep === 6) {
    return {
      action: 'poll',
      step: session.currentStep,
      pollUrl: `/api/painted-door/${session.ideaId}`,
    };
  }

  // Checkpoint in interactive mode
  if (session.mode === 'interactive' && stepConfig?.checkpoint) {
    return {
      action: 'checkpoint',
      step: session.currentStep,
      prompt: `Step ${session.currentStep + 1} complete. Review and provide feedback, or say "continue" to proceed.`,
    };
  }

  // Auto-continue
  return { action: 'continue', step: session.currentStep };
}
