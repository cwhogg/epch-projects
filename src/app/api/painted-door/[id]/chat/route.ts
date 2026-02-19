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
import { WEBSITE_BUILD_STEPS, REQUIRED_ADVISORS_PER_STAGE, SUBSTAGE_LABELS } from '@/types';

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
    (d): d is NonNullable<typeof d> => d != null
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

  // 6. Mode instruction (updated for 6 stages)
  const modeInstruction = mode === 'interactive'
    ? `## Mode: Interactive ("Build with me")
You are in interactive mode. Follow the 6-stage process. At every copy-producing stage (0, 1, 2a-2e, 3), you MUST pause and present your work for user feedback before continuing. You MUST call consult_advisor for the required advisors at each stage before presenting your synthesis.

When you finish a checkpoint step, end your message by describing what you've completed and what you'd like feedback on.`
    : `## Mode: Autonomous ("You've got this")
You are in autonomous mode. Run through all 6 stages continuously without stopping. You MUST still call consult_advisor for the required advisors at each stage. Narrate your progress as you go.`;

  // 7. Advisor roster
  const advisorsWithExpertise = advisorRegistry.filter((a) => a.evaluationExpertise);
  const advisorRoster = advisorsWithExpertise
    .map((a) => `- **${a.id}** (${a.name}): ${a.evaluationExpertise}`)
    .join('\n');

  return `${advisorPrompt}

${framework ? `## FRAMEWORK\n${framework}\n` : ''}
---

## Your Task

You are building a landing page for a product. Follow the Landing Page Assembly framework through all 6 stages. Use the foundation documents below as your source of truth. Fill gaps where docs don't specify exact values.

You MUST call consult_advisor for the required advisors at EVERY copy-producing stage before presenting your recommendation to the user. This is mandatory, not optional.

${modeInstruction}

## Content Quality Rules
- Never suggest, request, or generate social proof (testimonials, user counts, customer logos, case studies). The target users are pre-launch startups. Social proof does not exist and should never be referenced.
- Never use em dashes (-- or unicode em dash). Use periods, commas, colons, or semicolons instead.
- Keep each message concise. The user is reading a chat, not a report.
- Before finalizing any copy, check it against the AI slop blocklist in the framework. If any pattern appears, rewrite that sentence.

## Foundation Documents
${foundationSection}

## Product & Analysis
${ideaSection}
${siteSection}

## Available Advisors for Consultation
You MUST use the consult_advisor tool for the required advisors at each stage.
${advisorRoster}

## Build Tools
You have access to all website build tools (assemble_site_files, create_repo, push_files, etc.) plus consult_advisor. Use them when you reach the appropriate step.

