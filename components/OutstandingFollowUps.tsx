'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useUser } from './UserContext';

interface FollowUpItem {
  id: number;
  attendee_id: number;
  conference_id: number;
  next_steps: string;
  next_steps_notes: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  conference_name: string;
  start_date: string;
  end_date: string;
}

interface ConferenceGroup {
  conferenceId: number;
  conferenceName: string;
  endDate: string;
  items: FollowUpItem[];
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function daysSince(dateStr: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000));
}

function fmtDate(dateStr: string): string {
  try {
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return dateStr; }
}

export function OutstandingFollowUps() {
  const { user } = useUser();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FollowUpItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [pendingIds, setPendingIds] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/follow-ups/outstanding');
      if (res.ok) setItems(await res.json() as FollowUpItem[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) fetchItems();
  }, [user, fetchItems]);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Group by conference (API already sorted by end_date ASC)
  const groups: ConferenceGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.conferenceId === item.conference_id) {
      last.items.push(item);
    } else {
      groups.push({
        conferenceId: item.conference_id,
        conferenceName: item.conference_name,
        endDate: item.end_date,
        items: [item],
      });
    }
  }

  const toggleGroup = (key: string) => setExpanded(prev => ({ ...prev, [key]: !prev[key] }));

  const markDone = async (id: number) => {
    setPendingIds(prev => [...prev, id]);
    try {
      await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: true }),
      });
      setItems(prev => prev.filter(f => f.id !== id));
    } finally {
      setPendingIds(prev => prev.filter(n => n !== id));
    }
  };

  const deleteItem = async (id: number) => {
    setPendingIds(prev => [...prev, id]);
    try {
      await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setItems(prev => prev.filter(f => f.id !== id));
    } finally {
      setPendingIds(prev => prev.filter(n => n !== id));
    }
  };

  const initials = getInitials(user?.displayName ?? user?.repName ?? null);
  const total = items.length;

  return (
    <div className="relative" ref={containerRef}>
      {/* Icon button with count badge */}
      <button
        type="button"
        onClick={() => { setOpen(v => !v); if (!open) fetchItems(); }}
        className="relative flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors"
        title="Outstanding Follow Ups"
      >
        <svg className="w-5 h-5 text-brand-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        {total > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
            {total > 99 ? '99+' : total}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-1rem)] bg-white border border-gray-200 rounded-2xl shadow-2xl z-[200] overflow-hidden flex flex-col"
          style={{ maxHeight: 'min(80vh, 600px)' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
            <h3 className="text-sm font-bold text-brand-primary">Outstanding Follow Ups</h3>
            {total > 0 && (
              <span className="min-w-[22px] h-[22px] px-1.5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {total > 99 ? '99+' : total}
              </span>
            )}
          </div>

          {loading && (
            <div className="flex items-center justify-center gap-2 py-8 text-gray-400 text-sm">
              <div className="w-4 h-4 animate-spin rounded-full border-2 border-brand-primary border-t-transparent" />
              Loading...
            </div>
          )}

          {!loading && groups.length === 0 && (
            <p className="py-8 text-center text-sm text-gray-400">No outstanding follow-ups</p>
          )}

          {!loading && groups.length > 0 && (
            <div className="overflow-y-auto">
              {groups.map(group => {
                const key = String(group.conferenceId);
                const isExpanded = !!expanded[key];
                const days = daysSince(group.endDate);
                return (
                  <div key={key} className="border-b border-gray-100 last:border-0">
                    {/* Conference group header */}
                    <button
                      type="button"
                      onClick={() => toggleGroup(key)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className="text-sm font-semibold text-brand-primary truncate pr-2">{group.conferenceName}</span>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="min-w-[22px] h-[22px] px-1.5 bg-brand-secondary text-white text-xs font-bold rounded-full flex items-center justify-center">
                          {group.items.length}
                        </span>
                        <svg
                          className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          fill="none" stroke="currentColor" viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </div>
                    </button>

                    {/* Follow-up items */}
                    {isExpanded && group.items.map(item => {
                      const isPending = pendingIds.includes(item.id);
                      return (
                        <div key={item.id} className="px-4 py-3 border-t border-gray-50 flex items-start gap-3 bg-white">
                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                              <Link
                                href={`/attendees/${item.attendee_id}`}
                                className="text-sm font-semibold text-brand-primary hover:underline"
                                onClick={() => setOpen(false)}
                              >
                                {item.first_name} {item.last_name}
                              </Link>
                              {initials && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0 bg-teal-100 text-teal-700 border border-teal-200 rounded-full text-[10px] font-bold whitespace-nowrap">
                                  <svg className="w-2.5 h-2.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  {initials}
                                </span>
                              )}
                            </div>
                            {item.title && <p className="text-xs text-gray-500 truncate">{item.title}</p>}
                            {item.company_name && <p className="text-xs text-gray-500 truncate">{item.company_name}</p>}
                            {item.next_steps && (
                              <span className="inline-block mt-1 px-2 py-0.5 bg-brand-secondary text-white text-[10px] font-semibold rounded-full">
                                {item.next_steps}
                              </span>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">
                              {group.conferenceName} &middot; {fmtDate(group.endDate)}
                            </p>
                            {days > 0 && (
                              <p className="text-[10px] font-semibold text-orange-500 mt-0.5">
                                {days} day{days !== 1 ? 's' : ''} since conference ended
                              </p>
                            )}
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => markDone(item.id)}
                              className="px-2.5 py-1 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-40"
                            >
                              Done
                            </button>
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => deleteItem(item.id)}
                              className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                              title="Delete"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
