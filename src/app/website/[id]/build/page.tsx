'use client';

import { useEffect, useState, useRef, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import type { BuildMode, BuildStep, ChatMessage, ChatRequestBody, StreamEndSignal } from '@/types';
import { WEBSITE_BUILD_STEPS, SUBSTAGE_LABELS } from '@/types';
import { AdvisorStreamParser, type StreamSegment } from '@/lib/parse-advisor-segments';
import { validateCopyQuality } from '@/lib/copy-quality';

type ClientState = 'loading' | 'mode_select' | 'streaming' | 'waiting_for_user' | 'polling' | 'done';

const STEP_DESCRIPTIONS = [
  'Extract value props, validate with advisors',        // 0 — Extract & Validate
  'Draft headline, subhead, CTA with advisor input',    // 1 — Write Hero
  'Problem, features, how-it-works, audience, CTA',     // 2 — Write Page Sections
  'Coherence check across all locked sections',         // 3 — Final Review
  'Generate code, deploy to Vercel',                    // 4 — Build & Deploy
  'Check live site, final polish',                      // 5 — Verify
];

function placeholderForState(state: ClientState): string {
  switch (state) {
    case 'streaming': return 'Julian is responding...';
    case 'polling': return 'Waiting for deployment...';
    case 'done': return 'Build complete!';
    default: return 'Reply to Julian...';
  }
}

export default function WebsiteBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const ideaId = params.id as string;

  const [clientState, setClientState] = useState<ClientState>('loading');
  const [ideaName, setIdeaName] = useState('');
  const [mode, setMode] = useState<BuildMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectingMode, setSelectingMode] = useState<BuildMode | null>(null);

  // Chat state
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingSegments, setStreamingSegments] = useState<ChatMessage[]>([]);
  const [steps, setSteps] = useState<BuildStep[]>(
    WEBSITE_BUILD_STEPS.map((s) => ({ name: s.name, status: 'pending' }))
  );
  const [inputValue, setInputValue] = useState('');
  const [siteResult, setSiteResult] = useState<{ siteUrl: string; repoUrl: string } | null>(null);

  // Combine permanent messages with streaming segments for display
  const displayMessages = useMemo(() => {
    if (streamingSegments.length > 0) {
      return [...messages, ...streamingSegments];
    }
    return messages;
  }, [messages, streamingSegments]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamingRef = useRef(false);
  const lastSignalStepRef = useRef(0);
  const currentSubstepRef = useRef(0);
  const continueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Derive current step from steps array instead of separate state (prevents desync)
  const derivedStep = useMemo(() => {
    const activeIdx = steps.findIndex((s) => s.status === 'active');
    return activeIdx >= 0 ? activeIdx : steps.filter((s) => s.status === 'complete').length;
  }, [steps]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayMessages, clientState]);

  // Cleanup poll on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (continueTimerRef.current) clearTimeout(continueTimerRef.current);
    };
  }, []);

  // Load idea name on mount
  useEffect(() => {
    async function loadIdea() {
      try {
        const res = await fetch('/api/ideas');
        if (res.ok) {
          const ideas = await res.json();
          const idea = ideas.find((i: { id: string }) => i.id === ideaId);
          if (idea) setIdeaName(idea.name);
        }
      } catch {
        // Non-critical
      }

      // Check for existing build session
      try {
        const res = await fetch(`/api/painted-door/${ideaId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.buildSession) {
            setMode(data.buildSession.mode);
            // Reconcile step statuses: force stale active states to complete
            const loadedSteps = data.buildSession.steps;
            const activeIdx = loadedSteps.findIndex((s: BuildStep) => s.status === 'active');
            if (activeIdx >= 0) {
              for (let i = 0; i < activeIdx; i++) {
                if (loadedSteps[i].status !== 'complete') {
                  loadedSteps[i].status = 'complete';
                }
              }
            }
            setSteps(loadedSteps);
            // Trigger continuation to resume the conversation
            try {
              await fetch(`/api/painted-door/${ideaId}/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'continue' }),
              });
            } catch {
              // Non-critical
            }
            setClientState('waiting_for_user');
            return;
          }
        }
      } catch {
        // Non-critical
      }

      setClientState('mode_select');
    }

    loadIdea();
  }, [ideaId]);

  function updateStepStatus(stepIndex: number, status: BuildStep['status']) {
    setSteps((prev) => {
      const updated = [...prev];
      if (status === 'complete') {
        // Mark all steps from 0 through stepIndex as complete
        for (let i = 0; i <= stepIndex; i++) {
          if (updated[i]) updated[i] = { ...updated[i], status: 'complete' };
        }
      } else if (updated[stepIndex]) {
        updated[stepIndex] = { ...updated[stepIndex], status };
      }
      // Mark next step as active if we completed one
      if (status === 'complete' && stepIndex + 1 < updated.length && updated[stepIndex + 1]?.status !== 'complete') {
        updated[stepIndex + 1] = { ...updated[stepIndex + 1], status: 'active' };
      }
      return updated;
    });
  }

  // Stream a chat API response and update messages in real-time.
  // Declared as a plain async function — the React Compiler handles memoization.
  async function streamResponse(body: ChatRequestBody) {
    if (streamingRef.current) return; // prevent concurrent streams
    streamingRef.current = true;
    setClientState('streaming');
    setError(null);

    try {
      const res = await fetch(`/api/painted-door/${ideaId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to get response');
        setClientState('waiting_for_user');
        return;
      }

      if (!res.body) {
        setError('No response stream');
        setClientState('waiting_for_user');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      const allChunks: string[] = [];

      // Use AdvisorStreamParser incrementally for real-time segment rendering
      const completedSegments: StreamSegment[] = [];
      const streamParser = new AdvisorStreamParser((seg) => completedSegments.push(seg));

      // Show empty placeholder while waiting for first chunk
      setStreamingSegments([{ role: 'assistant', content: '', timestamp: new Date().toISOString() }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        allChunks.push(chunk);
        streamParser.push(chunk);

        // Build current messages from completed segments + in-progress content
        const inProgress = streamParser.peekInProgress();
        const currentStreamMsgs: ChatMessage[] = completedSegments.map((seg) => ({
          role: 'assistant' as const,
          content: seg.content,
          timestamp: new Date().toISOString(),
          ...(seg.type === 'advisor' ? {
            metadata: { advisorConsultation: { advisorId: seg.advisorId, advisorName: seg.advisorName } },
          } : {}),
        }));

        if (inProgress) {
          // Strip signal text that may appear in the last chunk
          const displayContent = inProgress.content.replace(/\n__SIGNAL__:.+$/, '');
          if (displayContent.trim() || currentStreamMsgs.length === 0) {
            currentStreamMsgs.push({
              role: 'assistant' as const,
              content: displayContent || '',
              timestamp: new Date().toISOString(),
              ...(inProgress.type === 'advisor' ? {
                metadata: { advisorConsultation: { advisorId: inProgress.advisorId, advisorName: inProgress.advisorName } },
              } : {}),
            });
          }
        } else if (currentStreamMsgs.length === 0) {
          // No content yet — show loading placeholder
          currentStreamMsgs.push({ role: 'assistant', content: '', timestamp: new Date().toISOString() });
        }

        setStreamingSegments(currentStreamMsgs);
      }

      // Stream complete — do final parse with copy quality validation
      const fullText = allChunks.join('');
      const signalMatch = fullText.match(/\n__SIGNAL__:(.+)$/);

      if (signalMatch) {
        const cleanText = fullText.replace(/\n__SIGNAL__:.+$/, '');

        const finalSegments: StreamSegment[] = [];
        const finalParser = new AdvisorStreamParser((seg) => {
          const flags = validateCopyQuality(seg.content);
          if (flags.length > 0) {
            console.warn(`Copy quality flags in ${seg.type} segment:`, flags.map(f => f.category));
          }
          finalSegments.push(seg);
        });
        finalParser.push(cleanText);
        finalParser.flush();

        // Move streaming segments to permanent messages
        const finalMessages = finalSegments.length > 0
          ? finalSegments.map((seg) => ({
              role: 'assistant' as const,
              content: seg.content,
              timestamp: new Date().toISOString(),
              ...(seg.type === 'advisor' ? {
                metadata: { advisorConsultation: { advisorId: seg.advisorId, advisorName: seg.advisorName } },
              } : {}),
            }))
          : [{ role: 'assistant' as const, content: cleanText, timestamp: new Date().toISOString() }];

        setStreamingSegments([]);
        setMessages((prev) => [...prev, ...finalMessages]);

        try {
          const signal: StreamEndSignal = JSON.parse(signalMatch[1]);
          handleSignal(signal);
        } catch {
          setClientState('waiting_for_user');
        }
      } else {
        // No signal — still parse advisor tags before storing as messages
        const fallbackSegments: StreamSegment[] = [];
        const fallbackParser = new AdvisorStreamParser((seg) => fallbackSegments.push(seg));
        fallbackParser.push(fullText);
        fallbackParser.flush();

        const fallbackMessages = fallbackSegments.length > 0
          ? fallbackSegments.map((seg) => ({
              role: 'assistant' as const,
              content: seg.content,
              timestamp: new Date().toISOString(),
              ...(seg.type === 'advisor' ? {
                metadata: { advisorConsultation: { advisorId: seg.advisorId, advisorName: seg.advisorName } },
              } : {}),
            }))
          : [{ role: 'assistant' as const, content: fullText, timestamp: new Date().toISOString() }];

        setStreamingSegments([]);
        setMessages((prev) => [...prev, ...fallbackMessages]);
        setClientState('waiting_for_user');
      }
    } catch (err) {
      setStreamingSegments([]);
      setError(err instanceof Error ? err.message : 'Connection failed');
      setClientState('waiting_for_user');
    } finally {
      streamingRef.current = false;
    }
  }

  function handleSignal(signal: StreamEndSignal) {
    if ('step' in signal) {
      lastSignalStepRef.current = signal.step;
    }

    switch (signal.action) {
      case 'checkpoint':
        if ('substep' in signal && signal.substep !== undefined) {
          currentSubstepRef.current = signal.substep;
          // Substep checkpoint: keep step 2 active (not all substeps done yet)
          updateStepStatus(signal.step, 'active');
        } else {
          updateStepStatus(signal.step, 'complete');
        }
        setClientState('waiting_for_user');
        break;
      case 'continue':
        // For substep advancement within step 2
        if (signal.step === 2 && currentSubstepRef.current < 4) {
          currentSubstepRef.current += 1;
          updateStepStatus(signal.step, 'active');
          // Defer: streamingRef.current is still true inside the try block.
          // setTimeout lets the finally block reset it before the next stream starts.
          continueTimerRef.current = setTimeout(() => streamResponse({ type: 'continue', step: 2, substep: currentSubstepRef.current }), 0);
        } else {
          updateStepStatus(signal.step, 'complete');
          continueTimerRef.current = setTimeout(() => streamResponse({ type: 'continue', step: signal.step + 1 }), 0);
        }
        break;
      case 'poll':
        // Mark all steps up to the poll step as complete, then set poll step active
        if (signal.step > 0) {
          updateStepStatus(signal.step - 1, 'complete');
        }
        updateStepStatus(signal.step, 'active');
        setClientState('polling');
        startPolling();
        break;
      case 'complete':
        setSiteResult(signal.result);
        updateStepStatus(steps.length - 1, 'complete');
        setClientState('done');
        break;
    }
  }

  function startPolling() {
    let pollCount = 0;
    pollRef.current = setInterval(async () => {
      pollCount++;
      try {
        const res = await fetch(`/api/painted-door/${ideaId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'complete' || data.status === 'error') {
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          if (data.status === 'complete') {
            streamResponse({ type: 'continue', step: lastSignalStepRef.current + 1 });
          } else {
            setError('Deployment failed');
            setClientState('waiting_for_user');
          }
        } else if (pollCount >= 100) {
          // Safety timeout after ~5 minutes of polling
          if (pollRef.current) clearInterval(pollRef.current);
          pollRef.current = null;
          setError('Deployment timed out. Try refreshing the page.');
          setClientState('waiting_for_user');
        }
      } catch {
        // Continue polling
      }
    }, 3000);
  }

  async function handleModeSelect(selectedMode: BuildMode) {
    setSelectingMode(selectedMode);
    setError(null);
    setMode(selectedMode);

    // Initialize steps with first step active
    setSteps((prev) => {
      const updated = [...prev];
      updated[0] = { ...updated[0], status: 'active' };
      return updated;
    });

    // Add initial user message to chat
    const userMsg: ChatMessage = {
      role: 'user',
      content: selectedMode === 'interactive'
        ? "I choose \"Build with me\" mode. Let's begin!"
        : "I choose \"You've got this\" mode. Let's begin!",
      timestamp: new Date().toISOString(),
    };
    setMessages([userMsg]);

    await streamResponse({ type: 'mode_select', mode: selectedMode });
    setSelectingMode(null);
  }

  async function handleStartOver() {
    if (!confirm('This will delete all progress and start the build from scratch. Continue?')) return;
    try {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
      await fetch(`/api/painted-door/${ideaId}`, { method: 'DELETE' });
      router.refresh();
      // Reset all state to initial
      setMessages([]);
      setStreamingSegments([]);
      setSteps(WEBSITE_BUILD_STEPS.map((s) => ({ ...s, status: 'pending' as const })));
      setMode(null);
      setError(null);
      setSiteResult(null);
      setClientState('mode_select');
    } catch {
      setError('Failed to reset. Try refreshing the page.');
    }
  }

  async function handleSendMessage() {
    const content = inputValue.trim();
    if (!content || clientState !== 'waiting_for_user') return;

    setInputValue('');
    // Reset textarea height
    if (textareaRef.current) textareaRef.current.style.height = 'auto';

    const userMsg: ChatMessage = {
      role: 'user',
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);

    await streamResponse({ type: 'user', content });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  }

  // Auto-resize textarea
  function handleTextareaInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInputValue(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  // Calculate progress
  const completedSteps = steps.filter((s) => s.status === 'complete').length;

  // Loading state
  if (clientState === 'loading') {
    return (
      <div className="h-screen flex flex-col">
        <BuildHeader ideaName="" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="animate-spin w-8 h-8 mx-auto mb-4" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
            <p style={{ color: 'var(--text-muted)' }}>Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Mode selection view
  if (clientState === 'mode_select') {
    return (
      <div className="h-screen flex flex-col">
        <BuildHeader ideaName={ideaName} ideaId={ideaId} />

        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {/* Decorative background glows */}
          <div
            className="absolute w-[300px] h-[300px] rounded-full pointer-events-none"
            style={{ filter: 'blur(100px)', opacity: 0.15, background: 'var(--color-sky)', top: '-50px', right: '20%' }}
          />
          <div
            className="absolute w-[300px] h-[300px] rounded-full pointer-events-none"
            style={{ filter: 'blur(100px)', opacity: 0.08, background: 'var(--accent-coral)', bottom: '-80px', left: '25%' }}
          />

          <div className="w-full max-w-[560px] mx-auto px-6">
            {/* Julian's intro message */}
            <div className="animate-slide-up mb-10">
              <div className="flex items-start gap-3 mb-5">
                <div
                  className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-white text-sm font-bold"
                  style={{ background: 'linear-gradient(135deg, #ff6b5b, #ff8f6b)' }}
                >
                  JS
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Julian Shapiro</span>
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wider"
                      style={{ background: 'rgba(255, 107, 91, 0.1)', color: 'var(--accent-coral)' }}
                    >
                      Website Advisor
                    </span>
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Landing page strategist</span>
                </div>
              </div>

              <div
                className="border p-5"
                style={{
                  background: 'var(--bg-card)',
                  borderColor: 'var(--border-subtle)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-card)',
                }}
              >
                <p className="text-[15px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                  I&apos;ve reviewed your foundation docs for{' '}
                  <strong style={{ color: 'var(--text-primary)' }}>{ideaName || 'your product'}</strong> &mdash;
                  the positioning is sharp, and I have a clear picture of the audience and value props.
                </p>
                <p className="text-[15px] leading-relaxed mt-3" style={{ color: 'var(--text-secondary)' }}>
                  I&apos;ll walk you through 6 stages to build your landing page, from extracting core ingredients
                  to deploying the final site. How do you want to work?
                </p>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div
                className="mb-4 p-3 rounded-lg text-sm animate-fade-in"
                style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)', border: '1px solid rgba(248, 113, 113, 0.2)' }}
              >
                {error}
              </div>
            )}

            {/* Mode Selection Cards */}
            <div className="animate-slide-up grid grid-cols-2 gap-4" style={{ animationDelay: '0.15s' }}>
              <ModeCard
                mode="interactive"
                title="Build with me"
                description="Interactive collaboration. I'll pause at each checkpoint for your input before moving forward."
                time="~30 min with feedback"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 8.511c.884.284 1.5 1.128 1.5 2.097v4.286c0 1.136-.847 2.1-1.98 2.193-.34.027-.68.052-1.02.072v3.091l-3-3c-1.354 0-2.694-.055-4.02-.163a2.115 2.115 0 01-.825-.242m9.345-8.334a2.126 2.126 0 00-.476-.095 48.64 48.64 0 00-8.048 0c-1.131.094-1.976 1.057-1.976 2.192v4.286c0 .837.46 1.58 1.155 1.951m9.345-8.334V6.637c0-1.621-1.152-3.026-2.76-3.235A48.455 48.455 0 0011.25 3c-2.115 0-4.198.137-6.24.402-1.608.209-2.76 1.614-2.76 3.235v6.226c0 1.621 1.152 3.026 2.76 3.235.577.075 1.157.14 1.74.194V21l4.155-4.155" /></svg>}
                timeIcon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                selecting={selectingMode}
                onSelect={handleModeSelect}
              />
              <ModeCard
                mode="autonomous"
                title="You've got this"
                description="Autonomous build. I'll run through all 6 stages and present the finished page for your review."
                time="~5 min hands-free"
                icon={<svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>}
                timeIcon={<svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>}
                selecting={selectingMode}
                onSelect={handleModeSelect}
              />
            </div>

            {/* 6-stage preview pills */}
            <div className="animate-slide-up mt-8 text-center" style={{ animationDelay: '0.3s' }}>
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                <span className="text-[11px] mr-1" style={{ color: 'var(--text-muted)' }}>6 stages:</span>
                {['Extract', 'Hero', 'Sections', 'Review', 'Deploy', 'Verify'].map((step, i, arr) => (
                  <span key={step} className="contents">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium"
                      style={{ background: 'var(--bg-secondary)', color: 'var(--text-muted)' }}
                    >
                      {step}
                    </span>
                    {i < arr.length - 1 && (
                      <svg className="w-2.5 h-2.5" style={{ color: 'var(--text-muted)', opacity: 0.4 }} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat view (streaming, waiting_for_user, polling, done)
  return (
    <div className="h-screen flex flex-col">
      <BuildHeader ideaName={ideaName} ideaId={ideaId} />

      <div className="flex-1 flex overflow-hidden">
        {/* Chat Panel (left, ~75%) */}
        <div className="flex-1 flex flex-col min-w-0" style={{ maxWidth: '75%' }}>
          {/* Chat messages area */}
          <div className="flex-1 overflow-y-auto px-6 py-5" style={{ scrollbarWidth: 'thin' }}>
            <div className="max-w-[720px] mx-auto space-y-5">
              {displayMessages.map((msg, i) => (
                <ChatBubble key={i} message={msg} />
              ))}

              {/* Streaming indicator */}
              {clientState === 'streaming' && displayMessages.length > 0 && displayMessages[displayMessages.length - 1]?.role === 'assistant' && (
                <div className="ml-11 flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-coral)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Julian is thinking...</span>
                </div>
              )}

              {/* Polling indicator */}
              {clientState === 'polling' && (
                <div className="ml-11 flex items-center gap-2 p-3 rounded-lg" style={{ background: 'rgba(255, 107, 91, 0.06)', border: '1px solid rgba(255, 107, 91, 0.12)', borderRadius: 'var(--radius-md)' }}>
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="var(--accent-coral)" strokeWidth="2">
                    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                  </svg>
                  <span className="text-xs font-medium" style={{ color: 'var(--accent-coral)' }}>Deploying your site...</span>
                </div>
              )}

              {/* Completion card */}
              {clientState === 'done' && siteResult && (
                <div className="ml-11 animate-slide-up">
                  <div
                    className="p-5 border"
                    style={{
                      background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.04), rgba(16, 185, 129, 0.01))',
                      borderColor: 'rgba(16, 185, 129, 0.2)',
                      borderRadius: 'var(--radius-lg)',
                    }}
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--accent-emerald)' }}>
                        <svg className="w-3.5 h-3.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <span className="font-display text-sm font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>Site Live!</span>
                    </div>
                    <a
                      href={siteResult.siteUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium underline underline-offset-2 transition-colors hover:opacity-80"
                      style={{ color: 'var(--accent-coral)' }}
                    >
                      {siteResult.siteUrl}
                    </a>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Message Input Bar */}
          <div
            className="flex-shrink-0 border-t px-6 py-4"
            style={{
              borderColor: 'var(--border-subtle)',
              background: 'rgba(250, 249, 247, 0.6)',
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="max-w-[720px] mx-auto">
              {error && (
                <div
                  className="mb-3 p-2.5 rounded-lg text-xs animate-fade-in"
                  style={{ background: 'rgba(248, 113, 113, 0.1)', color: 'var(--color-danger)', border: '1px solid rgba(248, 113, 113, 0.2)' }}
                >
                  {error}
                </div>
              )}
              <div className="flex items-end gap-3">
                <div className="flex-1 relative">
                  <textarea
                    ref={textareaRef}
                    value={inputValue}
                    onChange={handleTextareaInput}
                    onKeyDown={handleKeyDown}
                    disabled={clientState !== 'waiting_for_user'}
                    className="w-full resize-none px-4 py-3 pr-12 text-sm transition-all"
                    style={{
                      background: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-lg)',
                      minHeight: '44px',
                      maxHeight: '120px',
                      outline: 'none',
                    }}
                    onFocus={(e) => {
                      e.target.style.borderColor = 'var(--accent-coral)';
                      e.target.style.boxShadow = '0 0 0 3px rgba(255, 107, 91, 0.12)';
                    }}
                    onBlur={(e) => {
                      e.target.style.borderColor = 'var(--border-default)';
                      e.target.style.boxShadow = 'none';
                    }}
                    placeholder={placeholderForState(clientState)}
                    rows={1}
                  />
                  <button
                    onClick={handleSendMessage}
                    disabled={clientState !== 'waiting_for_user' || !inputValue.trim()}
                    className="absolute right-2 bottom-2 w-8 h-8 rounded-lg flex items-center justify-center text-white transition-all hover:opacity-90 disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg, #ff6b5b, #ff8f6b)' }}
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 19V5m0 0l-7 7m7-7l7 7" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                <div className="flex items-center gap-3">
                  <span>Step {Math.min(derivedStep + 1, steps.length)} of {steps.length}</span>
                  <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-muted)' }} />
                  <span>{steps[derivedStep]?.name || 'Complete'}</span>
                  <span className="w-1 h-1 rounded-full" style={{ background: 'var(--text-muted)' }} />
                  <span className="font-medium" style={{ color: 'var(--accent-coral)' }}>
                    {mode === 'interactive' ? 'Interactive' : 'Autonomous'} mode
                  </span>
                </div>
                <button
                  onClick={handleStartOver}
                  disabled={clientState === 'streaming'}
                  className="transition-colors hover:text-[var(--accent-coral)] disabled:opacity-40"
                >
                  Start over
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Progress Sidebar (right, ~25%) */}
        <aside
          className="w-[320px] flex-shrink-0 border-l overflow-y-auto"
          style={{ borderColor: 'var(--border-subtle)', background: 'var(--bg-card)' }}
        >
          <div className="p-5">
            {/* Sidebar Header */}
            <div className="mb-6">
              <h2 className="font-display text-base font-medium mb-1" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Build Progress
              </h2>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(completedSteps / steps.length) * 100}%`,
                      background: 'linear-gradient(90deg, #ff6b5b, #ff8f6b)',
                    }}
                  />
                </div>
                <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--text-muted)' }}>
                  {completedSteps}/{steps.length}
                </span>
              </div>
            </div>

            {/* Steps */}
            <div className="space-y-0">
              {steps.map((step, i) => (
                <StepItem
                  key={i}
                  step={step}
                  index={i}
                  description={STEP_DESCRIPTIONS[i]}
                  isLast={i === steps.length - 1}
                  nextStatus={i < steps.length - 1 ? steps[i + 1].status : 'pending'}
                  currentSubstep={i === 2 ? currentSubstepRef.current : undefined}
                />
              ))}
            </div>

            {/* Sidebar footer: mode indicator */}
            <div className="mt-8 p-3" style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--radius-lg)' }}>
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-coral)' }} />
                <span className="font-medium" style={{ color: 'var(--text-primary)' }}>
                  {mode === 'interactive' ? 'Interactive' : 'Autonomous'} Mode
                </span>
              </div>
              <p className="text-[11px] mt-1 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                {mode === 'interactive'
                  ? 'Julian pauses at each checkpoint for your input before proceeding.'
                  : 'Julian runs through all steps autonomously, narrating progress.'}
              </p>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// --- Sub-components ---

function BuildHeader({ ideaName, ideaId }: { ideaName: string; ideaId?: string }) {
  return (
    <header
      className="flex-shrink-0 border-b"
      style={{
        background: 'rgba(250, 249, 247, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderColor: 'var(--border-subtle)',
      }}
    >
      <div className="max-w-[1400px] mx-auto px-5 h-14 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href={ideaId ? `/website/${ideaId}` : '/website'}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div className="w-px h-5" style={{ background: 'rgba(0,0,0,0.06)' }} />
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--accent-coral)' }} />
            {ideaName && (
              <span className="font-display text-base font-medium" style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                {ideaName}
              </span>
            )}
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider"
          style={{ background: 'rgba(56, 189, 248, 0.1)', color: 'var(--color-sky)', border: '1px solid rgba(56, 189, 248, 0.2)' }}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9" />
          </svg>
          Website
        </span>
      </div>
    </header>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    return (
      <div className="animate-slide-up flex gap-3 flex-row-reverse">
        <div
          className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border"
          style={{ background: 'var(--bg-secondary)', color: 'var(--text-secondary)', borderColor: 'var(--border-subtle)' }}
        >
          You
        </div>
        <div className="flex-1 flex flex-col items-end">
          <div className="flex items-center gap-2 mb-1 flex-row-reverse">
            <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>You</span>
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
              {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
            </span>
          </div>
          <div
            className="text-white text-sm leading-relaxed max-w-[85%] p-4"
            style={{
              background: 'linear-gradient(135deg, #ff6b5b, #ff8f6b)',
              borderRadius: 'var(--radius-lg)',
              borderTopRightRadius: '0.25rem',
            }}
          >
            {message.content}
          </div>
        </div>
      </div>
    );
  }

  // Assistant message
  const isAdvisor = !!message.metadata?.advisorConsultation;
  const advisorName = message.metadata?.advisorConsultation?.advisorName || '';
  const initials = isAdvisor
    ? advisorName.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    : 'JS';
  const displayName = isAdvisor ? advisorName : 'Julian Shapiro';
  const avatarGradient = isAdvisor
    ? 'linear-gradient(135deg, #38bdf8, #2dd4bf)'
    : 'linear-gradient(135deg, #ff6b5b, #ff8f6b)';

  return (
    <div className="animate-slide-up flex gap-3">
      <div
        className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold"
        style={{ background: avatarGradient }}
      >
        {initials}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{displayName}</span>
          {isAdvisor && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8' }}
            >
              Advisor
            </span>
          )}
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
          </span>
        </div>
        <div
          className="border p-4 text-sm leading-relaxed"
          style={{
            background: isAdvisor ? 'rgba(56, 189, 248, 0.03)' : 'var(--bg-card)',
            borderColor: isAdvisor ? 'rgba(56, 189, 248, 0.15)' : 'var(--border-subtle)',
            borderRadius: 'var(--radius-lg)',
            borderTopLeftRadius: '0.25rem',
            boxShadow: 'var(--shadow-card)',
            color: 'var(--text-secondary)',
          }}
        >
          <AssistantContent content={message.content} />
        </div>
      </div>
    </div>
  );
}

function AssistantContent({ content }: { content: string }) {
  if (!content) {
    return (
      <div className="flex items-center gap-2">
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-coral)' }} />
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-coral)', animationDelay: '0.15s' }} />
        <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-coral)', animationDelay: '0.3s' }} />
      </div>
    );
  }

  // Simple markdown-like rendering: split by paragraphs
  const paragraphs = content.split('\n\n').filter(Boolean);
  return (
    <div className="space-y-2">
      {paragraphs.map((p, i) => {
        // Handle bullet lists
        if (p.includes('\n- ') || p.startsWith('- ')) {
          const items = p.split('\n').filter(Boolean);
          return (
            <ul key={i} className="space-y-1 ml-4 list-disc" style={{ color: 'var(--text-muted)' }}>
              {items.map((item, j) => (
                <li key={j} className="text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <InlineContent text={item.replace(/^-\s*/, '')} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <InlineContent text={p} />
          </p>
        );
      })}
    </div>
  );
}

function InlineContent({ text }: { text: string }) {
  // Handle **bold** text
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return <strong key={i} style={{ color: 'var(--text-primary)' }}>{part.slice(2, -2)}</strong>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

function StepItem({ step, index, description, isLast, nextStatus, currentSubstep }: {
  step: BuildStep;
  index: number;
  description: string;
  isLast: boolean;
  nextStatus: BuildStep['status'];
  currentSubstep?: number;
}) {
  const isComplete = step.status === 'complete';
  const isActive = step.status === 'active';
  const isError = step.status === 'error';

  const GRADIENT_TO_SUBTLE = 'linear-gradient(180deg, var(--accent-coral), var(--border-subtle))';

  function connectorBackground(): string {
    if (isActive) return GRADIENT_TO_SUBTLE;
    if (isComplete) return nextStatus === 'active' ? GRADIENT_TO_SUBTLE : 'var(--accent-coral)';
    return 'var(--border-subtle)';
  }

  return (
    <div className={`relative ${isLast ? '' : 'pb-6'}`}>
      {/* Connector line */}
      {!isLast && (
        <div
          className="absolute left-[15px] top-[32px] bottom-0 w-[2px]"
          style={{ background: connectorBackground() }}
        />
      )}

      <div className="flex items-start gap-3">
        {/* Step indicator */}
        <div
          className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isActive ? 'animate-glow' : ''}`}
          style={{
            background: isComplete ? 'var(--accent-emerald)'
              : isActive ? 'var(--accent-coral)'
              : isError ? 'var(--color-danger)'
              : 'var(--bg-secondary)',
            border: !isComplete && !isActive && !isError ? '1px solid var(--border-subtle)' : 'none',
          }}
        >
          {isComplete && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          )}
          {isActive && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" style={{ animation: 'spin 1.5s linear infinite' }}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          {isError && (
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {!isComplete && !isActive && !isError && (
            <span className="text-xs font-semibold" style={{ color: 'var(--text-muted)' }}>{index + 1}</span>
          )}
        </div>

        {/* Step text */}
        <div className="pt-1">
          <div
            className={`text-sm ${isActive ? 'font-semibold' : 'font-medium'}`}
            style={{ color: isActive ? 'var(--accent-coral)' : isComplete ? 'var(--text-primary)' : 'var(--text-muted)' }}
          >
            {step.name}
          </div>
          <div className="text-xs mt-0.5" style={{ color: isActive ? 'var(--text-secondary)' : 'var(--text-muted)' }}>
            {description}
          </div>
          {isActive && index === 2 && currentSubstep !== undefined && (
            <div className="mt-2 space-y-1">
              {SUBSTAGE_LABELS.map((label, si) => (
                <div key={si} className="flex items-center gap-1.5">
                  <div
                    className={`w-1.5 h-1.5 rounded-full ${si === currentSubstep ? 'animate-pulse' : ''}`}
                    style={{
                      background: si < currentSubstep ? 'var(--accent-emerald)'
                        : si === currentSubstep ? 'var(--accent-coral)'
                        : 'var(--border-subtle)',
                    }}
                  />
                  <span
                    className="text-[11px]"
                    style={{
                      color: si === currentSubstep ? 'var(--accent-coral)'
                        : si < currentSubstep ? 'var(--text-secondary)'
                        : 'var(--text-muted)',
                      fontWeight: si === currentSubstep ? 500 : 400,
                    }}
                  >
                    {label}
                  </span>
                </div>
              ))}
            </div>
          )}
          {isActive && (index !== 2 || currentSubstep === undefined) && (
            <div className="mt-2 flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--accent-coral)' }} />
              <span className="text-[11px] font-medium" style={{ color: 'var(--accent-coral)' }}>In progress...</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ModeCard({ mode, title, description, time, icon, timeIcon, selecting, onSelect }: {
  mode: BuildMode;
  title: string;
  description: string;
  time: string;
  icon: React.ReactNode;
  timeIcon: React.ReactNode;
  selecting: BuildMode | null;
  onSelect: (mode: BuildMode) => void;
}) {
  return (
    <button
      onClick={() => onSelect(mode)}
      disabled={selecting !== null}
      className="text-left border p-5 transition-all duration-300 cursor-pointer group disabled:opacity-60 disabled:cursor-wait"
      style={{
        background: 'var(--bg-card)',
        borderColor: 'var(--border-subtle)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-card)',
      }}
      onMouseEnter={(e) => {
        if (selecting) return;
        e.currentTarget.style.borderColor = 'var(--border-default)';
        e.currentTarget.style.boxShadow = 'var(--shadow-elevated), 0 0 0 1px rgba(255, 107, 91, 0.12)';
        e.currentTarget.style.transform = 'translateY(-2px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border-subtle)';
        e.currentTarget.style.boxShadow = 'var(--shadow-card)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      <div
        className="w-10 h-10 flex items-center justify-center mb-4 transition-all group-hover:text-white"
        style={{
          background: selecting === mode ? 'linear-gradient(135deg, #ff6b5b, #ff8f6b)' : 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          color: selecting === mode ? 'white' : 'var(--text-secondary)',
        }}
      >
        {selecting === mode ? (
          <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        ) : icon}
      </div>
      <h3
        className="font-display text-base font-medium mb-1.5 transition-colors group-hover:text-[var(--accent-coral)]"
        style={{ color: 'var(--text-primary)', letterSpacing: '-0.02em' }}
      >
        {title}
      </h3>
      <p className="text-xs leading-relaxed" style={{ color: 'var(--text-muted)' }}>
        {description}
      </p>
      <div className="mt-4 flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--text-muted)' }}>
        {timeIcon}
        <span>{time}</span>
      </div>
    </button>
  );
}
