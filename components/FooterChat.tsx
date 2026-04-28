'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useUser } from '@/components/UserContext';
import { useChatPanel } from '@/components/ChatPanelContext';

interface ChatUser {
  id: number;
  email: string;
  displayName: string | null;
}

interface Conversation {
  otherId: number;
  otherEmail: string;
  otherDisplayName: string | null;
  lastContent: string;
  lastCreatedAt: string;
  lastSenderId: number;
  unreadCount: number;
}

interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
}

function getDisplayName(email: string, displayName: string | null): string {
  return displayName || email.split('@')[0];
}

function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

function formatTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffDays === 0) return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Avatar circle with color based on name
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xfffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${cls} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

// Individual chat window (can have multiple open)
function ChatWindow({
  other,
  currentUserId,
  onClose,
  onNewMessage,
}: {
  other: ChatUser;
  currentUserId: number;
  onClose: () => void;
  onNewMessage: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const name = getDisplayName(other.email, other.displayName);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/chat/messages?with=${other.id}`);
      if (!res.ok) return;
      const data = await res.json() as Message[];
      setMessages(data);
    } catch { /* silently ignore */ }
  }, [other.id]);

  useEffect(() => {
    setLoading(true);
    fetchMessages().finally(() => setLoading(false));
    // Poll for new messages every 8 seconds
    pollRef.current = setInterval(fetchMessages, 8000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [fetchMessages]);

  useEffect(() => {
    if (!minimized) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, minimized]);

  const handleSend = async () => {
    if (!text.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ receiverId: other.id, content: text.trim() }),
      });
      if (!res.ok) return;
      const msg = await res.json() as Message;
      setMessages(prev => [...prev, msg]);
      setText('');
      onNewMessage();
    } catch { /* silently ignore */ } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col w-[420px] bg-white rounded-t-xl shadow-2xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center gap-2 px-3 py-2.5 bg-white border-b border-gray-100 cursor-pointer select-none"
        onClick={() => setMinimized(v => !v)}
      >
        <Avatar name={name} size="sm" />
        <span className="flex-1 font-semibold text-sm text-gray-800 truncate">{name}</span>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); setMinimized(v => !v); }}
          className="text-gray-400 hover:text-gray-600 p-0.5"
          title={minimized ? 'Expand' : 'Minimize'}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={minimized ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'} />
          </svg>
        </button>
        <button
          type="button"
          onClick={e => { e.stopPropagation(); onClose(); }}
          className="text-gray-400 hover:text-gray-600 p-0.5"
          title="Close"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {!minimized && (
        <>
          {/* Messages */}
          <div className="flex-1 h-64 overflow-y-auto px-3 py-2 space-y-1.5 bg-gray-50">
            {loading && (
              <div className="flex justify-center items-center h-full">
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
              </div>
            )}
            {!loading && messages.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-8">No messages yet. Say hello!</p>
            )}
            {!loading && messages.map(msg => (
              <div key={msg.id} className={`flex ${msg.mine ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-2xl text-sm leading-snug break-words ${
                    msg.mine
                      ? 'bg-brand-secondary text-white rounded-br-sm'
                      : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm shadow-sm'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}
            <div ref={bottomRef} />
          </div>

          {/* Input */}
          <div className="px-2 py-2 bg-white border-t border-gray-100 flex items-end gap-1.5">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={e => setText(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Write a message…"
              rows={1}
              className="flex-1 resize-none rounded-full border border-gray-200 px-3 py-1.5 text-sm focus:outline-none focus:border-brand-secondary text-gray-800 placeholder-gray-400 max-h-24 overflow-y-auto"
              style={{ lineHeight: '1.4' }}
            />
            <button
              type="button"
              onClick={handleSend}
              disabled={!text.trim() || sending}
              className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-full bg-brand-secondary text-white disabled:opacity-40 hover:opacity-90 transition-opacity"
              title="Send"
            >
              <svg className="w-4 h-4 rotate-90" fill="currentColor" viewBox="0 0 24 24">
                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
              </svg>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// The main footer messaging hub
export function FooterChat() {
  const { user, loading: userLoading } = useUser();
  const { panelOpen, setPanelOpen } = useChatPanel();
  const [view, setView] = useState<'conversations' | 'new'>('conversations');
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [openChats, setOpenChats] = useState<ChatUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [convLoading, setConvLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const totalUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      const data = await res.json() as Conversation[];
      setConversations(data);
    } catch { /* silently ignore */ }
  }, []);

  // Load conversations when panel opens; poll for updates
  useEffect(() => {
    if (!user) return;
    fetchConversations();
    pollRef.current = setInterval(fetchConversations, 10000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [user, fetchConversations]);

  const openChat = useCallback(async (other: ChatUser) => {
    setOpenChats(prev => {
      if (prev.find(c => c.id === other.id)) return prev;
      // Cap at 3 open windows
      const next = prev.length >= 3 ? prev.slice(1) : prev;
      return [...next, other];
    });
    setPanelOpen(false);
    // Optimistically clear unread badge
    setConversations(prev => prev.map(c => c.otherId === other.id ? { ...c, unreadCount: 0 } : c));
  }, []);

  const openChatFromConversation = useCallback((conv: Conversation) => {
    openChat({ id: conv.otherId, email: conv.otherEmail, displayName: conv.otherDisplayName });
  }, [openChat]);

  const closeChat = useCallback((userId: number) => {
    setOpenChats(prev => prev.filter(c => c.id !== userId));
  }, []);

  const handleNewMessageSent = useCallback(() => {
    fetchConversations();
  }, [fetchConversations]);

  const loadUsers = useCallback(async () => {
    if (allUsers.length > 0) return;
    try {
      const res = await fetch('/api/chat/users');
      if (!res.ok) return;
      setAllUsers(await res.json() as ChatUser[]);
    } catch { /* silently ignore */ }
  }, [allUsers.length]);

  const handleOpenNewPanel = () => {
    setView('new');
    loadUsers();
  };

  const filteredUsers = userSearch.trim()
    ? allUsers.filter(u => {
        const name = getDisplayName(u.email, u.displayName).toLowerCase();
        return name.includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
      })
    : allUsers;

  // Don't render for unauthenticated users
  if (userLoading || !user) return null;

  return (
    <>
      {/* Mobile bottom-sheet overlay */}
      {panelOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/30" onClick={() => setPanelOpen(false)} />
          {/* Sheet */}
          <div className="relative bg-white rounded-t-2xl shadow-2xl flex flex-col max-h-[80vh]">
            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              {view === 'new' ? (
                <button
                  type="button"
                  onClick={() => { setView('conversations'); setUserSearch(''); }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-brand-secondary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  New Message
                </button>
              ) : (
                <span className="text-sm font-semibold text-gray-800">Messaging</span>
              )}
              <div className="flex items-center gap-1">
                {view === 'conversations' && (
                  <button
                    type="button"
                    onClick={handleOpenNewPanel}
                    className="p-1.5 text-gray-500 hover:text-brand-secondary hover:bg-gray-100 rounded-full transition-colors"
                    title="New message"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* New message search */}
            {view === 'new' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search teammates…"
                    autoFocus
                    className="w-full text-sm border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:border-brand-secondary"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No teammates found.</p>
                  )}
                  {filteredUsers.map(u => {
                    const name = getDisplayName(u.email, u.displayName);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { openChat(u); setView('conversations'); setUserSearch(''); }}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors"
                      >
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversations list */}
            {view === 'conversations' && (
              <div className="flex-1 overflow-y-auto">
                {conversations.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                    <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm text-gray-400">No conversations yet.</p>
                    <button
                      type="button"
                      onClick={handleOpenNewPanel}
                      className="mt-2 text-xs text-brand-secondary hover:underline font-medium"
                    >
                      Start one
                    </button>
                  </div>
                )}
                {conversations.map(conv => {
                  const name = getDisplayName(conv.otherEmail, conv.otherDisplayName);
                  const isMe = conv.lastSenderId === user.id;
                  return (
                    <button
                      key={conv.otherId}
                      type="button"
                      onClick={() => { openChatFromConversation(conv); setPanelOpen(false); }}
                      className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 text-left transition-colors border-b border-gray-50 last:border-0"
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar name={name} size="sm" />
                        {conv.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-secondary text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                            {name}
                          </p>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                            {formatTime(conv.lastCreatedAt)}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                          {isMe ? 'You: ' : ''}{conv.lastContent}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mobile chat windows (open from conversations) */}
      {openChats.map(other => (
        <div key={other.id} className="lg:hidden fixed inset-0 z-[60] flex flex-col justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => closeChat(other.id)} />
          <div className="relative">
            <ChatWindow
              other={other}
              currentUserId={user.id}
              onClose={() => closeChat(other.id)}
              onNewMessage={handleNewMessageSent}
            />
          </div>
        </div>
      ))}

      {/* Desktop layout */}
      <div className="hidden lg:flex fixed bottom-0 right-4 z-50 flex-row-reverse items-end gap-2">
      {/* Open chat windows */}
      {openChats.map(other => (
        <ChatWindow
          key={other.id}
          other={other}
          currentUserId={user.id}
          onClose={() => closeChat(other.id)}
          onNewMessage={handleNewMessageSent}
        />
      ))}

      {/* Messaging hub panel + tab */}
      <div className="flex flex-col items-end">
        {/* Expanded panel */}
        {panelOpen && (
          <div className="mb-0 w-[420px] bg-white rounded-t-xl shadow-2xl border border-gray-200 border-b-0 flex flex-col max-h-[420px]">
            {/* Panel header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              {view === 'new' ? (
                <button
                  type="button"
                  onClick={() => { setView('conversations'); setUserSearch(''); }}
                  className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-brand-secondary"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  New Message
                </button>
              ) : (
                <span className="text-sm font-semibold text-gray-800">Messaging</span>
              )}
              <div className="flex items-center gap-1">
                {view === 'conversations' && (
                  <button
                    type="button"
                    onClick={handleOpenNewPanel}
                    className="p-1.5 text-gray-500 hover:text-brand-secondary hover:bg-gray-100 rounded-full transition-colors"
                    title="New message"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPanelOpen(false)}
                  className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors"
                  title="Close"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
            </div>

            {/* New message — user search */}
            {view === 'new' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={e => setUserSearch(e.target.value)}
                    placeholder="Search teammates…"
                    autoFocus
                    className="w-full text-sm border border-gray-200 rounded-full px-3 py-1.5 focus:outline-none focus:border-brand-secondary"
                  />
                </div>
                <div className="flex-1 overflow-y-auto">
                  {filteredUsers.length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-6">No teammates found.</p>
                  )}
                  {filteredUsers.map(u => {
                    const name = getDisplayName(u.email, u.displayName);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => { openChat(u); setView('conversations'); setUserSearch(''); }}
                        className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                      >
                        <Avatar name={name} size="sm" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Conversations list */}
            {view === 'conversations' && (
              <div className="flex-1 overflow-y-auto">
                {convLoading && (
                  <div className="flex justify-center py-8">
                    <div className="w-5 h-5 animate-spin rounded-full border-2 border-brand-secondary border-t-transparent" />
                  </div>
                )}
                {!convLoading && conversations.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <p className="text-sm text-gray-400">No conversations yet.</p>
                    <button
                      type="button"
                      onClick={handleOpenNewPanel}
                      className="mt-2 text-xs text-brand-secondary hover:underline font-medium"
                    >
                      Start one
                    </button>
                  </div>
                )}
                {conversations.map(conv => {
                  const name = getDisplayName(conv.otherEmail, conv.otherDisplayName);
                  const isMe = conv.lastSenderId === user.id;
                  return (
                    <button
                      key={conv.otherId}
                      type="button"
                      onClick={() => openChatFromConversation(conv)}
                      className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
                    >
                      <div className="relative flex-shrink-0">
                        <Avatar name={name} size="sm" />
                        {conv.unreadCount > 0 && (
                          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-brand-secondary text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                            {conv.unreadCount > 9 ? '9+' : conv.unreadCount}
                          </span>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>
                            {name}
                          </p>
                          <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">
                            {formatTime(conv.lastCreatedAt)}
                          </span>
                        </div>
                        <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>
                          {isMe ? 'You: ' : ''}{conv.lastContent}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab bar button */}
        <button
          type="button"
          onClick={() => { setPanelOpen(!panelOpen); if (!panelOpen) { setView('conversations'); setConvLoading(false); } }}
          className="flex items-center justify-between gap-2 w-[420px] px-6 py-2.5 bg-white border border-gray-200 border-b-0 rounded-t-xl shadow-lg hover:bg-gray-50 transition-colors select-none"
        >
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
            <span className="text-sm font-semibold text-gray-800">Messaging</span>
            {totalUnread > 0 && (
              <span className="min-w-[18px] h-[18px] px-1 bg-brand-secondary text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </div>
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${panelOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
          </svg>
        </button>
      </div>
      </div>
    </>
  );
}
