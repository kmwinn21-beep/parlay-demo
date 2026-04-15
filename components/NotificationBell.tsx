'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface Notification {
  id: number;
  type: 'company' | 'attendee' | 'conference';
  record_id: number;
  record_name: string;
  message: string;
  changed_by_config_id: number | null;
  changed_by_email: string | null;
  changed_by_name: string | null;
  entity_type: string;
  entity_id: number;
  is_read: boolean;
  created_at: string;
}

// Color-coded type pills
function TypePill({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    company:    { label: 'C',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    attendee:   { label: 'A',  cls: 'bg-green-100 text-green-700 border-green-200' },
    conference: { label: 'CF', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  };
  const { label, cls } = map[type] ?? { label: type[0]?.toUpperCase() ?? '?', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center justify-center min-w-[22px] h-[22px] px-1 rounded-full text-[10px] font-bold border ${cls}`}>
      {label}
    </span>
  );
}

function UserInitialsPill({ name, email }: { name: string | null; email: string | null }) {
  const display = name ?? email ?? '?';
  const parts = display.trim().split(/\s+/);
  const initials = parts.length >= 2
    ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
    : display.slice(0, 2).toUpperCase();
  return (
    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-procare-dark-blue/10 text-procare-dark-blue text-[10px] font-bold flex-shrink-0" title={display}>
      {initials}
    </span>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  const now = Date.now();
  const diff = now - date.getTime();
  if (isNaN(diff)) return dateStr;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function entityUrl(entityType: string, entityId: number): string {
  if (entityType === 'company') return `/companies/${entityId}?from_notification=1`;
  if (entityType === 'attendee') return `/attendees/${entityId}?from_notification=1`;
  if (entityType === 'conference') return `/conferences/${entityId}?from_notification=1`;
  return '/notifications';
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unread_only=1&limit=1');
      if (!res.ok) return;
      const data = await res.json();
      setUnreadCount(Array.isArray(data) ? data.length : 0);
      // Re-fetch full count
      const res2 = await fetch('/api/notifications?unread_only=1&limit=200');
      if (res2.ok) {
        const all = await res2.json();
        setUnreadCount(Array.isArray(all) ? all.length : 0);
      }
    } catch { /* non-fatal */ }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?unread_only=1&limit=20');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
      setUnreadCount(Array.isArray(data) ? data.length : 0);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, []);

  // Poll unread count every 30s
  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchUnreadCount]);

  // Fetch notifications when dropdown opens
  useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const markRead = useCallback(async (id: number) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.filter(n => n.id !== id));
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch { /* non-fatal */ }
  }, []);

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotifications([]);
      setUnreadCount(0);
    } catch { /* non-fatal */ }
  }, []);

  const handleRowClick = useCallback(async (n: Notification) => {
    setOpen(false);
    await markRead(n.id);
    router.push(entityUrl(n.entity_type, n.entity_id));
  }, [markRead, router]);

  return (
    <div className="relative" ref={panelRef}>
      {/* Bell button */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
        title="Notifications"
        aria-label="Notifications"
        aria-expanded={open}
      >
        <svg className="w-5 h-5 text-procare-dark-blue" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold px-1 leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-1rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl z-[200] overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-procare-dark-blue">Notifications</p>
              <p className="text-xs text-gray-400">{unreadCount} unread</p>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  className="text-xs text-procare-bright-blue hover:underline font-medium"
                >
                  Mark all read
                </button>
              )}
            </div>
          </div>

          {/* List */}
          <div className="max-h-[420px] overflow-y-auto divide-y divide-gray-50">
            {loading ? (
              <div className="flex justify-center items-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-procare-bright-blue border-t-transparent rounded-full" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="py-10 text-center">
                <svg className="w-8 h-8 text-gray-300 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                <p className="text-sm text-gray-400">You&apos;re all caught up!</p>
              </div>
            ) : (
              notifications.map(n => (
                <div key={n.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors group">
                  {/* Clickable main content */}
                  <button
                    type="button"
                    className="flex items-start gap-3 flex-1 min-w-0 text-left"
                    onClick={() => handleRowClick(n)}
                  >
                    <TypePill type={n.type} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-procare-dark-blue truncate">{n.record_name}</p>
                      <p className="text-xs text-gray-600 leading-snug line-clamp-2 mt-0.5">{n.message}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {(n.changed_by_name || n.changed_by_email) && (
                          <UserInitialsPill name={n.changed_by_name} email={n.changed_by_email} />
                        )}
                        <span className="text-[10px] text-gray-400">{formatRelativeTime(n.created_at)}</span>
                      </div>
                    </div>
                  </button>
                  {/* Mark-read button */}
                  <button
                    type="button"
                    onClick={e => { e.stopPropagation(); markRead(n.id); }}
                    className="flex-shrink-0 mt-0.5 p-1 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                    title="Mark as read"
                  >
                    <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-gray-100 px-4 py-2.5">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="block text-center text-xs font-medium text-procare-bright-blue hover:underline"
            >
              View all notifications →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
