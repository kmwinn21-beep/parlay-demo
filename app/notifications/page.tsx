'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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

function TypePill({ type }: { type: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    company:    { label: 'C',  cls: 'bg-blue-100 text-blue-700 border-blue-200' },
    attendee:   { label: 'A',  cls: 'bg-green-100 text-green-700 border-green-200' },
    conference: { label: 'CF', cls: 'bg-purple-100 text-purple-700 border-purple-200' },
  };
  const { label, cls } = map[type] ?? { label: type[0]?.toUpperCase() ?? '?', cls: 'bg-gray-100 text-gray-700 border-gray-200' };
  return (
    <span className={`inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded-full text-[10px] font-bold border ${cls}`}>
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
      className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-procare-dark-blue/10 text-procare-dark-blue text-[10px] font-bold flex-shrink-0"
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
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function entityUrl(entityType: string, entityId: number): string {
  if (entityType === 'company') return `/companies/${entityId}?from_notification=1`;
  if (entityType === 'attendee') return `/attendees/${entityId}?from_notification=1`;
  if (entityType === 'conference') return `/conferences/${entityId}?from_notification=1`;
  return '/notifications';
}

export default function NotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterType, setFilterType] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [markingAll, setMarkingAll] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const toggleExpand = useCallback((id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=200');
      if (!res.ok) return;
      const data = await res.json();
      setNotifications(Array.isArray(data) ? data : []);
    } catch { /* non-fatal */ } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(); }, [fetchNotifications]);

  const markRead = useCallback(async (id: number) => {
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    } catch { /* non-fatal */ }
  }, []);

  const markAllRead = useCallback(async () => {
    setMarkingAll(true);
    try {
      await fetch('/api/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ all: true }),
      });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
    } catch { /* non-fatal */ } finally {
      setMarkingAll(false);
    }
  }, []);

  const handleRowClick = useCallback((n: Notification) => {
    if (!n.is_read) markRead(n.id);
    router.push(entityUrl(n.entity_type, n.entity_id));
  }, [markRead, router]);

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filterType && n.type !== filterType) return false;
      if (filterStatus === 'unread' && n.is_read) return false;
      if (filterStatus === 'read' && !n.is_read) return false;
      return true;
    });
  }, [notifications, filterType, filterStatus]);

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Notifications</h1>
          <p className="text-sm text-gray-500 mt-1">
            {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? '' : 's'}` : 'All caught up!'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            disabled={markingAll}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-procare-bright-blue text-white text-sm font-medium hover:bg-procare-dark-blue transition-colors disabled:opacity-60"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            {markingAll ? 'Marking…' : 'Mark all read'}
          </button>
        )}
      </div>

      {/* Stats */}
      {!loading && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-procare-dark-blue font-serif">{notifications.length}</p>
            <p className="text-xs text-gray-500 mt-1">Total</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-red-500 font-serif">{unreadCount}</p>
            <p className="text-xs text-gray-500 mt-1">Unread</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-blue-600 font-serif">
              {notifications.filter(n => n.type === 'company').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Company</p>
          </div>
          <div className="card py-4 text-center">
            <p className="text-3xl font-bold text-green-600 font-serif">
              {notifications.filter(n => n.type === 'attendee').length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Attendee</p>
          </div>
        </div>
      )}

      {/* Table card */}
      <div className="card p-0 overflow-hidden">
        {/* Card header with filters */}
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">
            All Notifications
            {filtered.length !== notifications.length && (
              <span className="ml-2 text-sm font-normal text-gray-500">
                ({filtered.length} of {notifications.length})
              </span>
            )}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={filterType}
              onChange={e => setFilterType(e.target.value)}
              className="input-field w-auto text-sm"
            >
              <option value="">All Types</option>
              <option value="company">Company</option>
              <option value="attendee">Attendee</option>
              <option value="conference">Conference</option>
            </select>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value)}
              className="input-field w-auto text-sm"
            >
              <option value="">All Statuses</option>
              <option value="unread">Unread</option>
              <option value="read">Read</option>
            </select>
            {(filterType || filterStatus) && (
              <button
                type="button"
                onClick={() => { setFilterType(''); setFilterStatus(''); }}
                className="text-xs text-gray-500 hover:text-red-500 transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center items-center py-16">
            <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center">
            <svg className="w-10 h-10 text-gray-300 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 10-12 0v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
            </svg>
            <p className="text-sm text-gray-400 font-medium">No notifications found</p>
            {(filterType || filterStatus) && (
              <p className="text-xs text-gray-400 mt-1">Try clearing filters</p>
            )}
          </div>
        ) : (
          <>
            {/* Mobile collapsible cards — hidden at sm and above */}
            <div className="sm:hidden divide-y divide-gray-100">
              {filtered.map(n => {
                const isExpanded = expandedIds.has(n.id);
                return (
                  <div key={n.id} className={!n.is_read ? 'bg-blue-50/40' : ''}>
                    {/* Card header — always visible, tap to expand/collapse */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(n.id)}
                      className="w-full flex items-center gap-3 px-4 py-3 text-left"
                    >
                      <TypePill type={n.type} />
                      {!n.is_read && (
                        <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                      )}
                      <span className="flex-1 font-medium text-procare-dark-blue truncate min-w-0">
                        {n.record_name}
                      </span>
                      <svg
                        className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Expanded body */}
                    {isExpanded && (
                      <div className="px-4 pb-4 space-y-3">
                        {/* Message */}
                        <p className="text-sm text-gray-700">{n.message}</p>

                        {/* Meta: user pill + date + status badge */}
                        <div className="flex items-center gap-2 flex-wrap text-xs text-gray-500">
                          {(n.changed_by_name || n.changed_by_email) && (
                            <UserInitialsPill name={n.changed_by_name} email={n.changed_by_email} />
                          )}
                          <span>{formatDateTime(n.created_at)}</span>
                          {n.is_read ? (
                            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                              Read
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                              Unread
                            </span>
                          )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 pt-1">
                          <Link
                            href={entityUrl(n.entity_type, n.entity_id)}
                            onClick={() => { if (!n.is_read) markRead(n.id); }}
                            className="flex-1 text-center py-2 rounded-lg bg-procare-bright-blue text-white text-xs font-medium hover:bg-procare-dark-blue transition-colors"
                          >
                            Go to record
                          </Link>
                          {!n.is_read && (
                            <button
                              type="button"
                              onClick={() => markRead(n.id)}
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

            {/* Desktop table — hidden below sm */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-14">Type</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Record</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-16">User</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">Date &amp; Time</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide w-20">Status</th>
                    <th className="px-4 py-3 w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.map(n => (
                    <tr
                      key={n.id}
                      onClick={() => handleRowClick(n)}
                      className={`group cursor-pointer transition-colors hover:bg-blue-50 ${!n.is_read ? 'bg-blue-50/40' : ''}`}
                    >
                      {/* Type */}
                      <td className="px-4 py-3">
                        <TypePill type={n.type} />
                      </td>
                      {/* Record */}
                      <td className="px-4 py-3">
                        <span className="font-medium text-procare-dark-blue truncate max-w-[140px] block">
                          {n.record_name}
                        </span>
                      </td>
                      {/* Message */}
                      <td className="px-4 py-3">
                        <span className="text-gray-600 line-clamp-2 max-w-xs block">{n.message}</span>
                      </td>
                      {/* User */}
                      <td className="px-4 py-3">
                        {(n.changed_by_name || n.changed_by_email) ? (
                          <UserInitialsPill name={n.changed_by_name} email={n.changed_by_email} />
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      {/* Date & Time */}
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">
                        {formatDateTime(n.created_at)}
                      </td>
                      {/* Status */}
                      <td className="px-4 py-3">
                        {n.is_read ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[10px] font-medium">
                            Read
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-[10px] font-semibold">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />
                            Unread
                          </span>
                        )}
                      </td>
                      {/* Mark-read action */}
                      <td className="px-2 py-3">
                        {!n.is_read && (
                          <button
                            type="button"
                            onClick={e => { e.stopPropagation(); markRead(n.id); }}
                            className="p-1.5 rounded hover:bg-gray-200 transition-colors opacity-0 group-hover:opacity-100"
                            title="Mark as read"
                          >
                            <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
