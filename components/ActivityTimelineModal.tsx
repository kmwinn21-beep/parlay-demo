'use client';

import { useState, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConferenceEntry {
  conferenceId: number;
  conferenceName: string;
  startDate: string;
  endDate: string;
  seriesId: string | null;
  isCurrent: boolean;
}

interface AttendeeEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  healthScore: number | null;
}

interface ActivityData {
  meetings: Array<{ attendeeId: number; conferenceId: number; outcome: string | null }>;
  followUps: Array<{ attendeeId: number; conferenceId: number; completed: boolean }>;
  touchpoints: Array<{ attendeeId: number; conferenceId: number }>;
  hostedEvents: Array<{ attendeeId: number; conferenceId: number }>;
  firstContacts: Array<{ attendeeId: number; conferenceId: number }>;
}

interface TimelineData {
  companyId: number;
  companyName: string;
  conferences: ConferenceEntry[];
  attendees: AttendeeEntry[];
  activity: ActivityData;
  healthByConference: Array<{ conferenceId: number; healthScore: number | null }>;
}

export type ActivityTimelineModalProps = {
  isOpen: boolean;
  onClose: () => void;
  companyId: number;
  companyName: string;
  currentConferenceId?: number;
};

// ─── Tooltip ──────────────────────────────────────────────────────────────────

function Tooltip({ text, children }: { text: string; children: React.ReactNode }) {
  const [visible, setVisible] = useState(false);
  return (
    <div
      className="relative inline-flex"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      {children}
      {visible && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 px-2 py-1 rounded bg-gray-800 text-white text-[10px] whitespace-nowrap pointer-events-none z-[9999]"
          style={{ boxShadow: '0 2px 8px rgba(0,0,0,0.25)' }}
        >
          {text}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-800" />
        </div>
      )}
    </div>
  );
}

// ─── Activity Dot ─────────────────────────────────────────────────────────────

type DotType = 'meeting' | 'followup' | 'touchpoint' | 'hostedEvent' | 'firstContact';

const DOT_ICONS: Record<DotType, React.ReactNode> = {
  meeting: (
    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden="true">
      <circle cx="5.5" cy="5" r="2" />
      <path d="M1 13c0-2 2-3.5 4.5-3.5S10 11 10 13" />
      <path d="M11 7c1.1 0 2 .9 2 2s-.9 2-2 2" strokeDasharray="0" />
      <path d="M13 13c0-1.4-.9-2.5-2-3" />
    </svg>
  ),
  followup: (
    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden="true">
      <path d="M3 8l3 3 7-7" />
    </svg>
  ),
  touchpoint: (
    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden="true">
      <path d="M8 2v5" />
      <path d="M5.5 4.5v3M10.5 4.5v3" />
      <path d="M5.5 7.5c0 1.4.7 2.5 2.5 4 1.8-1.5 2.5-2.6 2.5-4" />
    </svg>
  ),
  hostedEvent: (
    <svg viewBox="0 0 16 16" fill="none" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" width="11" height="11" aria-hidden="true">
      <rect x="2" y="4" width="12" height="10" rx="1.5" />
      <path d="M5 2v2M11 2v2M2 7h12" />
    </svg>
  ),
  firstContact: (
    <svg viewBox="0 0 16 16" fill="white" width="11" height="11" aria-hidden="true">
      <path d="M8 1l1.8 3.6 4 .6-2.9 2.8.7 4-3.6-1.9L4.4 12l.7-4L2.2 5.2l4-.6z" />
    </svg>
  ),
};

const DOT_BG: Record<DotType, string> = {
  meeting:      '#3B82F6',
  followup:     '#22C55E',
  touchpoint:   '#F59E0B',
  hostedEvent:  '#0D9488',
  firstContact: '#8B5CF6',
};

function ActivityDot({ type, tooltip }: { type: DotType; tooltip: string }) {
  return (
    <Tooltip text={tooltip}>
      <div
        className="flex items-center justify-center rounded-full flex-shrink-0"
        style={{ width: 22, height: 22, backgroundColor: DOT_BG[type] }}
      >
        {DOT_ICONS[type]}
      </div>
    </Tooltip>
  );
}

// ─── Cell dots builder ────────────────────────────────────────────────────────

