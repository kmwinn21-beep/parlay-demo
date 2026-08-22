'use client';

import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from 'react';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import { useUser } from '@/components/UserContext';
import type { DashboardConference } from './RecentSection';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';
import { useDrawerResize } from '@/lib/useDrawerResize';
import { KebabMenu } from '@/components/KebabMenu';
import { NewMeetingModal } from '@/components/NewMeetingModal';
import { NewNoteModal } from '@/components/NewNoteModal';
import { AssignFollowUpModal } from '@/components/AssignFollowUpModal';
import { TouchpointQuickModal } from '@/components/DashboardActionCard';
import { useMobileCollapse } from '@/lib/useMobileCollapse';

/** Steps the target grid one row at a time. */
function PagerButton({ dir, disabled, onClick }: {
  dir: 'up' | 'down';
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === 'up' ? 'Show previous targets' : 'Show more targets'}
      title={dir === 'up' ? 'Previous' : 'More'}
      className="p-1 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent disabled:cursor-default"
    >
      <svg
        className={`w-4 h-4 ${dir === 'up' ? 'rotate-180' : ''}`}
        fill="none" stroke="currentColor" viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );
}

interface TargetEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  companyName: string | null;
  companyId: number | null;
  companyWse: number | null;
  assignedUserNames: string[];
  tier: string;
}

type TargetAction = 'touchpoint' | 'note' | 'followup' | 'meeting';

const TIER_ORDER = ['1', '2', '3', 'unassigned'];

const TIER_CONFIG = [
  {
    key: '1',
    label: 'Must Target',
    activeBg: 'bg-red-50',
    activeBorder: 'border-red-200',
    activeText: 'text-red-600',
    cardBorder: 'border-red-300',
    cardBg: 'bg-white',
  },
  {
    key: '2',
    label: 'High Priority',
    activeBg: 'bg-brand-primary/10',
    activeBorder: 'border-brand-primary/40',
    activeText: 'text-brand-primary',
    cardBorder: 'border-brand-primary/40',
    cardBg: 'bg-white',
  },
  {
    key: '3',
    label: 'Worth Engaging',
    activeBg: 'bg-brand-secondary/10',
    activeBorder: 'border-brand-secondary',
    activeText: 'text-brand-secondary',
    cardBorder: 'border-brand-secondary',
    cardBg: 'bg-white',
  },
  {
    key: 'unassigned',
    label: 'Monitor',
    activeBg: 'bg-gray-50',
    activeBorder: 'border-gray-200',
    activeText: 'text-gray-500',
    cardBorder: 'border-gray-200',
    cardBg: 'bg-white',
  },
];

const SENIORITY_COLORS: Record<string, string> = {
  'C-Suite': '#7c3aed',
  'VP/SVP': '#1B76BC',
  'Director': '#059669',
  'Manager': '#f59e0b',
  'Other': '#6b7280',
};

function SeniorityPill({ seniority }: { seniority: string | null }) {
  if (!seniority) return null;
  const color = SENIORITY_COLORS[seniority] ?? '#6b7280';
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border"
      style={{ color, borderColor: `${color}60`, backgroundColor: `${color}14` }}
    >
      {seniority}
    </span>
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  return name.trim().substring(0, 2).toUpperCase();
}

function UserPill({ name }: { name: string }) {
  return (
    <span
      title={name}
      className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300 whitespace-nowrap"
    >
      <svg className="w-3 h-3 opacity-70 flex-shrink-0 mr-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
      </svg>
      {getInitials(name)}
    </span>
  );
}

