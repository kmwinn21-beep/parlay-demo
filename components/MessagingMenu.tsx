'use client';

import { useCallback, useState } from 'react';
import { useUser } from '@/components/UserContext';
import { useChatPanel } from '@/components/ChatPanelContext';
import {
  Avatar,
  GroupAvatar,
  formatTime,
  getDisplayName,
  type ChatUser,
  type GroupConversation,
} from '@/components/chatCommon';

interface ConferenceOption {
  id: number;
  name: string;
}

/**
 * The Direct / Groups picker. It renders the same in the header dropdown and in
 * the mobile sheet — only the chrome around it differs, which the caller owns.
 * Picking anything here hands off to the drawer via openChat().
 */
export function MessagingMenu({ onClose }: { onClose: () => void }) {
  const { user } = useUser();
  const { conversations, groups, dmUnread, groupUnread, openChat, refresh } = useChatPanel();

  const [tab, setTab] = useState<'direct' | 'groups'>('direct');
  const [view, setView] = useState<'conversations' | 'new'>('conversations');
  const [groupView, setGroupView] = useState<'list' | 'new-group'>('list');
  const [allUsers, setAllUsers] = useState<ChatUser[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupConferenceId, setNewGroupConferenceId] = useState<number | null>(null);
  const [newGroupMemberIds, setNewGroupMemberIds] = useState<Set<number>>(new Set());
  const [conferences, setConferences] = useState<ConferenceOption[]>([]);
  const [groupCreating, setGroupCreating] = useState(false);

  const loadUsers = useCallback(async () => {
    if (allUsers.length > 0) return;
    try {
      const res = await fetch('/api/chat/users');
      if (!res.ok) return;
      setAllUsers(await res.json() as ChatUser[]);
    } catch { /* silently ignore */ }
  }, [allUsers.length]);

  const loadConferences = useCallback(async () => {
    if (conferences.length > 0) return;
    try {
      const res = await fetch('/api/conferences?nav=1');
      if (!res.ok) return;
      const data = await res.json() as { id: number; name: string }[];
      setConferences(data.map(c => ({ id: c.id, name: c.name })));
    } catch { /* silently ignore */ }
  }, [conferences.length]);

  const handleOpenNewPanel = () => { setView('new'); loadUsers(); };
  const handleOpenNewGroup = () => { setGroupView('new-group'); loadUsers(); loadConferences(); };

  const toggleGroupMember = (uid: number) => {
    setNewGroupMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim() || groupCreating || !user) return;
    setGroupCreating(true);
    try {
      const res = await fetch('/api/chat/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newGroupName.trim(),
          memberIds: Array.from(newGroupMemberIds),
          ...(newGroupConferenceId ? { conferenceId: newGroupConferenceId } : {}),
        }),
      });
      if (!res.ok) return;
      const created = await res.json() as { id: number; name: string };
      refresh();
      setNewGroupName('');
      setNewGroupConferenceId(null);
      setNewGroupMemberIds(new Set());
      setGroupView('list');
      const group: GroupConversation = {
        id: created.id, name: created.name, createdBy: user.id,
        createdAt: new Date().toISOString(), lastContent: null,
        lastCreatedAt: null, lastSenderId: null, unreadCount: 0,
      };
      openChat({ kind: 'group', group });
    } catch { /* silently ignore */ } finally {
      setGroupCreating(false);
    }
  };

  const filteredUsers = userSearch.trim()
    ? allUsers.filter(u => {
        const name = getDisplayName(u.email, u.displayName).toLowerCase();
        return name.includes(userSearch.toLowerCase()) || u.email.toLowerCase().includes(userSearch.toLowerCase());
      })
    : allUsers;

  const inSubView = view === 'new' || groupView === 'new-group';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Header: tabs, or a back link while composing */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
        {inSubView ? (
          <button
            type="button"
            onClick={() => { setView('conversations'); setGroupView('list'); setUserSearch(''); }}
            className="flex items-center gap-1.5 text-sm font-semibold text-gray-800 hover:text-brand-secondary"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            {view === 'new' ? 'New Message' : 'New Group'}
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setTab('direct')}
              className={`px-3 py-0.5 rounded-full text-sm font-semibold transition-colors ${tab === 'direct' ? 'bg-brand-secondary text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Direct{dmUnread > 0 && <span className="ml-1 text-[9px]">({dmUnread})</span>}
            </button>
            <button
              type="button"
              onClick={() => setTab('groups')}
              className={`px-3 py-0.5 rounded-full text-sm font-semibold transition-colors ${tab === 'groups' ? 'bg-brand-secondary text-white' : 'text-gray-500 hover:text-gray-800'}`}
            >
              Groups{groupUnread > 0 && <span className="ml-1 text-[9px]">({groupUnread})</span>}
            </button>
          </div>
        )}
        <div className="flex items-center gap-1">
          {tab === 'direct' && view === 'conversations' && groupView === 'list' && (
            <button type="button" onClick={handleOpenNewPanel} className="p-1.5 text-gray-500 hover:text-brand-secondary hover:bg-gray-100 rounded-full transition-colors" title="New message">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          {tab === 'groups' && groupView === 'list' && (
            <button type="button" onClick={handleOpenNewGroup} className="p-1.5 text-gray-500 hover:text-brand-secondary hover:bg-gray-100 rounded-full transition-colors" title="New group">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          )}
          <button type="button" onClick={onClose} className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-full transition-colors" title="Close">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* New DM search */}
      {tab === 'direct' && view === 'new' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex-shrink-0">
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
            {filteredUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-6">No teammates found.</p>}
            {filteredUsers.map(u => {
              const name = getDisplayName(u.email, u.displayName);
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { openChat({ kind: 'dm', user: u }); setView('conversations'); setUserSearch(''); }}
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

      {/* Direct conversations */}
      {tab === 'direct' && view === 'conversations' && (
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm text-gray-400">No conversations yet.</p>
              <button type="button" onClick={handleOpenNewPanel} className="mt-2 text-xs text-brand-secondary hover:underline font-medium">Start one</button>
            </div>
          )}
          {conversations.map(conv => {
            const name = getDisplayName(conv.otherEmail, conv.otherDisplayName);
            const isMe = conv.lastSenderId === user?.id;
            return (
              <button
                key={conv.otherId}
                type="button"
                onClick={() => openChat({ kind: 'dm', user: { id: conv.otherId, email: conv.otherEmail, displayName: conv.otherDisplayName } })}
                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
              >
                <div className="relative flex-shrink-0">
                  <Avatar name={name} size="sm" />
                  {conv.unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">{conv.unreadCount > 9 ? '9+' : conv.unreadCount}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className={`text-sm truncate ${conv.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{name}</p>
                    <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">{formatTime(conv.lastCreatedAt)}</span>
                  </div>
                  <p className={`text-xs truncate ${conv.unreadCount > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{isMe ? 'You: ' : ''}{conv.lastContent}</p>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Groups */}
      {tab === 'groups' && groupView === 'list' && (
        <div className="flex-1 overflow-y-auto">
          {groups.length === 0 && (
            <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
              <svg className="w-10 h-10 text-gray-200 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <p className="text-sm text-gray-400">No group chats yet.</p>
              <button type="button" onClick={handleOpenNewGroup} className="mt-2 text-xs text-brand-secondary hover:underline font-medium">Create one</button>
            </div>
          )}
          {groups.map(group => (
            <button
              key={group.id}
              type="button"
              onClick={() => openChat({ kind: 'group', group })}
              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 text-left transition-colors"
            >
              <div className="relative flex-shrink-0">
                <GroupAvatar />
                {group.unreadCount > 0 && <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">{group.unreadCount > 9 ? '9+' : group.unreadCount}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <p className={`text-sm truncate ${group.unreadCount > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-800'}`}>{group.name}</p>
                  {group.lastCreatedAt && <span className="text-[10px] text-gray-400 whitespace-nowrap flex-shrink-0">{formatTime(group.lastCreatedAt)}</span>}
                </div>
                {group.lastContent && <p className={`text-xs truncate ${group.unreadCount > 0 ? 'font-semibold text-gray-700' : 'text-gray-400'}`}>{group.lastContent}</p>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* New group form */}
      {tab === 'groups' && groupView === 'new-group' && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Group name</label>
              <input type="text" value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. AHCA 2025 Team" autoFocus className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-secondary" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Conference (optional — auto-adds internal attendees)</label>
              <select value={newGroupConferenceId ?? ''} onChange={e => setNewGroupConferenceId(e.target.value ? Number(e.target.value) : null)} className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-brand-secondary bg-white">
                <option value="">None (ad-hoc group)</option>
                {conferences.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Add members</label>
              <div className="border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-40 overflow-y-auto">
                {allUsers.length === 0 && <p className="text-xs text-gray-400 text-center py-3">Loading…</p>}
                {allUsers.map(u => {
                  const name = getDisplayName(u.email, u.displayName);
                  return (
                    <label key={u.id} className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                      <input type="checkbox" checked={newGroupMemberIds.has(u.id)} onChange={() => toggleGroupMember(u.id)} className="accent-brand-secondary" />
                      <Avatar name={name} size="sm" />
                      <span className="text-sm text-gray-800 truncate">{name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>
          <div className="px-4 py-3 border-t border-gray-100 flex-shrink-0">
            <button type="button" onClick={handleCreateGroup} disabled={!newGroupName.trim() || groupCreating} className="w-full btn-primary text-sm py-2 disabled:opacity-40">
              {groupCreating ? 'Creating…' : 'Create Group'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
