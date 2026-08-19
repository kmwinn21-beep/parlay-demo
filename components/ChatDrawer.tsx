'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { useChatPanel } from '@/components/ChatPanelContext';
import {
  Avatar,
  GroupAvatar,
  getDisplayName,
  targetKey,
  targetName,
  type ChatTarget,
  type GroupMessage,
  type Message,
} from '@/components/chatCommon';

/** Both message shapes render the same bubble; only groups carry a sender label. */
interface Bubble {
  id: number;
  content: string;
  mine: boolean;
  senderName?: string;
}

const POLL_MS = 8000;

/**
 * The one open conversation, in the site's standard right-side drawer — same
 * slide-in, same rounded leading corner, same left-edge drag to resize (420
 * default, 200–750). Minimising leaves it on the bottom bar; closing takes the
 * bar down too.
 */
export function ChatDrawer({ target }: { target: ChatTarget }) {
  const { exitChat, minimizeChat, refresh } = useChatPanel();
  const { panelStyle, handleResizeStart } = useDrawerResize(420, 200, 750);

  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const key = targetKey(target);
  const name = targetName(target);
  const endpoint = target.kind === 'dm'
    ? `/api/chat/messages?with=${target.user.id}`
    : `/api/chat/groups/${target.group.id}/messages`;

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(endpoint);
      if (!res.ok) return;
      const data = await res.json() as (Message | GroupMessage)[];
      setBubbles(data.map(m => ({
        id: m.id,
        content: m.content,
        mine: m.mine,
        senderName: 'senderName' in m ? m.senderName : undefined,
      })));
    } catch { /* silently ignore */ }
  }, [endpoint]);

  // Re-keyed on the conversation so switching threads clears the old messages
  // instead of flashing them under the new header.
  useEffect(() => {
    setBubbles([]);
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    const id = setInterval(fetchMessages, POLL_MS);
    return () => clearInterval(id);
  }, [fetchMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [bubbles]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = text ? `${Math.min(el.scrollHeight, 120)}px` : '';
  }, [text]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    if (textareaRef.current) textareaRef.current.style.height = '';
    try {
      const res = await fetch(
        target.kind === 'dm' ? '/api/chat/messages' : `/api/chat/groups/${target.group.id}/messages`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            target.kind === 'dm'
              ? { receiverId: target.user.id, content: text.trim() }
              : { content: text.trim() },
          ),
        },
      );
      if (!res.ok) return;
      const msg = await res.json() as Message | GroupMessage;
      setBubbles(prev => [...prev, {
        id: msg.id,
        content: msg.content,
        mine: true,
        senderName: 'senderName' in msg ? msg.senderName : undefined,
      }]);
      setText('');
      refresh();
    } catch { /* silently ignore */ } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={minimizeChat} />
      <div
        key={key}
        className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[420px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          {target.kind === 'dm'
            ? <Avatar name={getDisplayName(target.user.email, target.user.displayName)} size="sm" />
            : <GroupAvatar />}
          <span className="flex-1 font-semibold text-sm text-gray-800 truncate">{name}</span>
          <button
            type="button"
            onClick={minimizeChat}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Minimize"
            aria-label="Minimize chat"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          <button
            type="button"
            onClick={exitChat}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
            title="Close"
            aria-label="Close chat"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-1.5 bg-gray-50">
          {loading && (
            <div className="flex justify-center items-center h-full">
              <div className="w-5 h-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
            </div>
          )}
          {!loading && bubbles.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8">No messages yet. Say hello!</p>
          )}
          {!loading && bubbles.map(msg => (
            <div key={msg.id} className={`flex flex-col ${msg.mine ? 'items-end' : 'items-start'}`}>
              {!msg.mine && msg.senderName && (
                <p className="text-[10px] text-gray-400 mb-0.5 ml-1">{msg.senderName}</p>
              )}
              <div className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                msg.mine
                  ? 'bg-brand-secondary text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm'
              }`}>
                {msg.content}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-3 py-3 bg-white border-t border-gray-200 flex items-end gap-2 flex-shrink-0">
          <textarea
            ref={textareaRef}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message…"
            rows={1}
            className="flex-1 resize-none rounded-2xl border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-brand-secondary text-gray-800 placeholder-gray-400 overflow-hidden"
            style={{ lineHeight: '1.4' }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-brand-secondary text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
            title="Send"
            aria-label="Send message"
          >
            <svg className="w-4 h-4 -rotate-90" fill="currentColor" viewBox="0 0 24 24">
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
            </svg>
          </button>
        </div>
      </div>
    </>
  );
}