## Output
Respond conversationally. When you use a tool, explain what you're doing and why. When consulting an advisor, do NOT paraphrase their response. Their response appears as a separate message bubble.`;
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
      currentSubstep: 0,
      steps: WEBSITE_BUILD_STEPS.map((s) => ({
        name: s.name,
        status: 'pending' as const,
      })),
      artifacts: {},
      advisorCallsThisRound: [],
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
  if (body.type === 'continue') {
    // Handle substep advancement within step 2
    if (body.substep !== undefined && session.currentStep === 2) {
      session.currentSubstep = body.substep;
      session.advisorCallsThisRound = [];
    } else if (body.step !== undefined && body.step > session.currentStep) {
      for (let i = 0; i <= body.step && i < session.steps.length; i++) {
        session.steps[i].status = 'complete';
      }
      session.currentStep = body.step;
      session.currentSubstep = 0;
      session.advisorCallsThisRound = [];
      if (body.step + 1 < session.steps.length) {
        session.steps[body.step + 1].status = 'active';
      }
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
  const websiteTools = await createWebsiteTools(ideaId);
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
  let advisorEnforcementRetries = 0;

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

    // Inject advisor markers for consult_advisor tool results
    for (let i = 0; i < toolUseBlocks.length; i++) {
      if (toolUseBlocks[i].name === 'consult_advisor') {
        const advisorId = toolUseBlocks[i].input.advisorId as string;

        if (!toolResults[i].is_error) {
          trackAdvisorCall(session, advisorId);
          const advisor = advisorRegistry.find((a) => a.id === advisorId);
          const advisorName = advisor?.name || advisorId;
          const marker = `\n<<<ADVISOR_START>>>:${JSON.stringify({ advisorId, advisorName })}\n${toolResults[i].content}\n<<<ADVISOR_END>>>\n`;
          controller.enqueue(encoder.encode(marker));
          assistantText += marker;
        } else {
          // Track as called (prevent enforcement loop) but skip marker injection.
          trackAdvisorCall(session, advisorId);
          console.warn(`Advisor ${advisorId} call failed. Proceeding without their input.`);
        }
      }
    }

    // Add paragraph break between tool rounds for readability
    if (assistantText.length > 0 && !assistantText.endsWith('\n\n')) {
      controller.enqueue(encoder.encode('\n\n'));
      assistantText += '\n\n';
    }

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

    // Check if required advisors have been consulted before allowing stage to complete
    const advisorCheck = checkAdvisorRequirements(session);
    if (advisorCheck && session.currentStep <= 3) {
      if (advisorEnforcementRetries < 2) {
        advisorEnforcementRetries++;
        // Force another LLM turn with enforcement message
        history.push({ role: 'user', content: advisorCheck, timestamp: new Date().toISOString() });
        continue;
      }
      // Enforcement retries exhausted — proceed with a warning
      console.warn(`Advisor enforcement exhausted after ${advisorEnforcementRetries} retries at step ${session.currentStep}. Proceeding without full advisor coverage.`);
    }
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

  // Advance session past checkpoint so the next user message runs on the next step.
  // Without this, session.currentStep stays stuck and every subsequent signal
  // repeats the same checkpoint, causing the sidebar to freeze.
  if (signal.action === 'checkpoint') {
    if (session.currentStep === 2) {
      advanceSubstep(session);
    } else if (session.currentStep < session.steps.length - 1) {
      session.steps[session.currentStep].status = 'complete';
      session.currentStep += 1;
      session.currentSubstep = 0;
      session.advisorCallsThisRound = [];
      session.steps[session.currentStep].status = 'active';
    }
  }

  session.updatedAt = new Date().toISOString();
  await saveBuildSession(ideaId, session);
  controller.close();
}

const TOOL_COMPLETES_STEP: Record<string, number> = {
  get_idea_context: 0,        // Extract & Validate Ingredients
  // Steps 0-3 are copy-producing — advanced via frontend continue signals + advisor enforcement
  assemble_site_files: 4,     // Build & Deploy
  create_repo: 4,             // Build & Deploy
  push_files: 4,              // Build & Deploy
  create_vercel_project: 4,   // Build & Deploy
  trigger_deploy: 4,          // Build & Deploy
  check_deploy_status: 4,     // Build & Deploy
  verify_site: 5,             // Verify
  finalize_site: 5,           // Verify
};

/**
 * Advance session step based on which tools were called this round.
 * Mutates session in place. Only moves forward, never backward.
 */
export function advanceSessionStep(
  session: BuildSession,
  toolNames: string[],
): void {
  let maxStep = -1;

  for (const name of toolNames) {
    const step = TOOL_COMPLETES_STEP[name];
    if (step === undefined) continue;
    if (step > maxStep) maxStep = step;
  }

  if (maxStep > session.currentStep) {
    // Mark all intermediate steps complete
    for (let i = 0; i <= maxStep && i < session.steps.length; i++) {
      session.steps[i].status = 'complete';
    }
    session.currentStep = maxStep;
    // Mark next step active if it exists
    if (maxStep + 1 < session.steps.length) {
      session.steps[maxStep + 1].status = 'active';
    }
  }
}

/** Track which advisors were called in this round */
export function trackAdvisorCall(session: BuildSession, advisorId: string): void {
  if (!session.advisorCallsThisRound) {
    session.advisorCallsThisRound = [];
  }
  if (!session.advisorCallsThisRound.includes(advisorId)) {
    session.advisorCallsThisRound.push(advisorId);
  }
}

/** Check if required advisors have been consulted for the current stage.
 *  Returns null if requirements met, or a message string if not. */
export function checkAdvisorRequirements(session: BuildSession): string | null {
  const stageKey = session.currentStep === 2
    ? `2${String.fromCharCode(97 + session.currentSubstep)}` // "2a", "2b", etc.
    : String(session.currentStep);

  const required = REQUIRED_ADVISORS_PER_STAGE[stageKey];
  if (!required) return null; // No requirements for this stage

  const called = session.advisorCallsThisRound || [];
  const missing = required.filter((id) => !called.includes(id));

  if (missing.length === 0) return null;
  return `You must consult the required advisors before presenting your recommendation. Missing: ${missing.join(', ')}.`;
}

/** Advance substep within step 2 (Write Page Sections).
 *  Returns true if all substeps are complete and step 2 should advance. */
export function advanceSubstep(session: BuildSession): boolean {
  if (session.currentStep !== 2) return false;

  session.currentSubstep += 1;
  session.advisorCallsThisRound = []; // Reset for new substep

  if (session.currentSubstep >= 5) {
    // All 5 substages complete — advance to step 3
    session.steps[2].status = 'complete';
    session.currentStep = 3;
    session.currentSubstep = 0;
    if (session.steps[3]) {
      session.steps[3].status = 'active';
    }
    return true;
  }
  return false;
}

export function determineStreamEndSignal(session: BuildSession): StreamEndSignal {
  const stepConfig = WEBSITE_BUILD_STEPS[session.currentStep];

  // Complete: last step is done
  if (session.currentStep >= session.steps.length - 1 && session.steps[session.currentStep]?.status === 'complete') {
    return {
      action: 'complete',
      result: {
        siteUrl: session.artifacts.siteUrl || '',
        repoUrl: session.artifacts.repoUrl || '',
      },
    };
  }

  // Poll: Build & Deploy step (check by name, not index)
  if (stepConfig?.name === 'Build & Deploy') {
    return {
      action: 'poll',
      step: session.currentStep,
      pollUrl: `/api/painted-door/${session.ideaId}`,
    };
  }

  // Checkpoint: interactive mode at a checkpoint step
  if (session.mode === 'interactive' && stepConfig?.checkpoint) {
    // For substages within step 2, emit checkpoint at each substep boundary
    if (session.currentStep === 2) {
      return {
        action: 'checkpoint',
        step: session.currentStep,
        substep: session.currentSubstep,
        prompt: `Stage 3${String.fromCharCode(97 + session.currentSubstep)}: ${SUBSTAGE_LABELS[session.currentSubstep] || 'Section'} is ready for your review.`,
      };
    }
    return {
      action: 'checkpoint',
      step: session.currentStep,
      prompt: `${stepConfig.name} is ready for your review.`,
    };
  }

  // Continue: autonomous mode or non-checkpoint step
  return {
    action: 'continue',
    step: session.currentStep,
  };
}
