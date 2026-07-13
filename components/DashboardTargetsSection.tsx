'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useActiveConference } from '@/components/ActiveConferenceContext';
import type { DashboardConference } from './RecentSection';
import { useAvgCostPerUnit, formatValuePill } from '@/lib/useAvgCostPerUnit';
import { useDrawerResize } from '@/lib/useDrawerResize';

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
    activeBg: 'bg-brand-highlight/10',
    activeBorder: 'border-brand-highlight/40',
    activeText: 'text-brand-highlight',
    cardBorder: 'border-brand-highlight/40',
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
}: {
  entry: TargetEntry;
  hasMeeting: boolean;
  avgCostPerUnit: number;
  onAttendeeClick: (id: number, name: string) => void;
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

  const tierCounts: Record<string, number> = {
    '1': targets.filter(t => t.tier === '1').length,
    '2': targets.filter(t => t.tier === '2').length,
    '3': targets.filter(t => t.tier === '3').length,
    'unassigned': targets.filter(t => t.tier === 'unassigned').length,
  };

  function toggleTier(key: string) {
    setSelectedTier(prev => (prev === key ? null : key));
  }

  const filteredTargets = targets
    .filter(t => selectedTier === null || t.tier === selectedTier)
    .sort((a, b) => TIER_ORDER.indexOf(a.tier) - TIER_ORDER.indexOf(b.tier));

  return (
    <div className="flex flex-col gap-4">
      {/* Header row */}
      <div className="flex flex-col gap-2">
        <h2 className="text-lg font-semibold text-brand-primary font-serif flex items-center gap-2">
          Targets
          <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-red-100">
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
        </h2>
        {sortedConferences.length > 0 && (
          <select
            value={selectedConfId ?? ''}
            onChange={e => {
              setSelectedConfId(Number(e.target.value));
              setSelectedTier(null);
            }}
            className="input-field text-sm w-full"
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
        )}
      </div>

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

      {/* Target cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : filteredTargets.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">
          {targets.length === 0
            ? 'No targets set for this conference.'
            : 'No targets match the selected filters.'}
        </p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {filteredTargets.map(entry => (
            <DashboardTargetCard
              key={entry.attendeeId}
              entry={entry}
              hasMeeting={meetingAttendeeIds.has(entry.attendeeId)}
              avgCostPerUnit={avgCostPerUnit}
              onAttendeeClick={(id, name) => { setDrawerAttendeeId(id); setDrawerAttendeeName(name); }}
            />
          ))}
        </div>
      )}

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
