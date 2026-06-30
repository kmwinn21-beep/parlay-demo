'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useDrawerResize } from '@/lib/useDrawerResize';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'meeting' | 'touchpoint' | 'follow_up' | 'first_contact';

interface Activity {
  id: string;
  type: ActivityType;
  day: number;
  isApproximate: boolean;
  companyId: number;
  companyName: string;
  contactName: string | null;
  contactTitle: string | null;
  timestamp: string;
  linkedActivityId?: string;
}

interface RepLane {
  userId: number;
  displayName: string;
  initials: string;
  meetingCount: number;
  activities: Activity[];
}

interface ActivityMapData {
  conferenceId: number;
  conferenceName: string;
  startDate: string;
  endDate: string;
  totalDays: number;
  summary: {
    meetingsHeld: number;
    touchpoints: number;
    companiesEngaged: number;
    followUpsCreated: number;
  };
  reps: RepLane[];
}

export type ConferenceActivityMapDrawerProps = {
  conferenceId: number;
  conferenceName: string;
  isOpen: boolean;
  onClose: () => void;
};

// ─── Visual constants ───────────────────────────────────────────────────────

const DOT_COLORS: Record<ActivityType, string> = {
  meeting: '#185FA5',
  touchpoint: '#1D9E75',
  follow_up: '#7F77DD',
  first_contact: '#EF9F27',
};

