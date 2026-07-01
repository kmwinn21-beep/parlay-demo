'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import toast from 'react-hot-toast';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';

// ─── Types ────────────────────────────────────────────────────────────────────

type ActivityType = 'preset_meeting' | 'meeting' | 'touchpoint' | 'hosted_event' | 'follow_up' | 'first_contact';

interface Activity {
  id: string;
  type: ActivityType;
  day: number;
  isApproximate: boolean;
  companyId: number;
  companyName: string;
  companyWse: number | null;
  attendeeId: number | null;
  contactName: string | null;
  contactTitle: string | null;
  timestamp: string;
  linkedActivityId?: string;
}

type RecordRef = { type: 'attendee' | 'company'; id: number };

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
  preset_meeting: '#0B3C62', // brand-primary #1
  meeting: '#86efac', // green-300
  touchpoint: '#fca5a5', // red-300
  hosted_event: '#E7DED9', // brand-accent #1
  follow_up: '#7F77DD',
  first_contact: '#EF9F27',
};

const DOT_LABELS: Record<ActivityType, string> = {
  preset_meeting: 'Pre-set Meeting',
  meeting: 'Meeting Held',
  touchpoint: 'Touchpoint',
  hosted_event: 'Hosted Event',
  follow_up: 'Follow-up created',
  first_contact: 'First contact',
};

const REP_COL_WIDTH = 168;
const PRESET_COL_WIDTH = 200;
const DAY_COL_WIDTH = 200;
const UNKNOWN_COL_WIDTH = 200;

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

// Pure UTC calendar-date arithmetic — mirrors the server's correction logic so
// the optimistic client-side date matches what gets persisted.
function dayDateLabel(startDate: string, dayIndex1Based: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (dayIndex1Based - 1)));
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  const yy = String(dt.getUTCFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
}

function computeCorrectedTimestamp(startDate: string, day: number, originalTimestamp: string): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + (day - 1)));
  const newDateStr = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  const timePart = originalTimestamp.split(/[ T]/)[1] ?? '00:00:00';
  return `${newDateStr}T${timePart}`;
}

// ─── Dot visual style (shared by the absolute-positioned and wrapped dots) ────

const DIMMED_COLOR = '#D1D5DB'; // gray-300

function dotVisualStyle(activity: Activity, selected: boolean, dimmed: boolean): React.CSSProperties {
  const color = dimmed ? DIMMED_COLOR : DOT_COLORS[activity.type];
  const size = selected ? 18 : 12;
  return {
    width: size,
    height: size,
    backgroundColor: activity.isApproximate ? 'transparent' : color,
    border: activity.isApproximate ? `1.5px dashed ${color}` : selected ? '2px solid white' : 'none',
    boxShadow: selected ? `0 0 0 2px ${color}` : '0 0 0 1px rgba(255,255,255,0.6)',
    transition: 'width 0.15s ease-out, height 0.15s ease-out, background-color 0.15s ease-out, border-color 0.15s ease-out',
  };
}

function dotTooltip(activity: Activity): string {
  return (
    `${DOT_LABELS[activity.type]} · ${activity.companyName}` +
    (activity.isApproximate ? ' — Approximate — logged outside conference dates' : '')
  );
}

// ─── Wrapped activity dot (day columns flow-wrap their dots, no fixed slots) ──

function WrappedActivityDot({
  activity,
  selected,
  dimmed,
  onClick,
}: {
  activity: Activity;
  selected: boolean;
  dimmed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={dotTooltip(activity)}
      className="relative flex-shrink-0 rounded-full transition-transform hover:scale-125"
      style={dotVisualStyle(activity, selected, dimmed)}
      aria-label={`${DOT_LABELS[activity.type]} at ${activity.companyName}`}
    />
  );
}

// ─── Day header row ───────────────────────────────────────────────────────────

