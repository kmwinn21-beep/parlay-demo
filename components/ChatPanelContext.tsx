'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { startPolling, stopPolling } from '@/lib/pollingManager';
import { useUser } from '@/components/UserContext';
import type { ChatTarget, ChatUser, Conversation, GroupConversation } from '@/components/chatCommon';

/**
 * One owner for everything messaging: the conversation and group lists (polled
 * once, read by the header badge, the menu and the bar alike) plus the state of
 * the three surfaces — the menu hanging off the header icon, the conversation
 * drawer, and the bottom bar.
 *
 * The bar and the drawer are deliberately coupled: exiting a chat takes the bar
 * down with it, minimising leaves the bar behind as the way back in.
 */
const BAR_HIDDEN_STORAGE_KEY = 'messagingBarHidden';

interface ChatPanelContextValue {
  /** The Direct/Groups menu — a dropdown under the header icon, a sheet on mobile. */
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;

  conversations: Conversation[];
  groups: GroupConversation[];
  refresh: () => void;
  dmUnread: number;
  groupUnread: number;
  totalUnread: number;

  activeChat: ChatTarget | null;
  chatMinimized: boolean;
  openChat: (target: ChatTarget) => void;
  /** Close the drawer and take the bar down with it. */
  exitChat: () => void;
  minimizeChat: () => void;
  restoreChat: () => void;

  barHidden: boolean;
  setBarHidden: (hidden: boolean) => void;
}

const ChatPanelContext = createContext<ChatPanelContextValue>({
  panelOpen: false,
  setPanelOpen: () => {},
  conversations: [],
  groups: [],
  refresh: () => {},
  dmUnread: 0,
  groupUnread: 0,
  totalUnread: 0,
  activeChat: null,
  chatMinimized: false,
  openChat: () => {},
  exitChat: () => {},
  minimizeChat: () => {},
  restoreChat: () => {},
  barHidden: false,
  setBarHidden: () => {},
});

export function ChatPanelProvider({ children }: { children: React.ReactNode }) {
  const { user } = useUser();
  const [panelOpen, setPanelOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupConversation[]>([]);
  const [activeChat, setActiveChat] = useState<ChatTarget | null>(null);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [barHidden, setBarHiddenState] = useState(false);

  useEffect(() => {
    setBarHiddenState(localStorage.getItem(BAR_HIDDEN_STORAGE_KEY) === '1');
  }, []);

  const setBarHidden = useCallback((hidden: boolean) => {
    setBarHiddenState(hidden);
    localStorage.setItem(BAR_HIDDEN_STORAGE_KEY, hidden ? '1' : '0');
  }, []);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/conversations');
      if (!res.ok) return;
      setConversations(await res.json() as Conversation[]);
    } catch { /* silently ignore */ }
  }, []);

  const fetchGroups = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/groups');
      if (!res.ok) return;
      setGroups(await res.json() as GroupConversation[]);
    } catch { /* silently ignore */ }
  }, []);

  const refresh = useCallback(() => { fetchConversations(); fetchGroups(); }, [fetchConversations, fetchGroups]);

  useEffect(() => {
    if (!user) return;
    refresh();
    startPolling('chat-dock', refresh, 15_000, 30_000);
    return () => stopPolling('chat-dock');
  }, [user, refresh]);

  const dmUnread = conversations.reduce((s, c) => s + c.unreadCount, 0);
  const groupUnread = groups.reduce((s, g) => s + g.unreadCount, 0);

  const openChat = useCallback((target: ChatTarget) => {
    setActiveChat(target);
    setChatMinimized(false);
    setPanelOpen(false);
    // Opening a conversation always brings the bar back — it is the handle the
    // minimised chat lives on.
    setBarHidden(false);
    if (target.kind === 'dm') {
      setConversations(prev => prev.map(c => c.otherId === target.user.id ? { ...c, unreadCount: 0 } : c));
    } else {
      setGroups(prev => prev.map(g => g.id === target.group.id ? { ...g, unreadCount: 0 } : g));
    }
  }, [setBarHidden]);

  const exitChat = useCallback(() => {
    setActiveChat(null);
    setChatMinimized(false);
    setBarHidden(true);
  }, [setBarHidden]);

  const minimizeChat = useCallback(() => setChatMinimized(true), []);
  const restoreChat = useCallback(() => setChatMinimized(false), []);

  return (
    <ChatPanelContext.Provider
      value={{
        panelOpen,
        setPanelOpen,
        conversations,
        groups,
        refresh,
        dmUnread,
        groupUnread,
        totalUnread: dmUnread + groupUnread,
        activeChat,
        chatMinimized,
        openChat,
        exitChat,
        minimizeChat,
        restoreChat,
        barHidden,
        setBarHidden,
      }}
    >
      {children}
    </ChatPanelContext.Provider>
  );
}

export function useChatPanel() {
  return useContext(ChatPanelContext);
}

export type { ChatTarget, ChatUser, Conversation, GroupConversation };
