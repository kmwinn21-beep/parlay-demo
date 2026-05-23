'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { BannerData } from '@/components/DashboardConferenceBanner';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface OpenFollowUp {
  id: number;
  next_steps: string;
  completed: boolean;
  conference_id: number;
  first_name: string;
  last_name: string;
  company_name: string | null;
  conference_name: string;
  conference_end_date: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const diff = Math.floor((Date.now() - new Date(dateStr + 'T00:00:00').getTime()) / 86400000);
  if (diff < 7) return `${diff}d ago`;
  if (diff < 30) return `${Math.floor(diff / 7)}w ago`;
  return `${Math.floor(diff / 30)}mo ago`;
}

function isOverdueConference(endDateStr: string): boolean {
  const today = new Date().toISOString().slice(0, 10);
  return endDateStr < today;
}

// ── FollowUpRow ───────────────────────────────────────────────────────────────

function FollowUpRow({ item, onDone, isOverdue }: { item: OpenFollowUp; onDone: () => void; isOverdue: boolean }) {
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded text-white flex-shrink-0 ${isOverdue ? 'bg-red-500' : 'bg-brand-primary'}`}>
        {item.next_steps}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{item.company_name ?? `${item.first_name} ${item.last_name}`}</p>
        {isOverdue && (
          <p className="text-xs text-red-500 truncate">{item.conference_name} · overdue</p>
        )}
      </div>
      <button
        onClick={onDone}
        className="flex-shrink-0 text-xs text-gray-400 hover:text-green-600 border border-gray-200 hover:border-green-400 rounded px-2 py-0.5 transition-colors"
      >
        Done
      </button>
    </div>
  );
}

// ── DashboardOpenFollowUps ────────────────────────────────────────────────────

export function DashboardOpenFollowUps({ followUps, bannerData }: {
  followUps: OpenFollowUp[];
  bannerData: BannerData;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('parlay_followups_collapsed') === 'true';
  });
  const [items, setItems] = useState<OpenFollowUp[]>(followUps);

  const toggle = () => {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem('parlay_followups_collapsed', String(next));
      return next;
    });
  };

  const markDone = async (id: number) => {
    // Optimistic update
    setItems(prev => prev.filter(f => f.id !== id));
    try {
      const res = await fetch(`/api/follow-ups`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: true }),
      });
      if (!res.ok) {
        // Revert on failure
        setItems(followUps);
      }
    } catch {
      setItems(followUps);
    }
  };

  const markAllDone = async (conferenceId: number) => {
    const group = items.filter(f => f.conference_id === conferenceId);
    // Optimistic update
    setItems(prev => prev.filter(f => f.conference_id !== conferenceId));
    const results = await Promise.allSettled(
      group.map(f => fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, completed: true }),
      }))
    );
    const anyFailed = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
    if (anyFailed) setItems(followUps); // revert all on any failure
  };

  // Group by conference_id
  const groupMap = new Map<number, OpenFollowUp[]>();
  for (const item of items) {
    const existing = groupMap.get(item.conference_id) ?? [];
    existing.push(item);
    groupMap.set(item.conference_id, existing);
  }

  // Order groups: active conference first, then by end_date ascending
  const activeConfId = bannerData.state === 'active' ? bannerData.conference.id : null;
  const groups = Array.from(groupMap.entries()).sort(([aId, aItems], [bId, bItems]) => {
    if (aId === activeConfId) return -1;
    if (bId === activeConfId) return 1;
    return (aItems[0]?.conference_end_date ?? '').localeCompare(bItems[0]?.conference_end_date ?? '');
  });

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between cursor-pointer flex-shrink-0" onClick={toggle}>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Open Follow-Ups</h2>
          {items.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">{items.length}</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {collapsed ? (
            <span className="text-xs text-gray-400">{items.length} pending</span>
          ) : items.length > 0 ? (
            <Link href="/follow-ups" className="text-xs text-brand-secondary hover:underline" onClick={e => e.stopPropagation()}>View all →</Link>
          ) : null}
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expanded content */}
      {!collapsed && (
        <div className="mt-3 flex-1 flex flex-col min-h-0">
          {items.length === 0 ? (
            <div className="flex items-center gap-2 py-6 justify-center">
              <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm text-gray-500">All caught up — no open follow-ups</p>
            </div>
          ) : (
            <>
              {/* Amber urgency banner */}
              {bannerData.state === 'upcoming' && items.length > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg mb-3" style={{ backgroundColor: '#fef3c7', color: '#92400e' }}>
                  <span>🕐</span>
                  <p className="text-xs font-medium">Clear these before {bannerData.conference.name} in {bannerData.daysUntil} days</p>
                </div>
              )}

              {/* Conference groups */}
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {groups.map(([confId, group]) => {
                  const confName = group[0]?.conference_name ?? '';
                  const confEndDate = group[0]?.conference_end_date ?? '';
                  const isCurrentConf = confId === activeConfId;
                  const isPastConference = isOverdueConference(confEndDate);

                  return (
                    <div key={confId} className="mb-4">
                      {/* Group header */}
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400">
                          {confName} {isCurrentConf ? '· Current' : `· ${relativeTime(confEndDate)}`}
                        </p>
                        {group.length >= 2 && (
                          <button onClick={() => void markAllDone(confId)} className="text-xs text-gray-400 hover:text-gray-600">Mark all done</button>
                        )}
                      </div>

                      {/* Task rows — max 3 shown */}
                      {group.slice(0, 3).map(f => (
                        <FollowUpRow
                          key={f.id}
                          item={f}
                          onDone={() => void markDone(f.id)}
                          isOverdue={isPastConference}
                        />
                      ))}

                      {/* Overflow link */}
                      {group.length > 3 && (
                        <Link href={`/follow-ups?conference=${confId}`} className="text-xs text-brand-secondary hover:underline block mt-1">
                          +{group.length - 3} more from {confName} →
                        </Link>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Bottom link */}
              <Link href="/follow-ups" className="block text-center text-xs text-brand-secondary hover:underline mt-3 pt-2 border-t border-gray-100 flex-shrink-0">
                View all {items.length} open follow-ups →
              </Link>
            </>
          )}
        </div>
      )}
    </div>
  );
}