function DayHeaderRow({ totalDays, startDate }: { totalDays: number; startDate: string }) {
  return (
    <div className="flex sticky top-0 z-20 bg-white border-b border-gray-100">
      <div
        className="sticky left-0 z-30 bg-white flex-shrink-0"
        style={{ width: REP_COL_WIDTH }}
      />
      <div
        className="flex-shrink-0 text-center py-2 text-[11px] font-medium text-gray-500 border-l border-gray-100"
        style={{ width: PRESET_COL_WIDTH }}
      >
        <p>Pre-set Meetings</p>
      </div>
      {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
        <div
          key={day}
          className="flex-shrink-0 text-center py-2 text-[11px] font-medium text-gray-500"
          style={{ width: DAY_COL_WIDTH }}
        >
          <p>Day {day}</p>
          <p className="text-[10px] text-gray-400 font-normal">({dayDateLabel(startDate, day)})</p>
        </div>
      ))}
      <div
        className="flex-shrink-0 text-center py-2 text-[11px] font-medium text-gray-500 border-l border-gray-100"
        style={{ width: UNKNOWN_COL_WIDTH }}
      >
        <p>Unknown Day</p>
      </div>
    </div>
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

  // Pre-set meetings have their own dedicated column, independent of the
  // day-column grid, so they're pulled out before the normal/unknown split.
  const presetActivities = visibleActivities.filter(a => a.type === 'preset_meeting');
  const normalActivities = visibleActivities.filter(a => !a.isApproximate && a.type !== 'preset_meeting');
  // Unknown Day only makes sense in the "All" view — a specific day filter
  // is asking "what happened on day N", and approximate activities don't
  // have a known real day, so they're excluded from single-day filtering.
  const unknownActivities = dayFilter === 'all' ? visibleActivities.filter(a => a.isApproximate) : [];

  // Group normal activities by day; follow-ups sort after their day's other
  // activities so they read as "generated by" the activity ahead of them.
  const byDay = new Map<number, Activity[]>();
  for (const a of normalActivities) {
    if (!byDay.has(a.day)) byDay.set(a.day, []);
    byDay.get(a.day)!.push(a);
  }
  for (const acts of Array.from(byDay.values())) {
    acts.sort((a, b) => Number(a.type === 'follow_up') - Number(b.type === 'follow_up'));
  }

  const showEmptyMessage = rep.activities.length === 0 || visibleActivities.length === 0;

  // Selection isolation: once any dot is selected, mute every other dot and
  // every rep row that doesn't contain the selected activity, so the
  // selected dot + its rep row read as the sole focus.
  const hasSelection = selectedId != null;
  const isRepSelected = hasSelection && rep.activities.some(a => a.id === selectedId);
  const repTextDimmed = hasSelection && !isRepSelected;

  return (
    <div className="flex border-b border-gray-100 relative">
      <div
        className="sticky left-0 z-10 flex-shrink-0 px-3 py-2.5 flex items-center gap-2 bg-gray-50"
        style={{ width: REP_COL_WIDTH }}
      >
        <div className="w-7 h-7 rounded-full bg-brand-secondary/15 text-brand-secondary text-[11px] font-semibold flex items-center justify-center flex-shrink-0">
          {rep.initials}
        </div>
        <div className="min-w-0">
          <p className={`text-xs font-medium leading-snug ${repTextDimmed ? 'text-gray-300' : 'text-gray-800'}`}>{rep.displayName}</p>
          <p className={`text-[10px] ${repTextDimmed ? 'text-gray-300' : 'text-gray-400'}`}>{rep.meetingCount} meeting{rep.meetingCount !== 1 ? 's' : ''}</p>
        </div>
      </div>

      <div
        className="flex flex-wrap content-start gap-1.5 px-2.5 py-3.5 min-h-[48px] flex-shrink-0 border-l border-gray-100 bg-gray-50/40"
        style={{ width: PRESET_COL_WIDTH }}
      >
        {presetActivities.map(a => (
          <WrappedActivityDot
            key={a.id}
            activity={a}
            selected={selectedId === a.id}
            dimmed={hasSelection && selectedId !== a.id}
            onClick={() => onSelectActivity(a)}
          />
        ))}
      </div>

      {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
        <div
          key={day}
          className="flex flex-wrap content-start gap-1.5 px-2.5 py-3.5 min-h-[48px] flex-shrink-0 border-l border-gray-100"
          style={{ width: DAY_COL_WIDTH }}
        >
          {(byDay.get(day) ?? []).map(a => (
            <WrappedActivityDot
              key={a.id}
              activity={a}
              selected={selectedId === a.id}
              dimmed={hasSelection && selectedId !== a.id}
              onClick={() => onSelectActivity(a)}
            />
          ))}
        </div>
      ))}

      <div
        className="flex flex-wrap content-start gap-1.5 px-2.5 py-3.5 min-h-[48px] flex-shrink-0 border-l border-gray-100 bg-gray-50/40"
        style={{ width: UNKNOWN_COL_WIDTH }}
      >
        {unknownActivities.map(a => (
          <WrappedActivityDot
            key={a.id}
            activity={a}
            selected={selectedId === a.id}
            dimmed={hasSelection && selectedId !== a.id}
            onClick={() => onSelectActivity(a)}
          />
        ))}
      </div>

      {showEmptyMessage && (
        <span
          className="absolute top-1/2 -translate-y-1/2 text-[11px] text-gray-300 italic pointer-events-none"
          style={{ left: REP_COL_WIDTH + 12 }}
        >
          {rep.activities.length === 0 ? 'No logged activity' : 'No activity on this day'}
        </span>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function ActivityDetailPanel({
  activity,
  totalDays,
  avgCostPerUnit,
  onClose,
  onCorrectDay,
  onOpenRecord,
}: {
  activity: Activity;
  totalDays: number;
  avgCostPerUnit: number;
  onClose: () => void;
  onCorrectDay: (day: number) => void;
  onOpenRecord: (ref: RecordRef) => void;
}) {
  const valuePill = formatValuePill(activity.companyWse, avgCostPerUnit);

  return (
    <div
      key={activity.id}
      className="activity-map-detail flex-shrink-0 border-t border-gray-200 bg-gray-50 px-5 py-3.5 overflow-hidden"
      onClick={e => e.stopPropagation()}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
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
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => onOpenRecord({ type: 'company', id: activity.companyId })}
              className="text-sm font-medium text-brand-secondary hover:underline"
            >
              {activity.companyName}
            </button>
            {valuePill && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
                {valuePill}
              </span>
            )}
          </div>
          {activity.contactName && (
            <p className="text-xs text-gray-600 mt-0.5">
              {activity.attendeeId != null ? (
                <button
                  type="button"
                  onClick={() => onOpenRecord({ type: 'attendee', id: activity.attendeeId as number })}
                  className="hover:underline hover:text-gray-800"
                >
                  {activity.contactName}
                </button>
              ) : (
                activity.contactName
              )}
              {activity.contactTitle && <span className="text-gray-400"> · {activity.contactTitle}</span>}
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-1">{formatTimestamp(activity.timestamp)}</p>
          {activity.isApproximate && (
            <div className="flex items-center gap-2 flex-wrap mt-1.5">
              <p className="text-[11px] text-amber-600 whitespace-nowrap">
                Approximate — logged outside conference dates. Select Activity Day:
              </p>
              <div className="flex items-center gap-1 flex-wrap">
                {Array.from({ length: totalDays }, (_, i) => i + 1).map(day => (
                  <button
                    key={day}
                    type="button"
                    onClick={() => onCorrectDay(day)}
                    className="text-[10px] px-1.5 py-0.5 rounded-full bg-white border border-amber-300 text-amber-700 hover:bg-amber-100 transition-colors"
                  >
                    Day {day}
                  </button>
                ))}
              </div>
            </div>
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

// ─── Nested record panel (company/attendee iframe, condenses main content) ────

function RecordPanel({
  record,
  panelStyle,
  onResizeStart,
  onClose,
}: {
  record: RecordRef | null;
  panelStyle: React.CSSProperties | undefined;
  onResizeStart: (e: React.MouseEvent) => void;
  onClose: () => void;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden bg-white border-l border-gray-200 flex-shrink-0 transition-all duration-200 ease-out ${
        record != null ? '' : 'w-0'
      }`}
      style={record != null ? panelStyle ?? { width: 480 } : undefined}
    >
      {record != null && (
        <>
          <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={onResizeStart}>
            <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
          </div>
          <div className="flex items-center gap-3 px-4 py-3 bg-brand-accent flex-shrink-0">
            <span className="text-xs text-brand-primary truncate flex-1 min-w-0 capitalize">
              {record.type} record
            </span>
            <a
              href={`/${record.type === 'attendee' ? 'attendees' : 'companies'}/${record.id}`}
              className="text-xs text-brand-primary hover:underline whitespace-nowrap flex-shrink-0"
            >
              Go to record →
            </a>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex-shrink-0 p-1.5 rounded-lg text-brand-primary hover:bg-black/5 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <iframe
            key={`${record.type}-${record.id}`}
            src={`/${record.type === 'attendee' ? 'attendees' : 'companies'}/${record.id}?embed=true`}
            className="flex-1 border-0 w-full"
            title={`${record.type} record`}
          />
        </>
      )}
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
  const { panelStyle: mapPanelStyle, handleResizeStart: mapResizeStart } = useDrawerResize(1400, 640, 1400);
  const { panelStyle: recordPanelStyle, handleResizeStart: recordResizeStart } = useDrawerResize(480, 280, 800);
  const avgCostPerUnit = useAvgCostPerUnit();

  const [data, setData] = useState<ActivityMapData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dayFilter, setDayFilter] = useState<number | 'all'>('all');
  const [selectedActivity, setSelectedActivity] = useState<Activity | null>(null);
  const [recordPanel, setRecordPanel] = useState<RecordRef | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  const scrollRef = useRef<HTMLDivElement | null>(null);

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
      setRecordPanel(null);
    }
  }, [isOpen]);

  const updateScrollState = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 1);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    if (!isOpen || !data) return;
    updateScrollState();
  }, [isOpen, data, updateScrollState]);

  const scrollByPage = (direction: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * (el.clientWidth - DAY_COL_WIDTH), behavior: 'smooth' });
  };

  const handleSelectActivity = (activity: Activity) => {
    // Clicking the already-selected dot again toggles it off.
    setSelectedActivity(prev => (prev?.id === activity.id ? null : activity));
    // A different dot may belong to a different company/attendee — close any
    // open record panel rather than leaving it showing a stale record.
    setRecordPanel(null);
  };

  const handleDeselect = () => setSelectedActivity(null);

  const handleCorrectDay = async (activity: Activity, day: number) => {
    if (!data) return;
    const newTimestamp = computeCorrectedTimestamp(data.startDate, day, activity.timestamp);
    const corrected: Activity = { ...activity, day, isApproximate: false, timestamp: newTimestamp };

    // Snapshot for rollback on failure
    const prevData = data;
    const prevSelected = selectedActivity;

    // Optimistic update — replace every occurrence of this activity id across
    // all rep lanes (an inferred-attribution touchpoint can appear in more
    // than one rep's lane).
    setData({
      ...data,
      reps: data.reps.map(rep => ({
        ...rep,
        activities: rep.activities.map(a => (a.id === activity.id ? corrected : a)),
      })),
    });
    setSelectedActivity(corrected);

    try {
      const res = await fetch(`/api/conferences/${conferenceId}/activity-map/correct-date`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ activityId: activity.id, day }),
      });
      if (!res.ok) throw new Error(`Failed to update date (${res.status})`);
    } catch (e) {
      setData(prevData);
      setSelectedActivity(prevSelected);
      toast.error(e instanceof Error ? e.message : 'Failed to update activity date');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <style>{`
        @keyframes activityMapFadeIn  { from { opacity: 0; }              to { opacity: 1; } }
        @keyframes activityMapSlideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
        @keyframes activityMapSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
        @keyframes activityMapDetailSlideIn { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
        .activity-map-panel { animation: activityMapSlideUp 0.25s ease-out; }
        .activity-map-detail { animation: activityMapDetailSlideIn 0.22s ease-out; }
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
        className="activity-map-panel relative w-full sm:w-[1400px] h-[90vh] sm:h-full bg-white shadow-2xl flex flex-col border-t sm:border-t-0 sm:border-l border-gray-200 overflow-hidden rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none"
        style={mapPanelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={mapResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* Main content + nested record panel — the record panel condenses this column when open */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          <div className="flex-1 min-w-0 flex flex-col overflow-hidden" onClick={handleDeselect}>
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-3 bg-brand-primary flex-shrink-0">
              <p className="text-sm font-medium text-white truncate">{conferenceName} · Activity map</p>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex-shrink-0 ml-4 p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
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

            {/* ── Legend + day filter + horizontal nav ── */}
            <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 flex-shrink-0 flex-wrap">
              <div className="flex items-center gap-3 flex-wrap">
                {(Object.keys(DOT_COLORS) as ActivityType[]).map(type => (
                  <div key={type} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: DOT_COLORS[type] }} />
                    <span className="text-[12px] text-gray-500">{DOT_LABELS[type]}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2 flex-wrap">
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
                <div className="flex items-center gap-1 ml-1 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => scrollByPage(-1)}
                    disabled={!canScrollLeft}
                    aria-label="Scroll to earlier days"
                    className="p-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollByPage(1)}
                    disabled={!canScrollRight}
                    aria-label="Scroll to later days"
                    className="p-1 rounded-full bg-gray-100 text-gray-600 hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>

            {/* ── Rep swimlanes ── */}
            <div
              ref={scrollRef}
              onScroll={updateScrollState}
              className="flex-1 overflow-auto hide-scrollbar"
            >
              {data.reps.length === 0 ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-sm text-gray-400">No internal reps assigned to this conference.</p>
                </div>
              ) : (
                <div style={{ width: REP_COL_WIDTH + PRESET_COL_WIDTH + data.totalDays * DAY_COL_WIDTH + UNKNOWN_COL_WIDTH }}>
                  <DayHeaderRow totalDays={data.totalDays} startDate={data.startDate} />
                  {data.reps.map(rep => (
                    <RepLaneRow
                      key={rep.userId}
                      rep={rep}
                      totalDays={data.totalDays}
                      dayFilter={dayFilter}
                      selectedId={selectedActivity?.id ?? null}
                      onSelectActivity={handleSelectActivity}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* ── Detail panel ── */}
            {selectedActivity && (
              <ActivityDetailPanel
                activity={selectedActivity}
                totalDays={data.totalDays}
                avgCostPerUnit={avgCostPerUnit}
                onClose={() => setSelectedActivity(null)}
                onCorrectDay={day => handleCorrectDay(selectedActivity, day)}
                onOpenRecord={ref => setRecordPanel(ref)}
              />
            )}
          </>
        )}
          </div>

          <RecordPanel
            record={recordPanel}
            panelStyle={recordPanelStyle}
            onResizeStart={recordResizeStart}
            onClose={() => setRecordPanel(null)}
          />
        </div>
      </div>
    </div>
  );
}