const DOT_LABELS: Record<ActivityType, string> = {
  meeting: 'Meeting',
  touchpoint: 'Touchpoint',
  follow_up: 'Follow-up created',
  first_contact: 'First contact',
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

// ─── Activity dot ─────────────────────────────────────────────────────────────

function ActivityDot({
  activity,
  selected,
  onClick,
  jitter,
}: {
  activity: Activity;
  selected: boolean;
  onClick: () => void;
  jitter: number;
}) {
  const color = DOT_COLORS[activity.type];
  return (
    <button
      type="button"
      onClick={onClick}
      title={
        `${DOT_LABELS[activity.type]} · ${activity.companyName}` +
        (activity.isApproximate ? ' — Approximate — logged outside conference dates' : '')
      }
      className="absolute flex items-center justify-center rounded-full transition-transform hover:scale-125"
      style={{
        width: 12,
        height: 12,
        left: `calc(50% + ${jitter}px)`,
        transform: 'translateX(-50%)',
        top: activity.type === 'follow_up' ? 24 : 4,
        backgroundColor: activity.isApproximate ? 'transparent' : color,
        border: activity.isApproximate ? `1.5px dashed ${color}` : selected ? '2px solid white' : 'none',
        boxShadow: selected ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(255,255,255,0.6)',
        zIndex: selected ? 2 : 1,
      }}
      aria-label={`${DOT_LABELS[activity.type]} at ${activity.companyName}`}
    />
  );
}

// ─── Rep lane ─────────────────────────────────────────────────────────────────

function RepLaneRow({
  rep,
  totalDays,
  dayFilter,
  selectedId,
  onSelectActivity,
}: {
  rep: RepLane;
  totalDays: number;
  dayFilter: number | 'all';
  selectedId: string | null;
  onSelectActivity: (a: Activity) => void;
}) {
  const visibleActivities = dayFilter === 'all'
    ? rep.activities
    : rep.activities.filter(a => a.day === dayFilter);
  const dayCount = dayFilter === 'all' ? totalDays : 1;

  // group by day to compute jitter for overlapping same-day-same-row dots
  const byDaySlot = new Map<string, Activity[]>();
  for (const a of visibleActivities) {
    const row = a.type === 'follow_up' ? 'bottom' : 'top';
    const key = `${a.day}-${row}`;
    if (!byDaySlot.has(key)) byDaySlot.set(key, []);
    byDaySlot.get(key)!.push(a);
  }

  return (
    <div className="grid grid-cols-[168px_1fr] border-b border-gray-100">
      <div className="px-3 py-2.5 flex items-center gap-2 bg-gray-50">
        <div className="w-7 h-7 rounded-full bg-brand-secondary/15 text-brand-secondary text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
          {rep.initials}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-gray-800 leading-snug">{rep.displayName}</p>
          <p className="text-[10px] text-gray-400">{rep.meetingCount} meeting{rep.meetingCount !== 1 ? 's' : ''}</p>
        </div>
      </div>
      <div
        className="relative px-3 py-3.5 min-h-[48px]"
        style={{
          backgroundImage: `repeating-linear-gradient(to right, #F3F4F6 0, #F3F4F6 1px, transparent 1px, transparent calc(100% / ${dayCount}))`,
        }}
      >
        {rep.activities.length === 0 ? (
          <span className="text-[11px] text-gray-300 italic">No logged activity</span>
        ) : visibleActivities.length === 0 ? (
          <span className="text-[11px] text-gray-300 italic">No activity on this day</span>
        ) : (
          Array.from(byDaySlot.entries()).map(([key, acts]) =>
            acts.map((a, i) => {
              const dayIdx = dayFilter === 'all' ? a.day - 1 : 0;
              const segmentWidthPct = 100 / dayCount;
              const leftPct = segmentWidthPct * dayIdx + segmentWidthPct / 2;
              const jitter = acts.length > 1 ? (i - (acts.length - 1) / 2) * 14 : 0;
              return (
                <div
                  key={a.id}
                  className="absolute"
                  style={{ left: `${leftPct}%`, top: 0, height: '100%' }}
                >
                  <ActivityDot
                    activity={a}
                    selected={selectedId === a.id}
                    onClick={() => onSelectActivity(a)}
                    jitter={jitter}
                  />
                </div>
              );
            }),
          )
        )}
      </div>
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ActivityDetailPanel({ activity, onClose }: { activity: Activity; onClose: () => void }) {
  return (
    <div className="flex-shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: DOT_COLORS[activity.type] }}
            />
            <span className="text-xs font-semibold text-gray-700">{DOT_LABELS[activity.type]}</span>
            {activity.isApproximate && (
              <span className="text-[10px] text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                Approximate
              </span>
            )}
          </div>
          <Link
            href={`/companies/${activity.companyId}`}
            className="text-sm font-medium text-brand-secondary hover:underline"
          >
            {activity.companyName}
          </Link>
          {activity.contactName && (
            <p className="text-xs text-gray-600 mt-0.5">
              {activity.contactName}
              {activity.contactTitle && <span className="text-gray-400"> · {activity.contactTitle}</span>}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">{formatTimestamp(activity.timestamp)}</p>
          {activity.isApproximate && (
            <p className="text-[11px] text-amber-600 mt-1">
              Approximate — logged outside conference dates, shown on the nearest boundary day.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close detail"
          className="flex-shrink-0 p-1 rounded text-gray-400 hover:text-gray-600"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ConferenceActivityMapDrawer({
  conferenceId,
  conferenceName,
  isOpen,
  onClose,
}: ConferenceActivityMapDrawerProps) {
  const { panelStyle: mapPanelStyle, handleResizeStart: mapResizeStart } = useDrawerResize(1000, 640, 1400);

  const [data, setData] = useState<ActivityMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/activity-map`);
      if (!res.ok) throw new Error(`Failed to load activity map (${res.status})`);
      const json = await res.json() as ActivityMapData;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load activity map');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => {
    if (isOpen && !data && !loading) load();
  }, [isOpen, data, loading, load]);

  useEffect(() => {
    if (!isOpen) {
      setDayFilter('all');
      setSelectedActivity(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <style>{`
        @keyframes activityMapFadeIn  { from { opacity: 0; }              to { opacity: 1; } }
        @keyframes activityMapSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes activityMapSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        .activity-map-panel { animation: activityMapSlideUp 0.25s ease-out; }
        @media (min-width: 640px) { .activity-map-panel { animation: activityMapSlideIn 0.25s ease-out; } }
      `}</style>

      {/* Scrim */}
      <div
        className="absolute inset-0"
        style={{ animation: 'activityMapFadeIn 0.2s ease-out', backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="activity-map-panel relative w-full sm:w-[1000px] h-[92vh] sm:h-full bg-white shadow-2xl flex flex-col border-t sm:border-t-0 sm:border-l border-gray-200 overflow-hidden rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none"
        style={mapPanelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={mapResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <p className="text-sm font-medium text-gray-900 truncate">{conferenceName} · Activity map</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 ml-4 p-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {loading && (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            <div className="flex gap-2">
              {[0, 1, 2, 3].map(i => (
                <div key={i} className="h-16 flex-1 rounded-lg bg-gray-100 animate-pulse" />
              ))}
            </div>
            {[0, 1, 2].map(i => (
              <div key={i} className="h-12 rounded-lg bg-gray-100 animate-pulse" />
            ))}
          </div>
        )}

        {error && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-3">
            <p className="text-sm text-red-600">{error}</p>
            <button type="button" onClick={load} className="text-xs text-brand-secondary hover:underline">
              Retry
            </button>
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* ── Summary strip ── */}
            <div className="flex gap-2 px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
              {[
                { label: 'Meetings held', value: data.summary.meetingsHeld },
                { label: 'Touchpoints', value: data.summary.touchpoints },
                { label: 'Companies engaged', value: data.summary.companiesEngaged },
                { label: 'Follow-ups created', value: data.summary.followUpsCreated },
              ].map(stat => (
                <div key={stat.label} className="flex-1 rounded-lg bg-gray-50 px-3 py-2">
                  <p className="text-base font-semibold text-gray-900">{stat.value}</p>
                  <p className="text-[10px] text-gray-500">{stat.label}</p>
                </div>
              ))}
            </div>

            {/* ── Legend + day filter ── */}
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {(Object.keys(DOT_COLORS) as ActivityType[]).map(type => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DOT_COLORS[type] }} />
                    <span className="text-[10px] text-gray-500">{DOT_LABELS[type]}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                <button
                  type="button"
                  onClick={() => setDayFilter('all')}
                  className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                    dayFilter === 'all'
                      ? 'bg-brand-secondary text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All
                </button>
                {Array.from({ length: data.totalDays }, (_, i) => i + 1).map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => setDayFilter(day)}
                    className={`text-[11px] px-2 py-1 rounded-full transition-colors ${
                      dayFilter === day
                        ? 'bg-brand-secondary text-white'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Day {day}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Rep swimlanes ── */}
            <div className="flex-1 overflow-y-auto">
              {data.reps.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-gray-400">No internal reps assigned to this conference.</p>
                </div>
              ) : (
                data.reps.map(rep => (
                  <RepLaneRow
                    key={rep.userId}
                    rep={rep}
                    totalDays={data.totalDays}
                    dayFilter={dayFilter}
                    selectedId={selectedActivity?.id ?? null}
                    onSelectActivity={a => setSelectedActivity(a)}
                  />
                ))
              )}
            </div>

            {/* ── Detail panel ── */}
            {selectedActivity && (
              <ActivityDetailPanel activity={selectedActivity} onClose={() => setSelectedActivity(null)} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
