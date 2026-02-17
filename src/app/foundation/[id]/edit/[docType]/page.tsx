'use client';

import { useEffect, useState, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import type { FoundationDocument, FoundationDocType } from '@/types';
import { DOC_CONFIG } from '../../foundation-config';
import { StreamParser } from '@/lib/parse-stream';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface PageProps {
  params: Promise<{ id: string; docType: string }>;
}

const MAX_MESSAGES_TO_SEND = 20;

export default function FoundationEditorPage({ params }: PageProps) {
  const { id: ideaId, docType: docTypeParam } = use(params);
  const router = useRouter();
  const docType = docTypeParam as FoundationDocType;
  const config = DOC_CONFIG.find((c) => c.type === docType);

  const [content, setContent] = useState('');
  const [savedContent, setSavedContent] = useState('');
  const [previousContent, setPreviousContent] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [chatInput, setChatInput] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const hasUnsavedChanges = content !== savedContent;

  // Fetch foundation doc on mount
  useEffect(() => {
    async function fetchDoc() {
      try {
        const res = await fetch(`/api/foundation/${ideaId}`);
        if (!res.ok) throw new Error('Failed to fetch');
        const data = await res.json();
        const doc: FoundationDocument | undefined = data.docs?.[docType];
        if (!doc) {
          router.replace(`/foundation/${ideaId}`);
          return;
        }
        setContent(doc.content);
        setSavedContent(doc.content);
      } catch {
        setError('Failed to load document');
      } finally {
        setLoading(false);
      }
    }
    fetchDoc();
  }, [ideaId, docType, router]);

  // Warn on navigate away with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges]);

  // Auto-scroll chat
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/foundation/${ideaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, content }),
      });
      if (!res.ok) throw new Error('Save failed');
      setSavedContent(content);
    } catch {
      setError('Failed to save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  }, [ideaId, docType, content]);

  const handleSend = useCallback(async () => {
    const message = chatInput.trim();
    if (!message || isStreaming) return;

    setChatInput('');
    const userMessage: ChatMessage = { role: 'user', content: message };
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setIsStreaming(true);
    setError(null);

    // Send only last N messages to API
    const messagesToSend = updatedMessages.slice(-MAX_MESSAGES_TO_SEND);

    try {
      const res = await fetch(`/api/foundation/${ideaId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ docType, messages: messagesToSend, currentContent: content }),
      });

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || 'Chat request failed');
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const parser = new StreamParser();
      let chatText = '';

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const result = parser.processChunk(chunk);
        chatText += result.chatText;

        // Update assistant message in real-time
        const currentChatText = chatText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: currentChatText };
          return updated;
        });

        // If document content arrived, update editor
        if (result.documentContent !== null) {
          setContent((currentContent) => {
            setPreviousContent(currentContent);
            return result.documentContent!;
          });
        }
      }

      const finalResult = parser.finalize();
      if (finalResult.error) {
        chatText += `\n\n_${finalResult.error}_`;
        const finalChatText = chatText;
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = { role: 'assistant', content: finalChatText };
          return updated;
        });
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to get response';
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `_Error: ${errorMsg}. Please try again._` },
      ]);
    } finally {
      setIsStreaming(false);
    }
  }, [chatInput, isStreaming, messages, ideaId, docType, content]);

  const handleRevert = useCallback(() => {
    if (previousContent !== null) {
      setContent(previousContent);
      setPreviousContent(null);
    }
  }, [previousContent]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4rem' }}>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>Loading...</span>
      </div>
    );
  }

  const truncationIndex = messages.length > MAX_MESSAGES_TO_SEND
    ? messages.length - MAX_MESSAGES_TO_SEND
    : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 8rem)' }}>
      {/* Toolbar */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '0.75rem 0', borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '0.75rem', flexShrink: 0,
      }}>
        <div>
          <Link
            href={`/foundation/${ideaId}`}
            style={{
              fontSize: '0.8125rem', color: 'var(--text-muted)', textDecoration: 'none',
              display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            ← Back to overview
          </Link>
          <h1 style={{
            fontFamily: 'var(--font-display)', fontWeight: 500, fontSize: '1.25rem',
            letterSpacing: '-0.02em', color: 'var(--text-primary)', margin: '0.25rem 0 0',
          }}>
            {config?.label || docType} — {config?.advisor || 'Advisor'}
          </h1>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {previousContent !== null && previousContent !== content && (
            <button
              className="btn btn-ghost btn-sm"
              onClick={handleRevert}
              style={{ fontSize: '0.8125rem' }}
            >
              Revert last AI change
            </button>
          )}
          {error && (
            <span style={{ fontSize: '0.75rem', color: 'var(--color-danger)' }}>{error}</span>
          )}
          <button
            className="btn btn-primary btn-sm"
            onClick={handleSave}
            disabled={isSaving || !hasUnsavedChanges}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}
          >
            {isSaving ? 'Saving...' : 'Save'}
            {hasUnsavedChanges && !isSaving && (
              <span style={{
                width: 6, height: 6, borderRadius: '50%',
                background: 'var(--accent-coral)', display: 'inline-block',
              }} />
            )}
          </button>
        </div>
      </div>

      {/* Split panes */}
      <div style={{ flex: 1, display: 'flex', gap: '1rem', minHeight: 0 }}>
        {/* Left pane — Document Editor */}
        <div style={{ flex: '0 0 60%', display: 'flex', flexDirection: 'column' }}>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            style={{
              flex: 1, width: '100%', resize: 'none',
              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
              fontSize: '0.8125rem', lineHeight: 1.6,
              padding: '1rem', border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)', background: 'var(--bg-card)',
              color: 'var(--text-primary)', outline: 'none',
            }}
            spellCheck={false}
          />
        </div>

        {/* Right pane — Advisor Chat */}
        <div style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)',
          background: 'var(--bg-card)', overflow: 'hidden',
        }}>
          {/* Messages */}
          <div
            ref={chatContainerRef}
            style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}
          >
            {messages.length === 0 && (
              <p style={{
                color: 'var(--text-muted)', fontSize: '0.8125rem',
                textAlign: 'center', paddingTop: '2rem',
              }}>
                Ask {config?.advisor || 'the advisor'} to help refine your document.
              </p>
            )}
            {messages.map((msg, i) => (
              <div key={i} style={{ marginBottom: '1rem' }}>
                {truncationIndex > 0 && i === 0 && i < truncationIndex && (
                  <div style={{
                    fontSize: '0.6875rem', color: 'var(--text-muted)',
                    textAlign: 'center', padding: '0.5rem', marginBottom: '0.5rem',
                    background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)',
                  }}>
                    Earlier messages not sent to advisor
                  </div>
                )}
                <div style={{
                  fontSize: '0.8125rem',
                  color: i < truncationIndex ? 'var(--text-muted)' : 'var(--text-primary)',
                  opacity: i < truncationIndex ? 0.6 : 1,
                }}>
                  <span style={{
                    fontWeight: 600, fontSize: '0.6875rem',
                    textTransform: 'uppercase' as const, letterSpacing: '0.05em',
                    color: msg.role === 'user' ? 'var(--accent-coral)' : 'var(--text-muted)',
                  }}>
                    {msg.role === 'user' ? 'You' : config?.advisor || 'Advisor'}
                  </span>
                  <div style={{ marginTop: '0.25rem', whiteSpace: 'pre-wrap' }}>
                    {msg.content}
                    {isStreaming && i === messages.length - 1 && msg.role === 'assistant' && (
                      <span style={{
                        display: 'inline-block', width: 6, height: 14,
                        background: 'var(--text-muted)', marginLeft: 2,
                        animation: 'pulse 1s ease-in-out infinite',
                      }} />
                    )}
                  </div>
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            style={{
              display: 'flex', gap: '0.5rem', padding: '0.75rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            <input
              type="text"
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder={isStreaming ? 'Waiting for response...' : 'Type a message...'}
              disabled={isStreaming}
              style={{
                flex: 1, padding: '0.5rem 0.75rem', fontSize: '0.8125rem',
                border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-sm)',
                background: 'var(--bg-elevated)', color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              type="submit"
              className="btn btn-primary btn-sm"
              disabled={isStreaming || !chatInput.trim()}
            >
              Send
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
