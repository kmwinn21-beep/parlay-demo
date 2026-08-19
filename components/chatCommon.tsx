'use client';

/**
 * Types and small presentational helpers shared by the messaging surfaces —
 * the header menu, the conversation drawer and the bottom bar.
 */

export interface ChatUser {
  id: number;
  email: string;
  displayName: string | null;
}

export interface Conversation {
  otherId: number;
  otherEmail: string;
  otherDisplayName: string | null;
  lastContent: string;
  lastCreatedAt: string;
  lastSenderId: number;
  unreadCount: number;
}

export interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  createdAt: string;
  readAt: string | null;
  mine: boolean;
}

export interface GroupConversation {
  id: number;
  name: string;
  createdBy: number;
  createdAt: string;
  lastContent: string | null;
  lastCreatedAt: string | null;
  lastSenderId: number | null;
  unreadCount: number;
}

export interface GroupMessage {
  id: number;
  groupId: number;
  senderId: number;
  senderName: string;
  content: string;
  createdAt: string;
  mine: boolean;
}

/** The one conversation the drawer is showing — a teammate or a group. */
export type ChatTarget =
  | { kind: 'dm'; user: ChatUser }
  | { kind: 'group'; group: GroupConversation };

export function targetKey(t: ChatTarget): string {
  return t.kind === 'dm' ? `dm-${t.user.id}` : `group-${t.group.id}`;
}

export function targetName(t: ChatTarget): string {
  return t.kind === 'dm' ? getDisplayName(t.user.email, t.user.displayName) : t.group.name;
}

export function getDisplayName(email: string, displayName: string | null): string {
  return displayName || email.split('@')[0];
}

export function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(p => p[0]).join('').toUpperCase().slice(0, 2) || '?';
}

export function formatTime(iso: string): string {
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

// Avatar circle with colour derived from the name, so a teammate keeps the
// same colour everywhere messaging shows them.
const AVATAR_COLORS = [
  'bg-blue-500', 'bg-emerald-500', 'bg-violet-500', 'bg-amber-500',
  'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-teal-500',
];

export function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xfffff;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

export function Avatar({ name, size = 'md' }: { name: string; size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8 text-xs' : 'w-9 h-9 text-sm';
  return (
    <div className={`${cls} ${avatarColor(name)} rounded-full flex items-center justify-center text-white font-semibold flex-shrink-0`}>
      {getInitials(name)}
    </div>
  );
}

export function GroupAvatar({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const cls = size === 'sm' ? 'w-8 h-8' : 'w-9 h-9';
  return (
    <div className={`${cls} rounded-full bg-brand-secondary/10 flex items-center justify-center flex-shrink-0`}>
      <svg className="w-4 h-4 text-brand-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    </div>
  );
}
