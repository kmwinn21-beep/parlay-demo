'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  error?: boolean;
}

const WELCOME_MESSAGE: Message = {
  id: 'welcome',
  role: 'assistant',
  content: "Hi! I'm Parlay AI. I can help you understand how Parlay works, explain metrics and scores, or walk you through any feature. What would you like to know?",
  timestamp: new Date(),
};

const SUGGESTIONS = [
  'What is a health score?',
  'How does Target Recommendations work?',
  "What's the difference between a touchpoint and a meeting?",
];

const MAX_PAIRS = 20;
const TIMEOUT_MS = 15000;

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 10) return 'just now';
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  return `${diffHr}h ago`;
}

function LoadingDots() {
  return (
    <div className="flex items-center gap-1 px-1 py-1">
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className="w-2 h-2 rounded-full bg-gray-400 animate-bounce"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

export function HelpChatDrawer({
  onClose,
  onUnread,
}: {
  onClose: () => void;
  onUnread: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastUserMsg, setLastUserMsg] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const userPairs = Math.floor(messages.filter(m => m.role === 'user').length);
  const atLimit = userPairs >= MAX_PAIRS;

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading || atLimit) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setLastUserMsg(trimmed);

    // Build history (exclude welcome and error messages for API)
    const history = [...messages.filter(m => m.id !== 'welcome' && !m.error), userMsg]
      .map(m => ({ role: m.role, content: m.content }));

    abortRef.current = new AbortController();
    const timeoutId = setTimeout(() => abortRef.current?.abort('timeout'), TIMEOUT_MS);

    try {
      const res = await fetch('/api/help-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history }),
        signal: abortRef.current.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) throw new Error('api_error');

      const data = await res.json() as { content: string };
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.content,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
      onUnread();
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isTimeout = (err instanceof Error && err.message === 'timeout') ||
        (typeof err === 'string' && err === 'timeout') ||
        (err instanceof DOMException && err.name === 'AbortError');

      const errorMsg: Message = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: isTimeout
          ? 'This is taking longer than expected. Please try again.'
          : "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
        error: true,
      };
      setMessages(prev => [...prev, errorMsg]);
      onUnread();
    } finally {
      setLoading(false);
    }
  }, [loading, atLimit, messages, onUnread]);

  const handleRetry = () => {
    if (lastUserMsg) {
      // Remove last error message and retry
      setMessages(prev => {
        const lastIdx = [...prev].reverse().findIndex(m => m.error);
        if (lastIdx === -1) return prev;
        const idx = prev.length - 1 - lastIdx;
        return prev.slice(0, idx);
      });
      sendMessage(lastUserMsg);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const showSuggestions = messages.length === 1; // only welcome message

  return (
    <>
      <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div className="fixed inset-0 z-50">
        {/* Backdrop */}
        <div className="absolute inset-0 bg-black/40" onClick={onClose} />

        {/* Drawer panel */}
        <div
          className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[420px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                <span className="text-white text-xs font-bold">AI</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-gray-800">Parlay AI</h3>
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  <p className="text-xs text-gray-500">Online</p>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              aria-label="Close"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Message list */}
          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-2`}>
                {msg.role === 'assistant' && (
                  <div className="w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0 mb-4">
                    <span className="text-white text-[9px] font-bold">AI</span>
                  </div>
                )}
                <div className={`max-w-[80%] ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div
                    className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-brand-primary text-white rounded-br-sm'
                        : msg.error
                          ? 'bg-red-50 text-gray-700 border border-red-100 rounded-bl-sm'
                          : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}
                  >
                    {msg.content}
                    {msg.error && (
                      <button
                        onClick={handleRetry}
                        className="mt-2 block text-xs text-brand-secondary hover:underline font-medium"
                      >
                        Retry
                      </button>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 px-1">{relativeTime(msg.timestamp)}</span>

                  {/* Suggestion chips after welcome */}
                  {msg.id === 'welcome' && showSuggestions && (
                    <div className="flex flex-col gap-1.5 mt-1 w-full">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => sendMessage(s)}
                          disabled={loading}
                          className="text-left text-xs px-3 py-1.5 rounded-xl border border-gray-200 hover:border-brand-secondary hover:bg-blue-50 hover:text-brand-secondary text-gray-600 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Loading dots */}
            {loading && (
              <div className="flex justify-start items-end gap-2">
                <div className="w-6 h-6 rounded-full bg-brand-primary flex items-center justify-center flex-shrink-0">
                  <span className="text-white text-[9px] font-bold">AI</span>
                </div>
                <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-3 py-2">
                  <LoadingDots />
                </div>
              </div>
            )}

            {/* Limit notice */}
            {atLimit && (
              <p className="text-center text-xs text-gray-400 py-2">
                Start a new conversation to continue
              </p>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input bar */}
          <div className="border-t border-gray-200 px-4 py-3 flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask anything about Parlay…"
                disabled={loading || atLimit}
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-secondary focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ maxHeight: 120, overflowY: 'auto' }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
                }}
              />
              <button
                type="button"
                onClick={() => sendMessage(input)}
                disabled={!input.trim() || loading || atLimit}
                className="flex-shrink-0 w-9 h-9 rounded-xl bg-brand-primary hover:bg-brand-secondary disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
                aria-label="Send"
              >
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