function buildDots(
  attendeeId: number | null, // null = company-level aggregate
  conferenceId: number,
  activity: ActivityData,
  attendeeIds: number[],
): Array<{ type: DotType; tooltip: string }> {
  const ids = attendeeId !== null ? [attendeeId] : attendeeIds;
  const dots: Array<{ type: DotType; tooltip: string }> = [];

  // First contact (only for individual rows)
  if (attendeeId !== null) {
    const isFirst = activity.firstContacts.some(
      fc => fc.attendeeId === attendeeId && fc.conferenceId === conferenceId,
    );
    if (isFirst) dots.push({ type: 'firstContact', tooltip: 'First contact' });
  }

  // Meetings
  const confMeetings = activity.meetings.filter(
    m => ids.includes(m.attendeeId) && m.conferenceId === conferenceId,
  );
  if (confMeetings.length > 0) {
    const tooltip =
      confMeetings.length === 1
        ? confMeetings[0].outcome
          ? `Meeting · ${confMeetings[0].outcome}`
          : '1 meeting'
        : `${confMeetings.length} meetings`;
    dots.push({ type: 'meeting', tooltip });
  }

  // Follow-ups
  const confFollowUps = activity.followUps.filter(
    f => ids.includes(f.attendeeId) && f.conferenceId === conferenceId,
  );
  if (confFollowUps.length > 0) {
    const allDone = confFollowUps.every(f => f.completed);
    const tooltip =
      confFollowUps.length === 1
        ? confFollowUps[0].completed
          ? 'Follow-up ✓'
          : 'Follow-up pending'
        : allDone
        ? `${confFollowUps.length} follow-ups ✓`
        : `${confFollowUps.length} follow-ups`;
    dots.push({ type: 'followup', tooltip });
  }

  // Touchpoints
  const confTouchpoints = activity.touchpoints.filter(
    t => ids.includes(t.attendeeId) && t.conferenceId === conferenceId,
  );
  if (confTouchpoints.length > 0) {
    const tooltip =
      confTouchpoints.length === 1 ? 'Touchpoint' : `${confTouchpoints.length} touchpoints`;
    dots.push({ type: 'touchpoint', tooltip });
  }

  // Hosted events
  const confHosted = activity.hostedEvents.filter(
    h => ids.includes(h.attendeeId) && h.conferenceId === conferenceId,
  );
  if (confHosted.length > 0) {
    dots.push({ type: 'hostedEvent', tooltip: 'Hosted event ✓' });
  }

  return dots;
}

// ─── Cell ─────────────────────────────────────────────────────────────────────

function ActivityCell({
  dots,
  isCurrent,
  isLast,
}: {
  dots: Array<{ type: DotType; tooltip: string }>;
  isCurrent: boolean;
  isLast: boolean;
}) {
  const style: React.CSSProperties = {
    minWidth: 72,
    width: 72,
    padding: '6px 8px',
    backgroundColor: isCurrent ? '#F0F7FF' : undefined,
    borderLeft: isCurrent ? '0.5px solid #B5D4F4' : undefined,
    borderRight: isCurrent && isLast ? '0.5px solid #B5D4F4' : undefined,
    verticalAlign: 'middle',
  };

  if (dots.length === 0) {
    return (
      <td style={style} className="text-center">
        <span className="text-gray-200 text-sm select-none">—</span>
      </td>
    );
  }

  return (
    <td style={style}>
      <div className="flex flex-wrap gap-[3px]">
        {dots.map((d, i) => (
          <ActivityDot key={i} type={d.type} tooltip={d.tooltip} />
        ))}
      </div>
    </td>
  );
}

// ─── Section eyebrow ──────────────────────────────────────────────────────────

