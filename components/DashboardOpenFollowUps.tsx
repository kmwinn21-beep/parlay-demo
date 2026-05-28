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
  company_id: number | null;
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

function FollowUpRow({ item, onDone, onCompanyClick }: {
  item: OpenFollowUp;
  onDone: () => void;
  onCompanyClick: (id: number, name: string) => void;
}) {
  const displayName = item.company_name ?? `${item.first_name} ${item.last_name}`;
  const hasCompany = !!item.company_id;
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-red-300 bg-red-50 text-red-700 flex-shrink-0 max-w-[120px] truncate">
        {item.next_steps}
      </span>
      <div className="flex-1 min-w-0">
        {hasCompany ? (
          <button
            type="button"
            onClick={() => onCompanyClick(item.company_id!, displayName)}
            className="text-xs font-medium text-brand-primary hover:underline text-left"
          >
            {displayName}
          </button>
        ) : (
          <p className="text-xs font-medium text-gray-800">{displayName}</p>
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

// ── ConferenceGroup ───────────────────────────────────────────────────────────

function ConferenceGroup({
  confId, group, isCurrentConf, onDone, onMarkAllDone, onMoreClick, onCompanyClick,
}: {
  confId: number;
  group: OpenFollowUp[];
  isCurrentConf: boolean;
  onDone: (id: number) => void;
  onMarkAllDone: (confId: number) => void;
  onMoreClick: (confId: number, confName: string) => void;
  onCompanyClick: (id: number, name: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(true);
  const confName = group[0]?.conference_name ?? '';
  const confEndDate = group[0]?.conference_end_date ?? '';
  const isPast = isOverdueConference(confEndDate);

  return (
    <div className="mb-2 border border-gray-100 rounded-lg overflow-hidden">
      {/* Group header — always visible, clickable to expand */}
      <button
        type="button"
        onClick={() => setCollapsed(v => !v)}
        className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-50 transition-colors text-left"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
            {group.length}
          </span>
          <span className="text-xs font-semibold text-gray-700 truncate">{confName}</span>
          {isCurrentConf && (
            <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary flex-shrink-0">
              Current
            </span>
          )}
          {!isCurrentConf && isPast && (
            <span className="text-[10px] text-red-500 flex-shrink-0">{relativeTime(confEndDate)}</span>
          )}
          {!isCurrentConf && !isPast && (
            <span className="text-[10px] text-gray-400 flex-shrink-0">{relativeTime(confEndDate)}</span>
          )}
        </div>
        <svg
          className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform duration-150 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Expanded rows */}
      {!collapsed && (
        <div className="px-3 pb-2">
          {group.slice(0, 3).map(f => (
            <FollowUpRow key={f.id} item={f} onDone={() => onDone(f.id)} onCompanyClick={onCompanyClick} />
          ))}
          <div className="flex items-center justify-between mt-1">
            {group.length > 3 ? (
              <button
                type="button"
                onClick={() => onMoreClick(confId, confName)}
                className="text-xs text-brand-secondary hover:underline text-left"
              >
                +{group.length - 3} more →
              </button>
            ) : <span />}
            {group.length >= 2 && (
              <button
                onClick={() => onMarkAllDone(confId)}
                className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
              >
                Mark all done
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── DashboardOpenFollowUps ────────────────────────────────────────────────────

export function DashboardOpenFollowUps({ followUps, bannerData }: {
  followUps: OpenFollowUp[];
  bannerData: BannerData;
}) {
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return true;
    const stored = localStorage.getItem('parlay_followups_collapsed');
    return stored === null ? false : stored === 'true';
  });
  const [items, setItems] = useState<OpenFollowUp[]>(followUps);
  const [drawerConfId, setDrawerConfId] = useState<number | null>(null);
  const [drawerConfName, setDrawerConfName] = useState<string>('');
  const [companyDrawerId, setCompanyDrawerId] = useState<number | null>(null);
  const [companyDrawerName, setCompanyDrawerName] = useState<string>('');

  const toggle = () => {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem('parlay_followups_collapsed', String(next));
      return next;
    });
  };

  const markDone = async (id: number) => {
    setItems(prev => prev.filter(f => f.id !== id));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, completed: true }),
      });
      if (!res.ok) setItems(followUps);
    } catch {
      setItems(followUps);
    }
  };

  const markAllDone = async (conferenceId: number) => {
    const group = items.filter(f => f.conference_id === conferenceId);
    setItems(prev => prev.filter(f => f.conference_id !== conferenceId));
    const results = await Promise.allSettled(
      group.map(f => fetch('/api/follow-ups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: f.id, completed: true }),
      }))
    );
    const anyFailed = results.some(r => r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok));
    if (anyFailed) setItems(followUps);
  };

  // Group by conference_id
  const groupMap = new Map<number, OpenFollowUp[]>();
  for (const item of items) {
    const existing = groupMap.get(item.conference_id) ?? [];
    existing.push(item);
    groupMap.set(item.conference_id, existing);
  }

  const activeConfId = bannerData.state === 'active' ? bannerData.conference.id : null;
  const groups = Array.from(groupMap.entries()).sort(([aId, aItems], [bId, bItems]) => {
    if (aId === activeConfId) return -1;
    if (bId === activeConfId) return 1;
    return (aItems[0]?.conference_end_date ?? '').localeCompare(bItems[0]?.conference_end_date ?? '');
  });

  return (
    <div className="card flex flex-col overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between cursor-pointer flex-shrink-0" onClick={toggle}>
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold text-brand-primary font-serif">Open Follow-Ups</h2>
          {items.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
              {items.length}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {collapsed && items.length > 0 && (
            <span className="text-xs text-gray-400">{items.length} pending</span>
          )}
          {!collapsed && items.length > 0 && (
            <Link href="/follow-ups" className="text-xs text-brand-secondary hover:underline" onClick={e => e.stopPropagation()}>
              View all →
            </Link>
          )}
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
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
              <div className="flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden" style={{ scrollbarWidth: 'none' }}>
                {groups.map(([confId, group]) => (
                  <ConferenceGroup
                    key={confId}
                    confId={confId}
                    group={group}
                    isCurrentConf={confId === activeConfId}
                    onDone={id => void markDone(id)}
                    onMarkAllDone={id => void markAllDone(id)}
                    onMoreClick={(id, name) => { setDrawerConfId(id); setDrawerConfName(name); }}
                    onCompanyClick={(id, name) => { setCompanyDrawerId(id); setCompanyDrawerName(name); }}
                  />
                ))}
              </div>

              <Link
                href="/follow-ups"
                className="block text-center text-xs text-brand-secondary hover:underline mt-3 pt-2 border-t border-gray-100 flex-shrink-0"
              >
                View all {items.length} open follow-ups →
              </Link>
            </>
          )}
        </div>
      )}

      {companyDrawerId !== null && (
        <>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setCompanyDrawerId(null)}
          />
          <div
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[600px] bg-white shadow-2xl flex flex-col"
            style={{ animation: 'slideInRight 0.25s ease-out' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{companyDrawerName}</h3>
                <p className="text-xs text-gray-500">Company Record</p>
              </div>
              <button
                type="button"
                onClick={() => setCompanyDrawerId(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/companies/${companyDrawerId}?embed=true`}
              className="flex-1 w-full border-0"
              title={companyDrawerName}
            />
          </div>
        </>
      )}

      {drawerConfId !== null && (
        <>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setDrawerConfId(null)}
          />
          {/* Drawer */}
          <div
            className="fixed inset-y-0 right-0 z-50 w-full sm:w-[520px] bg-white shadow-2xl flex flex-col"
            style={{ animation: 'slideInRight 0.25s ease-out' }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div>
                <h3 className="text-sm font-semibold text-gray-800">{drawerConfName}</h3>
                <p className="text-xs text-gray-500">Open Follow-Ups</p>
              </div>
              <button
                type="button"
                onClick={() => setDrawerConfId(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/conferences/${drawerConfId}?tab=follow-ups&filter=open&embed=true`}
              className="flex-1 w-full border-0"
              title={`Follow-ups for ${drawerConfName}`}
            />
          </div>
        </>
      )}
    </div>
  );
}