function DashboardTargetCard({
  entry,
  hasMeeting,
  avgCostPerUnit,
  onAttendeeClick,
  onAction,
}: {
  entry: TargetEntry;
  hasMeeting: boolean;
  avgCostPerUnit: number;
  onAttendeeClick: (id: number, name: string) => void;
  /** Adds the actions kebab to the card header. */
  onAction?: (action: TargetAction, entry: TargetEntry) => void;
}) {
  const valuePill = formatValuePill(entry.companyWse, avgCostPerUnit);
  const tierConfig = TIER_CONFIG.find(t => t.key === entry.tier);
  return (
    <div className={`${tierConfig?.cardBg ?? 'bg-white'} border-2 ${tierConfig?.cardBorder ?? 'border-gray-200'} rounded-xl p-3 hover:shadow-sm transition-all`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onAttendeeClick(entry.attendeeId, `${entry.firstName} ${entry.lastName}`)}
            className="text-sm font-semibold text-brand-primary hover:text-brand-secondary leading-tight block truncate text-left w-full"
          >
            {entry.firstName} {entry.lastName}
            {entry.title && <span className="font-normal text-xs text-gray-500">, {entry.title}</span>}
          </button>
          {entry.companyName && (
            <p className="text-xs text-gray-400 truncate mt-0.5">{entry.companyName}</p>
          )}
        </div>
        {onAction && (
          <KebabMenu
            title="Log activity"
            className="flex-shrink-0 -mr-1 -mt-1"
            items={[
              { label: '+ Touchpoint', onClick: () => onAction('touchpoint', entry) },
              { label: '+ Note', onClick: () => onAction('note', entry) },
              { label: '+ Follow Up', onClick: () => onAction('followup', entry) },
              { label: '+ Meeting', onClick: () => onAction('meeting', entry) },
            ]}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1 mt-1">
        {entry.seniority && <SeniorityPill seniority={entry.seniority} />}
        {entry.assignedUserNames[0] && <UserPill name={entry.assignedUserNames[0]} />}
        {hasMeeting && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
            <svg className="w-3 h-3 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
            Scheduled
          </span>
        )}
        {valuePill && (
          <span className="ml-auto inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700 border border-green-300 whitespace-nowrap">
            {valuePill}
          </span>
        )}
      </div>
    </div>
  );
}

function sortConferencesForDropdown(conferences: DashboardConference[]): DashboardConference[] {
  const inProgress = conferences.filter(c => c.status === 'in_progress');
  const upcoming = conferences
    .filter(c => c.status === 'upcoming')
    .sort((a, b) => a.start_date.localeCompare(b.start_date));
  const past = conferences
    .filter(c => c.status === 'past')
    .sort((a, b) => b.start_date.localeCompare(a.start_date));
  return [...inProgress, ...upcoming, ...past];
}

export function DashboardTargetsSection({ allConferences }: { allConferences: DashboardConference[] }) {
  const sortedConferences = useMemo(() => sortConferencesForDropdown(allConferences), [allConferences]);
  const defaultConf = sortedConferences[0] ?? null;

  const avgCostPerUnit = useAvgCostPerUnit();
  const { activeConference } = useActiveConference();
  const [selectedConfId, setSelectedConfId] = useState<number | null>(defaultConf?.id ?? null);
  const [targets, setTargets] = useState<TargetEntry[]>([]);
  const [meetingAttendeeIds, setMeetingAttendeeIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);
  const { user: currentUser } = useUser();
  const [myTargetsOnly, setMyTargetsOnly] = useState(false);
  // Targets carry resolved rep names rather than config ids, so the match is
  // by name — repName first, since that is the config_options value the
  // targets are attributed to.
  const myRepNames = useMemo(() => {
    const names = [currentUser?.repName, currentUser?.displayName]
      .map(n => n?.trim().toLowerCase())
      .filter((n): n is string => !!n);
    return new Set(names);
  }, [currentUser?.repName, currentUser?.displayName]);
  const { panelStyle: attendeePanelStyle, handleResizeStart: attendeeResizeStart } = useDrawerResize(480);
  const [drawerAttendeeId, setDrawerAttendeeId] = useState<number | null>(null);
  const [drawerAttendeeName, setDrawerAttendeeName] = useState<string>('');

  const fetchTargets = useCallback(async (confId: number) => {
    setLoading(true);
    try {
      const [targetsRes, meetingsRes] = await Promise.all([
        fetch(`/api/conferences/${confId}/targets`),
        fetch(`/api/meetings?conference_id=${confId}`),
      ]);
      if (targetsRes.ok) {
        const data = await targetsRes.json() as TargetEntry[];
        setTargets(data);
      }
      if (meetingsRes.ok) {
        const meetings = await meetingsRes.json() as { attendee_id: number }[];
        setMeetingAttendeeIds(new Set(meetings.map(m => m.attendee_id)));
      } else {
        setMeetingAttendeeIds(new Set());
      }
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }, []);

  // Sync dropdown with active conference context whenever it changes
  useEffect(() => {
    if (!activeConference) return;
    const match = sortedConferences.find(c => c.id === activeConference.id);
    if (match) setSelectedConfId(match.id);
  }, [activeConference, sortedConferences]);

  useEffect(() => {
    if (selectedConfId != null) {
      fetchTargets(selectedConfId);
    }
  }, [selectedConfId, fetchTargets]);

  const isMine = useCallback(
    (t: TargetEntry) => t.assignedUserNames.some(n => myRepNames.has(n.trim().toLowerCase())),
    [myRepNames],
  );

  // Scoped first, so the tier counts describe what the tier buttons will
  // actually show while "My Targets" is on.
  const scopedTargets = useMemo(
    () => (myTargetsOnly ? targets.filter(isMine) : targets),
    [targets, myTargetsOnly, isMine],
  );

  const tierCounts: Record<string, number> = {
    '1': scopedTargets.filter(t => t.tier === '1').length,
    '2': scopedTargets.filter(t => t.tier === '2').length,
    '3': scopedTargets.filter(t => t.tier === '3').length,
    'unassigned': scopedTargets.filter(t => t.tier === 'unassigned').length,
  };

  // Below sm the cards live in a drawer instead of under the tiles, so a tap
  // on a tile both filters (desktop) and opens that tier's list (mobile).
  const [tierDrawerKey, setTierDrawerKey] = useState<string | null>(null);
  // Which activity modal a card's kebab opened, and for whom.
  const [cardAction, setCardAction] = useState<{ action: TargetAction; entry: TargetEntry } | null>(null);
  const { isMobile, expanded, toggle, showBody } = useMobileCollapse();


  function toggleTier(key: string) {
    setSelectedTier(prev => (prev === key ? null : key));
    setTierDrawerKey(prev => (prev === key ? null : key));
  }

  const filteredTargets = scopedTargets
    .filter(t => selectedTier === null || t.tier === selectedTier)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  // ── Desktop: show three rows of cards, page through the rest ───────────────
  // Row heights aren't uniform — a card with a long company name is taller than
  // its neighbours — so rows are measured from the cards themselves rather than
  // assumed, and paging snaps to a real row boundary.
  const VISIBLE_ROWS = 3;
  const gridRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<{ top: number; bottom: number }[]>([]);
  const [viewportH, setViewportH] = useState<number | null>(null);
  const [atTop, setAtTop] = useState(true);
  const [atBottom, setAtBottom] = useState(false);

  const measureRows = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    const kids = Array.from(el.children) as HTMLElement[];
    if (kids.length === 0) { rowsRef.current = []; setViewportH(null); return; }

    // Cards sharing an offsetTop are one grid row; the row's bottom is the
    // tallest card in it.
    const byTop = new Map<number, { top: number; bottom: number }>();
    for (const k of kids) {
      const top = k.offsetTop;
      const bottom = top + k.offsetHeight;
      const row = byTop.get(top);
      if (row) row.bottom = Math.max(row.bottom, bottom);
      else byTop.set(top, { top, bottom });
    }
    const rows = Array.from(byTop.values()).sort((a, b) => a.top - b.top);
    rowsRef.current = rows;
    setViewportH(rows.length > VISIBLE_ROWS ? rows[VISIBLE_ROWS - 1].bottom - rows[0].top : null);
  }, []);

  useLayoutEffect(() => { measureRows(); }, [measureRows, filteredTargets, loading]);

  useEffect(() => {
    const el = gridRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    // Cards reflow on width changes and when their content settles.
    const ro = new ResizeObserver(() => measureRows());
    ro.observe(el);
    Array.from(el.children).forEach(c => ro.observe(c));
    return () => ro.disconnect();
  }, [measureRows, filteredTargets]);

  const syncEdges = useCallback(() => {
    const el = gridRef.current;
    if (!el) return;
    setAtTop(el.scrollTop <= 1);
    setAtBottom(el.scrollTop + el.clientHeight >= el.scrollHeight - 1);
  }, []);

  useEffect(() => { syncEdges(); }, [syncEdges, viewportH, filteredTargets]);

  const pageRows = useCallback((dir: 1 | -1) => {
    const el = gridRef.current;
    const rows = rowsRef.current;
    if (!el || rows.length === 0) return;
    const base = rows[0].top;
    // The row currently at the top of the viewport, then step one row from it.
    let idx = rows.findIndex(r => r.top - base >= el.scrollTop - 1);
    if (idx < 0) idx = rows.length - 1;
    const next = Math.min(Math.max(idx + dir, 0), rows.length - 1);
    el.scrollTo({ top: rows[next].top - base, behavior: 'smooth' });
  }, []);

  const paged = viewportH != null;

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!isMobile || expanded}
          className={`text-lg font-semibold text-brand-primary font-serif flex items-center gap-2 text-left group ${isMobile ? '' : 'cursor-default'}`}
        >
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100 flex-shrink-0">
            <svg
              className="w-5 h-5 text-red-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <circle cx="12" cy="12" r="4" />
              <line x1="12" y1="2" x2="12" y2="6" />
              <line x1="12" y1="18" x2="12" y2="22" />
              <line x1="2" y1="12" x2="6" y2="12" />
              <line x1="18" y1="12" x2="22" y2="12" />
            </svg>
          </span>
          Targets
          <svg className={`w-4 h-4 text-gray-400 transition-transform duration-200 lg:hidden ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {showBody && sortedConferences.length > 0 && (
          <div className="flex items-center gap-2">
          <select
            value={selectedConfId ?? ''}
            onChange={e => {
              setSelectedConfId(Number(e.target.value));
              setSelectedTier(null);
              setTierDrawerKey(null);
            }}
            className="input-field text-sm w-full min-w-0"
          >
            {allConferences.some(c => c.status === 'in_progress') && (
              <optgroup label="In Progress">
                {allConferences.filter(c => c.status === 'in_progress').map(conf => (
                  <option key={conf.id} value={conf.id}>{conf.name}</option>
                ))}
              </optgroup>
            )}
            {allConferences.some(c => c.status === 'upcoming') && (
              <optgroup label="Upcoming">
                {allConferences.filter(c => c.status === 'upcoming')
                  .sort((a, b) => a.start_date.localeCompare(b.start_date))
                  .map(conf => (
                    <option key={conf.id} value={conf.id}>{conf.name}</option>
                  ))}
              </optgroup>
            )}
            {allConferences.some(c => c.status === 'past') && (
              <optgroup label="Past">
                {allConferences.filter(c => c.status === 'past')
                  .sort((a, b) => b.start_date.localeCompare(a.start_date))
                  .map(conf => (
                    <option key={conf.id} value={conf.id}>{conf.name}</option>
                  ))}
              </optgroup>
            )}
          </select>
          {currentUser && (
            <button
              type="button"
              onClick={() => setMyTargetsOnly(v => !v)}
              title="Show only targets assigned to me"
              className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap flex-shrink-0 ${
                myTargetsOnly
                  ? 'border-brand-accent bg-brand-accent/20 text-brand-primary'
                  : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-gray-300'
              }`}
            >
              My Targets
            </button>
          )}
          </div>
        )}
      </div>

      {showBody && (<>
      {/* Tier filter cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {TIER_CONFIG.map(tier => {
          const isSelected = selectedTier === tier.key;
          const count = tierCounts[tier.key] ?? 0;
          return (
            <button
              key={tier.key}
              onClick={() => toggleTier(tier.key)}
              className={`rounded-xl border-2 p-3 text-center transition-all cursor-pointer ${
                isSelected
                  ? `${tier.activeBg} ${tier.activeBorder}`
                  : 'bg-gray-100 border-gray-200'
              }`}
            >
              <div className={`text-2xl font-bold leading-tight ${isSelected ? tier.activeText : 'text-gray-400'}`}>
                {count}
              </div>
              <div className={`text-xs font-semibold mt-0.5 ${isSelected ? tier.activeText : 'text-gray-400'}`}>
                {tier.label}
              </div>
            </button>
          );
        })}
      </div>

      {/* Target cards — inline from sm; below that they live in the drawer */}
      {loading ? (
        <div className="hidden sm:grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTargets.length === 0 ? (
        <p className="hidden sm:block text-sm text-gray-400 text-center py-6">
          {targets.length === 0
            ? 'No targets set for this conference.'
            : 'No targets match the selected filters.'}
        </p>
      ) : (
        <div className="hidden sm:block">
          <div
            ref={gridRef}
            onScroll={syncEdges}
            style={viewportH != null ? { maxHeight: viewportH } : undefined}
            className={`relative grid grid-cols-1 sm:grid-cols-2 gap-3 ${paged ? 'overflow-y-auto pr-1' : ''}`}
          >
            {filteredTargets.map(entry => (
              <DashboardTargetCard
                key={entry.attendeeId}
                entry={entry}
                hasMeeting={meetingAttendeeIds.has(entry.attendeeId)}
                avgCostPerUnit={avgCostPerUnit}
                onAttendeeClick={(id, name) => { setDrawerAttendeeId(id); setDrawerAttendeeName(name); }}
                onAction={(action, target) => setCardAction({ action, entry: target })}
              />
            ))}
          </div>

          {/* Only worth showing once there's a fourth row to reach. */}
          {paged && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <PagerButton
                dir="up"
                disabled={atTop}
                onClick={() => pageRows(-1)}
              />
              <PagerButton
                dir="down"
                disabled={atBottom}
                onClick={() => pageRows(1)}
              />
            </div>
          )}
        </div>
      )}

      </>)}

      {/* Mobile: the selected tier's targets, in a drawer */}
      {tierDrawerKey !== null && (() => {
        const tier = TIER_CONFIG.find(t => t.key === tierDrawerKey);
        const tierTargets = scopedTargets.filter(t => t.tier === tierDrawerKey);
        const conferenceName = allConferences.find(c => c.id === selectedConfId)?.name ?? null;
        return (
          <div className="sm:hidden">
            <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setTierDrawerKey(null)} />
            <div className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 h-[85vh] w-full bg-white shadow-2xl flex flex-col rounded-t-2xl z-50">
              <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
                <div className="min-w-0">
                  <h3 className={`text-sm font-semibold ${tier?.activeText ?? 'text-gray-800'}`}>
                    {tier?.label ?? 'Targets'}
                    <span className="ml-1.5 text-xs font-normal text-gray-400">({tierTargets.length})</span>
                  </h3>
                  {conferenceName && (
                    <span className="mt-1 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-100 whitespace-nowrap">
                      {conferenceName}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setTierDrawerKey(null)}
                  className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0"
                  aria-label="Close"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4">
                {tierTargets.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-6">No targets in this tier.</p>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {tierTargets.map(entry => (
                      <DashboardTargetCard
                        key={entry.attendeeId}
                        entry={entry}
                        hasMeeting={meetingAttendeeIds.has(entry.attendeeId)}
                        avgCostPerUnit={avgCostPerUnit}
                        onAttendeeClick={(id, name) => { setDrawerAttendeeId(id); setDrawerAttendeeName(name); }}
                        onAction={(action, target) => setCardAction({ action, entry: target })}
                      />
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Activity modals launched from a target card's kebab — each opens with
          the card's conference, company and attendee already chosen. */}
      {cardAction?.action === 'touchpoint' && (
        <TouchpointQuickModal
          onClose={() => setCardAction(null)}
          defaultConferenceId={selectedConfId}
          defaultCompanyId={cardAction.entry.companyId}
          defaultAttendeeId={cardAction.entry.attendeeId}
        />
      )}
      <NewNoteModal
        isOpen={cardAction?.action === 'note'}
        onClose={() => setCardAction(null)}
        defaultConferenceId={selectedConfId}
        defaultCompanyId={cardAction?.entry.companyId ?? null}
        defaultAttendeeId={cardAction?.entry.attendeeId ?? null}
      />
      <AssignFollowUpModal
        isOpen={cardAction?.action === 'followup'}
        onClose={() => setCardAction(null)}
        onSuccess={() => setCardAction(null)}
        defaultConferenceId={selectedConfId ?? undefined}
        defaultCompanyId={cardAction?.entry.companyId ?? undefined}
        defaultAttendeeId={cardAction?.entry.attendeeId ?? undefined}
      />
      <NewMeetingModal
        isOpen={cardAction?.action === 'meeting'}
        onClose={() => setCardAction(null)}
        defaultConferenceId={selectedConfId ?? undefined}
        prefillCompanyId={cardAction?.entry.companyId ?? undefined}
        prefillAttendeeId={cardAction?.entry.attendeeId ?? undefined}
      />

      {/* Attendee record iframe drawer */}
      {drawerAttendeeId !== null && (
        <>
          <style>{`@keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={() => setDrawerAttendeeId(null)} />
          <div
            className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[90vh] sm:h-auto w-full sm:w-[480px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-50"
            style={attendeePanelStyle}
          >
            <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={attendeeResizeStart}>
              <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
            </div>
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-center gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-gray-800">{drawerAttendeeName}</h3>
                  <p className="text-xs text-gray-500">Attendee Record</p>
                </div>
                <a
                  href={`/attendees/${drawerAttendeeId}`}
                  className="text-xs text-brand-secondary hover:underline font-medium flex-shrink-0"
                >
                  Go to Attendee Record →
                </a>
              </div>
              <button
                type="button"
                onClick={() => setDrawerAttendeeId(null)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-500"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <iframe
              src={`/attendees/${drawerAttendeeId}?embed=true`}
              className="flex-1 w-full border-0"
              title={drawerAttendeeName}
            />
          </div>
        </>
      )}
    </div>
  );
}