function SectionEyebrow({ label }: { label: string }) {
  return (
    <tr>
      <td
        colSpan={999}
        className="px-3 pt-4 pb-1.5"
        style={{ position: 'sticky', left: 0, backgroundColor: '#F9FAFB', zIndex: 2 }}
      >
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">
            {label}
          </span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>
      </td>
    </tr>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function ActivityTimelineModal({
  isOpen,
  onClose,
  companyId,
  companyName,
  currentConferenceId,
}: ActivityTimelineModalProps) {
  const [data, setData] = useState<TimelineData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${companyId}/activity-timeline`);
      if (!res.ok) throw new Error(`Failed to load timeline (${res.status})`);
      const json = await res.json() as TimelineData;
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load timeline');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    if (isOpen && !data && !loading) load();
  }, [isOpen, data, loading, load]);

  if (!isOpen) return null;

  const conferences = data?.conferences ?? [];
  const attendees = data?.attendees ?? [];
  const activity = data?.activity ?? {
    meetings: [], followUps: [], touchpoints: [], hostedEvents: [], firstContacts: [],
  };
  const healthByConference = data?.healthByConference ?? [];
  const hasAnyHealthScore = healthByConference.some(h => h.healthScore != null);
  const attendeeIds = attendees.map(a => a.attendeeId);

  const confYear = (c: ConferenceEntry) =>
    c.startDate ? new Date(c.startDate + 'T00:00:00').getFullYear() : '';

  return (
    <div className="fixed inset-0 z-50 flex">
      <style>{`
        @keyframes timelineFadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes timelineSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Scrim */}
      <div
        className="flex-1"
        style={{ animation: 'timelineFadeIn 0.2s ease-out', backgroundColor: 'rgba(0,0,0,0.45)' }}
        onClick={onClose}
      />

      {/* Panel */}
      <div
        className="w-full max-w-5xl bg-white shadow-2xl flex flex-col border-l border-gray-200 overflow-hidden"
        style={{ animation: 'timelineSlideIn 0.25s ease-out' }}
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5 text-brand-secondary flex-shrink-0" aria-hidden="true">
              <line x1="2" y1="10" x2="18" y2="10" />
              <circle cx="6" cy="6" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="10" cy="13" r="1.5" fill="currentColor" stroke="none" />
              <circle cx="14" cy="5" r="1.5" fill="currentColor" stroke="none" />
              <line x1="6" y1="10" x2="6" y2="6" strokeWidth="1.4" />
              <line x1="10" y1="10" x2="10" y2="13" strokeWidth="1.4" />
              <line x1="14" y1="10" x2="14" y2="5" strokeWidth="1.4" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-brand-primary truncate">
                Activity timeline — {companyName}
              </p>
              <p className="text-xs text-gray-400">
                All conferences · {attendees.length} attendee{attendees.length !== 1 ? 's' : ''} · {conferences.length} event{conferences.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-gray-400 hover:text-gray-600 p-1.5 rounded-lg hover:bg-gray-100 transition-colors flex-shrink-0 ml-4"
          >
            <i className="ti ti-x text-base" aria-hidden="true" />
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto overflow-x-auto">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin w-8 h-8 border-4 border-brand-secondary border-t-transparent rounded-full" />
            </div>
          )}

          {error && !loading && (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
              <p className="text-sm text-red-600">{error}</p>
              <button
                type="button"
                onClick={load}
                className="text-xs text-brand-secondary hover:underline"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && !error && data && conferences.length === 0 && (
            <div className="flex flex-col items-center justify-center h-64 gap-2">
              <p className="text-sm font-medium text-gray-500">No conference activity found</p>
              <p className="text-xs text-gray-400">This company has not appeared at any conferences yet.</p>
            </div>
          )}

          {!loading && !error && data && conferences.length > 0 && (
            <table className="border-separate border-spacing-0" style={{ width: 'max-content', minWidth: '100%' }}>
              <colgroup>
                <col style={{ minWidth: 160, width: 160 }} />
                {conferences.map(c => (
                  <col key={c.conferenceId} style={{ minWidth: 72, width: 72 }} />
                ))}
              </colgroup>

              {/* Conference header row */}
              <thead>
                <tr>
                  {/* Sticky label cell */}
                  <th
                    className="text-left px-3 py-3 text-xs font-medium text-gray-400 border-b border-gray-100 bg-white"
                    style={{ position: 'sticky', left: 0, zIndex: 3 }}
                  />
                  {conferences.map(c => {
                    const isCurrent = c.conferenceId === currentConferenceId;
                    return (
                      <th
                        key={c.conferenceId}
                        className="px-2 py-2 text-center border-b border-gray-100"
                        style={{
                          backgroundColor: isCurrent ? '#F0F7FF' : '#FFFFFF',
                          borderLeft: isCurrent ? '0.5px solid #B5D4F4' : undefined,
                          borderRight: isCurrent ? '0.5px solid #B5D4F4' : undefined,
                          verticalAlign: 'bottom',
                        }}
                      >
                        <div
                          className={`inline-flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border text-[10px] font-semibold leading-tight ${
                            isCurrent
                              ? 'bg-blue-50 border-blue-200 text-blue-800'
                              : 'bg-gray-50 border-gray-200 text-gray-600'
                          }`}
                        >
                          <span className="max-w-[60px] truncate text-center">{c.conferenceName}</span>
                          <span>
                            {confYear(c)}{isCurrent ? ' ←' : ''}
                          </span>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {/* ── Company-level section ── */}
                <SectionEyebrow label="Company-level activity" />

                {/* Company aggregate row */}
                <tr className="hover:bg-gray-50/50">
                  <td
                    className="px-3 py-2 border-b border-gray-50"
                    style={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 2 }}
                  >
                    <p className="text-xs font-semibold text-gray-800 truncate">{companyName}</p>
                    <p className="text-[10px] text-gray-400">All interactions</p>
                  </td>
                  {conferences.map((c, ci) => {
                    const dots = buildDots(null, c.conferenceId, activity, attendeeIds);
                    return (
                      <ActivityCell
                        key={c.conferenceId}
                        dots={dots}
                        isCurrent={c.conferenceId === currentConferenceId}
                        isLast={ci === conferences.length - 1}
                      />
                    );
                  })}
                </tr>

                {/* Health score sub-row — only shown when at least one conference has a score */}
                {hasAnyHealthScore && (
                  <tr>
                    <td
                      className="px-3 py-2 border-b border-gray-100"
                      style={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 2 }}
                    >
                      <p className="text-[10px] text-gray-400 italic">Avg health score</p>
                    </td>
                    {conferences.map(c => {
                      const entry = healthByConference.find(h => h.conferenceId === c.conferenceId);
                      const isCurrent = c.conferenceId === currentConferenceId;
                      return (
                        <td
                          key={c.conferenceId}
                          className="text-center border-b border-gray-100"
                          style={{
                            backgroundColor: isCurrent ? '#F0F7FF' : undefined,
                            borderLeft: isCurrent ? '0.5px solid #B5D4F4' : undefined,
                            borderRight: isCurrent ? '0.5px solid #B5D4F4' : undefined,
                            padding: '6px 4px',
                          }}
                        >
                          {entry?.healthScore != null ? (
                            <span
                              className={`text-[10px] font-semibold tabular-nums ${
                                isCurrent ? 'text-blue-600' : 'text-gray-500'
                              }`}
                            >
                              {entry.healthScore}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                )}

                {/* ── Individual attendees section ── */}
                {attendees.length > 0 && (
                  <>
                    <SectionEyebrow label="Individual attendees" />
                    {attendees.map(a => (
                      <tr key={a.attendeeId} className="hover:bg-gray-50/50">
                        <td
                          className="px-3 py-2 border-b border-gray-50"
                          style={{ position: 'sticky', left: 0, backgroundColor: 'white', zIndex: 2 }}
                        >
                          <p className="text-xs font-medium text-gray-800 truncate">
                            {a.firstName} {a.lastName}
                          </p>
                          {a.title && (
                            <p className="text-[10px] text-gray-400 truncate">{a.title}</p>
                          )}
                        </td>
                        {conferences.map((c, ci) => {
                          const dots = buildDots(a.attendeeId, c.conferenceId, activity, attendeeIds);
                          return (
                            <ActivityCell
                              key={c.conferenceId}
                              dots={dots}
                              isCurrent={c.conferenceId === currentConferenceId}
                              isLast={ci === conferences.length - 1}
                            />
                          );
                        })}
                      </tr>
                    ))}
                  </>
                )}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Legend footer ── */}
        {!loading && !error && data && conferences.length > 0 && (
          <div className="flex-shrink-0 flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50">
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5">
              {(Object.keys(DOT_BG) as DotType[]).map(type => (
                <div key={type} className="flex items-center gap-1.5">
                  <div
                    className="flex items-center justify-center rounded-full flex-shrink-0"
                    style={{ width: 18, height: 18, backgroundColor: DOT_BG[type] }}
                  >
                    {DOT_ICONS[type]}
                  </div>
                  <span className="text-[10px] text-gray-500 capitalize">
                    {type === 'firstContact'
                      ? 'First contact'
                      : type === 'hostedEvent'
                      ? 'Hosted event'
                      : type === 'followup'
                      ? 'Follow-up'
                      : type.charAt(0).toUpperCase() + type.slice(1)}
                  </span>
                </div>
              ))}
            </div>
            {currentConferenceId && (
              <div className="flex items-center gap-1.5 text-[10px] text-gray-400 flex-shrink-0 ml-4">
                <div
                  className="inline-flex items-center px-1.5 py-0.5 rounded border border-blue-200 bg-blue-50 text-blue-700 font-semibold"
                  style={{ fontSize: 10 }}
                >
                  ←
                </div>
                <span>Current conference</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
