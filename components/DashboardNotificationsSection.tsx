'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useIsDesktop } from '@/lib/useIsDesktop';

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

function TypePill({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    company:    { label: 'C',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    attendee:   { label: 'A',  cls: 'bg-green-100 text-green-700 border-green-200' },
    conference: { label: 'CF', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  };
  const { label, cls } = map[type] ?? { label: type[0]?.toUpperCase() ?? '?', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${cls}`}>
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
    <span
      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-brand-primary/10 text-brand-primary text-[10px] font-bold flex-shrink-0"
      title={display}
    >
      {initials}
    </span>
  );
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr + (dateStr.endsWith('Z') ? '' : 'Z'));
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function entityUrl(entityType: string, entityId: number): string {
  if (entityType === 'company') return `/companies/${entityId}?from_notification=1`;
  if (entityType === 'attendee') return `/attendees/${entityId}?from_notification=1`;
  if (entityType === 'conference') return `/conferences/${entityId}?from_notification=1`;
  if (entityType === 'follow_up') return '/follow-ups?from_notification=1';
  return '/notifications';
}

/**
 * The dashboard's notification list — desktop only, in the column Open
 * Follow-Ups used to hold. Rows read like the notifications page does on a
 * phone: a tappable header that opens the message, who changed it, and the
 * ways out. Status is one Unread toggle rather than a dropdown, and the count
 * pill counts unread only, so it matches the bell in the header.
 */
export function DashboardNotificationsSection() {
  const isDesktop = useIsDesktop();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!isDesktop) return;
    let cancelled = false;
    fetch('/api/notifications?limit=200')
      .then(r => (r.ok ? r.json() : []))
      .then(data => { if (!cancelled) setNotifications(Array.isArray(data) ? data : []); })
      .catch(() => { if (!cancelled) setNotifications([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isDesktop]);

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const markRead = useCallback(async (id: number) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, is_read: true } : n)));
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
    } catch { /* non-fatal — the row already reads as read */ }
  }, []);

  const filtered = useMemo(() => notifications.filter(n => {
    if (filterType && n.type !== filterType) return false;
    if (unreadOnly && n.is_read) return false;
    return true;
  }), [notifications, filterType, unreadOnly]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  if (!isDesktop) return null;

  return (
    // 475px floor including the card's own padding, so the column keeps its
    // height when there is little to show.
    <div className="card flex flex-col overflow-hidden min-h-[475px]">
      <div className="flex items-center justify-between gap-3 flex-shrink-0">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Notifications</h2>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none">{unreadCount}</span>
          )}
        </div>
        <Link href="/notifications" className="text-xs text-brand-secondary hover:underline flex-shrink-0">View all →</Link>
      </div>

      <div className="flex items-center gap-2 mt-3 flex-shrink-0">
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
          className="input-field text-sm w-auto"
        >
          <option value="">All Types</option>
          <option value="company">Company</option>
          <option value="attendee">Attendee</option>
          <option value="conference">Conference</option>
        </select>
        <button
          type="button"
          onClick={() => setUnreadOnly(v => !v)}
          aria-pressed={unreadOnly}
          title="Show only unread notifications"
          className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
            unreadOnly
              ? 'border-brand-accent bg-brand-accent/20 text-brand-primary'
              : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
          }`}
        >
          Unread
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto -mx-6 mt-3">
        {loading ? (
          <div className="flex justify-center items-center py-12">
            <div className="animate-spin w-6 h-6 border-4 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-gray-400 font-medium">
              {unreadOnly || filterType ? 'No notifications match those filters' : 'All caught up!'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100 border-t border-gray-100">
            {filtered.map(n => {
              const isExpanded = expandedIds.has(n.id);
              return (
                <div key={n.id} className={!n.is_read ? 'bg-blue-50/40' : ''}>
                  <button
                    type="button"
                    onClick={() => toggleExpand(n.id)}
                    aria-expanded={isExpanded}
                    className="w-full flex items-center gap-3 px-6 py-3 text-left hover:bg-blue-50/60 transition-colors"
                  >
                    <TypePill type={n.type} />
                    {!n.is_read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />}
                    <span className="flex-1 text-sm font-medium text-brand-primary truncate min-w-0">
                      {n.record_name}
                    </span>
                    <svg
                      className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {isExpanded && (
                    <div className="px-6 pb-4 space-y-3">
                      <p className="text-sm text-gray-700">{n.message}</p>
                      <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                        {(n.changed_by_name || n.changed_by_email) && (
                          <UserInitialsPill name={n.changed_by_name} email={n.changed_by_email} />
                        )}
                        <span>{formatDateTime(n.created_at)}</span>
                        {n.is_read ? (
                          <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">Read</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            Unread
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 pt-1">
                        <Link
                          href={entityUrl(n.entity_type, n.entity_id)}
                          onClick={() => { if (!n.is_read) void markRead(n.id); }}
                          className="flex-1 text-center py-2 rounded-lg bg-brand-secondary text-white text-xs font-medium hover:bg-brand-primary transition-colors"
                        >
                          Go to record
                        </Link>
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={() => void markRead(n.id)}
                            className="py-2 px-3 rounded-lg border border-gray-200 text-xs text-gray-600 font-medium hover:bg-gray-50 transition-colors"
                          >
                            Mark read
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
