'use client';

import { useEffect, useRef, useState, useCallback, FormEvent } from 'react';
import { useUser } from '@/components/UserContext';

interface Conversation {
  id: number;
  partner_id: number;
  partner_name: string;
  partner_email: string;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: number | null;
  created_at: string;
}

interface ChatMessage {
  id: number;
  conversation_id: number;
  sender_id: number;
  content: string;
  created_at: string;
  sender_email: string;
  sender_name: string;
}

interface OtherUser {
  id: number;
  email: string;
  display_name: string | null;
}

function initials(name: string): string {
  const parts = name.split(/[\s@]+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(d);
  } catch {
    return '';
  }
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z');
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const msgDay = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diff = (today.getTime() - msgDay.getTime()) / 86400000;
    if (diff < 1) return 'Today';
    if (diff < 2) return 'Yesterday';
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(d);
  } catch {
    return '';
  }
}

export default function ChatPage() {
  const { user } = useUser();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingConvs, setLoadingConvs] = useState(true);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [otherUsers, setOtherUsers] = useState<OtherUser[]>([]);
  const [userSearch, setUserSearch] = useState('');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const latestMsgIdRef = useRef<number>(0);
  const sseRef = useRef<EventSource | null>(null);
  const activeConvIdRef = useRef<number | null>(null);

  // Keep ref in sync for SSE callback
  activeConvIdRef.current = activeConvId;

  // Scroll to bottom of messages
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  // Load conversations
  const loadConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data: Conversation[] = await res.json();
      setConversations(data);
    } catch {}
  }, []);

  useEffect(() => {
    loadConversations().finally(() => setLoadingConvs(false));
  }, [loadConversations]);

  // Load messages for active conversation
  useEffect(() => {
    if (activeConvId === null) { setMessages([]); return; }
    setLoadingMsgs(true);
    setMessages([]);
    fetch(`/api/chat/conversations/${activeConvId}/messages`)
      .then((r) => (r.ok ? r.json() : []))
      .then((data: ChatMessage[]) => {
        setMessages(data);
        if (data.length > 0) {
          const maxId = Math.max(...data.map((m) => m.id));
          if (maxId > latestMsgIdRef.current) latestMsgIdRef.current = maxId;
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMsgs(false));
  }, [activeConvId]);

  // Scroll to bottom when messages load or change
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // SSE connection
  useEffect(() => {
    if (!user) return;

    const connect = () => {
      const es = new EventSource(`/api/chat/stream?lastId=${latestMsgIdRef.current}`);
      sseRef.current = es;

      es.addEventListener('message', (e) => {
        try {
          const msg: ChatMessage = JSON.parse(e.data);
          if (msg.id > latestMsgIdRef.current) latestMsgIdRef.current = msg.id;

          // Append to active conversation if it matches
          if (msg.conversation_id === activeConvIdRef.current) {
            setMessages((prev) => {
              if (prev.find((m) => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }

          // Update conversation list preview
          setConversations((prev) => {
            const updated = prev.map((c) =>
              c.id === msg.conversation_id
                ? { ...c, last_message: msg.content, last_message_at: msg.created_at, last_sender_id: msg.sender_id }
                : c
            );
            // Bubble conversation to top
            const idx = updated.findIndex((c) => c.id === msg.conversation_id);
            if (idx > 0) {
              const [conv] = updated.splice(idx, 1);
              updated.unshift(conv);
            }
            return updated;
          });
        } catch {}
      });

      es.onerror = () => {
        es.close();
        // Reconnect after 3 seconds
        setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      sseRef.current?.close();
      sseRef.current = null;
    };
  }, [user]);

  // Load all users for new chat modal
  useEffect(() => {
    if (!showNewChat) return;
    fetch('/api/chat/users')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: OtherUser[]) => setOtherUsers(data))
      .catch(() => {});
  }, [showNewChat, user?.id]);

  const startConversation = async (partnerId: number) => {
    try {
      const res = await fetch('/api/chat/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ partner_id: partnerId }),
      });
      if (!res.ok) return;
      const conv: Conversation = await res.json();
      setConversations((prev) => {
        const existing = prev.find((c) => c.id === conv.id);
        if (existing) return prev;
        return [conv, ...prev];
      });
      setActiveConvId(conv.id);
      setShowNewChat(false);
      setUserSearch('');
    } catch {}
  };

  const sendMessage = async (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || !activeConvId || sending) return;
    const text = input.trim();
    setInput('');
    setSending(true);

    // Optimistic update
    const tempId = -Date.now();
    const tempMsg: ChatMessage = {
      id: tempId,
      conversation_id: activeConvId,
      sender_id: user!.id,
      content: text,
      created_at: new Date().toISOString(),
      sender_email: user!.email,
      sender_name: user!.displayName ?? user!.email,
    };
    setMessages((prev) => [...prev, tempMsg]);

    try {
      const res = await fetch(`/api/chat/conversations/${activeConvId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: text }),
      });
      if (res.ok) {
        const saved: ChatMessage = await res.json();
        // Replace temp with real
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? saved : m))
        );
        if (saved.id > latestMsgIdRef.current) latestMsgIdRef.current = saved.id;
        // Update conversation preview
        setConversations((prev) =>
          prev.map((c) =>
            c.id === activeConvId
              ? { ...c, last_message: saved.content, last_message_at: saved.created_at, last_sender_id: saved.sender_id }
              : c
          )
        );
      } else {
        // Remove temp on failure
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
      }
    } catch {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(e as unknown as FormEvent);
    }
  };

  const activeConv = conversations.find((c) => c.id === activeConvId);

  const filteredUsers = otherUsers.filter((u) => {
    const q = userSearch.toLowerCase();
    return (
      u.email.toLowerCase().includes(q) ||
      (u.display_name ?? '').toLowerCase().includes(q)
    );
  });

  // Group messages by date for dividers
  type MessageGroup = { date: string; messages: ChatMessage[] };
  const grouped: MessageGroup[] = messages.reduce<MessageGroup[]>((acc, msg) => {
    const d = formatDate(msg.created_at);
    const last = acc[acc.length - 1];
    if (!last || last.date !== d) {
      acc.push({ date: d, messages: [msg] });
    } else {
      last.messages.push(msg);
    }
    return acc;
  }, []);

  return (
    <div className="flex h-[calc(100vh-120px)] lg:h-[calc(100vh-96px)] bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
      {/* ── Sidebar: conversation list ── */}
      <div className={`w-full lg:w-72 xl:w-80 flex-shrink-0 border-r border-gray-200 flex flex-col ${activeConvId !== null ? 'hidden lg:flex' : 'flex'}`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <h1 className="text-lg font-semibold text-gray-900">Messages</h1>
          <button
            onClick={() => setShowNewChat(true)}
            className="w-8 h-8 rounded-full bg-brand-primary text-white flex items-center justify-center hover:opacity-80 transition-opacity"
            title="New conversation"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto">
          {loadingConvs ? (
            <div className="p-4 text-sm text-gray-400 text-center">Loading...</div>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center">
              <svg className="w-10 h-10 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm text-gray-400">No conversations yet.</p>
              <button
                onClick={() => setShowNewChat(true)}
                className="mt-2 text-sm text-brand-primary hover:underline"
              >
                Start one
              </button>
            </div>
          ) : (
            conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => setActiveConvId(conv.id)}
                className={`w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100 ${
                  activeConvId === conv.id ? 'bg-blue-50 border-l-4 border-l-brand-primary' : ''
                }`}
              >
                <div className="w-9 h-9 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {initials(conv.partner_name)}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{conv.partner_name}</p>
                  {conv.last_message && (
                    <p className="text-xs text-gray-400 truncate">
                      {conv.last_sender_id === user?.id ? 'You: ' : ''}{conv.last_message}
                    </p>
                  )}
                </div>
                {conv.last_message_at && (
                  <span className="text-[10px] text-gray-400 flex-shrink-0">{formatTime(conv.last_message_at)}</span>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* ── Main: message thread ── */}
      <div className={`flex-1 flex flex-col min-w-0 ${activeConvId === null ? 'hidden lg:flex' : 'flex'}`}>
        {activeConvId === null ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <svg className="w-14 h-14 text-gray-200 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <p className="text-gray-400 text-sm">Select a conversation or start a new one.</p>
            <button
              onClick={() => setShowNewChat(true)}
              className="mt-4 px-4 py-2 bg-brand-primary text-white text-sm rounded-lg hover:opacity-80 transition-opacity"
            >
              New Message
            </button>
          </div>
        ) : (
          <>
            {/* Thread header */}
            <div className="px-4 py-3 border-b border-gray-200 flex items-center gap-3">
              <button
                onClick={() => setActiveConvId(null)}
                className="lg:hidden p-1.5 text-gray-400 hover:text-gray-600 rounded"
                aria-label="Back"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {activeConv ? initials(activeConv.partner_name) : '?'}
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">{activeConv?.partner_name ?? '...'}</p>
                <p className="text-xs text-gray-400">{activeConv?.partner_email}</p>
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1">
              {loadingMsgs ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">Loading...</div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center h-full text-sm text-gray-400">
                  No messages yet. Say hello!
                </div>
              ) : (
                grouped.map((group) => (
                  <div key={group.date}>
                    {/* Date divider */}
                    <div className="flex items-center gap-3 my-4">
                      <div className="flex-1 h-px bg-gray-200" />
                      <span className="text-xs text-gray-400 font-medium">{group.date}</span>
                      <div className="flex-1 h-px bg-gray-200" />
                    </div>
                    {group.messages.map((msg, i) => {
                      const isMine = msg.sender_id === user?.id;
                      const isTemp = msg.id < 0;
                      const prevMsg = group.messages[i - 1];
                      const showAvatar = !isMine && prevMsg?.sender_id !== msg.sender_id;

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'} mb-1`}
                        >
                          {/* Avatar placeholder to maintain alignment */}
                          <div className="w-7 flex-shrink-0">
                            {!isMine && showAvatar && (
                              <div className="w-7 h-7 rounded-full bg-gray-300 flex items-center justify-center text-white text-[10px] font-bold">
                                {initials(msg.sender_name)}
                              </div>
                            )}
                          </div>

                          <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                            <div
                              className={`px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                                isMine
                                  ? 'bg-brand-primary text-white rounded-br-sm'
                                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
                              } ${isTemp ? 'opacity-60' : ''}`}
                            >
                              {msg.content}
                            </div>
                            <span className="text-[10px] text-gray-400 mt-0.5 px-1">
                              {formatTime(msg.created_at)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form onSubmit={sendMessage} className="p-3 border-t border-gray-200 flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Message… (Enter to send, Shift+Enter for newline)"
                rows={1}
                className="flex-1 resize-none rounded-xl border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-primary focus:border-transparent min-h-[40px] max-h-32 overflow-y-auto"
                style={{ height: 'auto' }}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = 'auto';
                  t.style.height = `${Math.min(t.scrollHeight, 128)}px`;
                }}
              />
              <button
                type="submit"
                disabled={!input.trim() || sending}
                className="w-9 h-9 rounded-full bg-brand-primary text-white flex items-center justify-center hover:opacity-80 transition-opacity disabled:opacity-40 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </form>
          </>
        )}
      </div>

      {/* ── New conversation modal ── */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 flex flex-col max-h-[80vh]">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-base font-semibold text-gray-900">New Message</h2>
              <button
                onClick={() => { setShowNewChat(false); setUserSearch(''); }}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-3 border-b border-gray-100">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => setUserSearch(e.target.value)}
                placeholder="Search team members..."
                autoFocus
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-primary"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {filteredUsers.length === 0 ? (
                <p className="p-4 text-sm text-gray-400 text-center">No users found.</p>
              ) : (
                filteredUsers.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => startConversation(u.id)}
                    className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors border-b border-gray-100"
                  >
                    <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                      {initials(u.display_name ?? u.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">
                        {u.display_name ?? u.email.split('@')[0]}
                      </p>
                      <p className="text-xs text-gray-400 truncate">{u.email}</p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
