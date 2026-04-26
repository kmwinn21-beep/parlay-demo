'use client';

import { useState, useCallback, useMemo } from 'react';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { LandscapeTab } from './pre-conference/LandscapeTab';
import { IcpCompaniesTab } from './pre-conference/IcpCompaniesTab';
import { MeetingsTab } from './pre-conference/MeetingsTab';
import { SocialEventsTab } from './pre-conference/SocialEventsTab';
import { ByRepTab } from './pre-conference/ByRepTab';
import { RelationshipsTab } from './pre-conference/RelationshipsTab';
import { ConferenceTargetsTab } from './pre-conference/ConferenceTargetsTab';
import { ParlayRecommendationsTab } from './pre-conference/ParlayRecommendationsTab';
export type { ParlayRec, ParlayWatchItem, ParlayRecsData } from '@/app/api/conferences/[id]/parlay-recommendations/route';

export interface PreConferenceSummary {
  conference: { id: number; name: string; start_date: string | null; end_date: string | null; location: string | null };
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  meetingCount: number;
  openFollowUps: number;
  reps: string[];
}

export interface ClientCompanyEntry {
  companyId: number;
  companyName: string;
  wse: number | null;
  attendeeCount: number;
  attendees: { id: number; firstName: string; lastName: string; title: string | null }[];
}

export interface LandscapeData {
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  wseCount: number;
  companyTypeBreakdown: { label: string; count: number }[];
  seniorityBreakdown: { label: string; count: number }[];
  priorOverlapTypeLabel: string;
  priorOverlapCount: number;
  priorOverlapAttendees: { id: number; first_name: string; last_name: string; title: string | null; company_name: string | null; company_id: number | null; seniority: string | null; prior_conference: string; assigned_user_names: string[] }[];
  clientCompanies: ClientCompanyEntry[];
  unitTypeLabel: string;
}

export interface IcpCompany {
  id: number;
  name: string;
  company_type: string | null;
  avgHealth: number;
  assigned_user_names: string[];
  attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null; health: number }[];
}

export interface MeetingRow {
  id: number;
  attendee_id: number;
  meeting_date: string | null;
  meeting_time: string | null;
  location: string | null;
  scheduled_by: string | null;
  outcome: string | null;
  meeting_type: string | null;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  company_id: number | null;
  hasConflict: boolean;
}

export interface SocialEventGuest {
  attendee_id: number;
  first_name: string;
  last_name: string;
  title: string | null;
  company_name: string | null;
  company_id: number | null;
  company_type: string | null;
  rsvp_status: string;
  assigned_user_names: string[];
}

export interface SocialEventRow {
  id: number;
  event_type: string | null;
  event_name: string | null;
  host: string | null;
  location: string | null;
  event_date: string | null;
  event_time: string | null;
  invite_only: string | null;
  notes: string | null;
  internal_attendees: string | null;
  attending_count: number;
  declined_count: number;
  guestList: SocialEventGuest[];
}

export interface CompanyInternalRel {
  rep_names: string[];
  relationship_status: string;
  description: string;
}

export interface ByRepCompany {
  company_id: number;
  company_name: string;
  company_type: string | null;
  relationship_status: string | null;
  description: string | null;
  profit_type: string | null;
  entity_structure: string | null;
  wse: number | null;
  services: string | null;
  icp: string | null;
  company_status: string | null;
  assigned_user_names: string[];
  website: string | null;
  internal_relationships: CompanyInternalRel[];
  attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null; status: string | null; health: number }[];
  notes: { id: number; content: string; created_at: string | null; rep: string | null; attendee_name: string | null; conference_name: string | null }[];
}

export interface ByRepEntry {
  rep: string;
  companies: ByRepCompany[];
}

export interface RelationshipRow {
  id: number;
  company_id: number;
  company_name: string;
  relationship_status: string;
  description: string;
  rep_names: string[];
  contact_names: string[];
  attendees: { id: number; first_name: string; last_name: string; title: string | null; seniority: string | null; health: number }[];
  recentNotes: { id: number; content: string; created_at: string | null; rep: string | null }[];
}

export interface TargetEntry {
  attendeeId: number;
  firstName: string;
  lastName: string;
  title: string | null;
  seniority: string | null;
  companyName: string | null;
  companyId: number | null;
  assignedUserNames: string[];
  tier: string;
}

export interface PreConferenceData {
  summary: PreConferenceSummary;
  landscape: LandscapeData;
  icpCompanies: IcpCompany[];
  meetings: MeetingRow[];
  socialEvents: SocialEventRow[];
  byRep: ByRepEntry[];
  relationships: RelationshipRow[];
}

type TabKey = 'landscape' | 'icp' | 'meetings' | 'social' | 'by-rep' | 'relationships' | 'conference_targets' | 'parlay_recommendations';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'landscape', label: 'Landscape' },
  { key: 'icp', label: 'ICP Companies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'social', label: 'Social Events' },
  { key: 'by-rep', label: 'By Rep' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'conference_targets', label: 'Conference Targets' },
  { key: 'parlay_recommendations', label: 'Parlay Recommendations' },
];

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border-2 border-brand-accent p-3 bg-white flex flex-col items-center gap-0.5 min-w-0">
      <div className="text-xl font-bold text-brand-primary leading-tight">{value}</div>
      <div className="text-sm font-semibold text-gray-500 text-center truncate w-full">{label}</div>
    </div>
  );
}

export function PreConferenceReview({ conferenceId, conferenceName }: { conferenceId: number; conferenceName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreConferenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('landscape');
  const [targetMap, setTargetMap] = useState<Map<number, TargetEntry>>(new Map());
  const [statsOpen, setStatsOpen] = useState(true);

  const tabConfig = useSectionConfig('pre_conference_review');
  const visibleTabs = useMemo(() => {
    if (tabConfig.orderedKeys.length === 0) return TABS;
    return tabConfig.orderedKeys
      .filter(k => tabConfig.isVisible(k))
      .map(k => TABS.find(t => t.key === k))
      .filter((t): t is { key: TabKey; label: string } => t !== undefined)
      .map(t => ({ key: t.key, label: tabConfig.getLabel(t.key) }));
  }, [tabConfig]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [confRes, targetsRes] = await Promise.all([
        fetch(`/api/conferences/${conferenceId}/pre-conference`),
        fetch(`/api/conferences/${conferenceId}/targets`),
      ]);
      if (!confRes.ok) throw new Error('Failed to load');
      const json: PreConferenceData = await confRes.json();
      setData(json);
      if (targetsRes.ok) {
        const tArr = await targetsRes.json() as TargetEntry[];
        setTargetMap(new Map(tArr.map(t => [t.attendeeId, t])));
      }
      setOpen(true);
    } catch {
      setError('Failed to load pre-conference data.');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  const toggleTarget = useCallback(async (entry: Omit<TargetEntry, 'tier'>) => {
    const isTarget = targetMap.has(entry.attendeeId);
    // Optimistic update
    if (isTarget) {
      setTargetMap(prev => { const next = new Map(prev); next.delete(entry.attendeeId); return next; });
    } else {
      setTargetMap(prev => new Map(prev).set(entry.attendeeId, { ...entry, tier: 'unassigned' }));
    }
    try {
      await fetch(`/api/conferences/${conferenceId}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: entry.attendeeId }),
      });
    } catch {
      // Revert on error
      if (isTarget) {
        setTargetMap(prev => new Map(prev).set(entry.attendeeId, { ...entry, tier: 'unassigned' }));
      } else {
        setTargetMap(prev => { const next = new Map(prev); next.delete(entry.attendeeId); return next; });
      }
    }
  }, [conferenceId, targetMap]);

  const setTargetTier = useCallback(async (attendeeId: number, tier: string) => {
    setTargetMap(prev => {
      const next = new Map(prev);
      const entry = next.get(attendeeId);
      if (entry) next.set(attendeeId, { ...entry, tier });
      return next;
    });
    try {
      await fetch(`/api/conferences/${conferenceId}/targets/${attendeeId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier }),
      });
    } catch { /* ignore */ }
  }, [conferenceId]);

  const meetingAttendeeIds = useMemo(
    () => new Set((data?.meetings ?? []).map(m => m.attendee_id)),
    [data?.meetings]
  );

  return (
    <>
      <button onClick={load} disabled={loading} className="flex items-center gap-1.5 py-1 px-1 text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors whitespace-nowrap disabled:opacity-40 disabled:cursor-wait">
        {loading ? (
          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
        Pre-Conference
      </button>

      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

      {open && data && (
        <div className="fixed inset-0 z-50" style={{ animation: 'fadeUp 0.2s ease-out' }}>
          <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-0 sm:inset-4 md:inset-6 flex flex-col bg-white overflow-hidden shadow-2xl sm:rounded-2xl">
            {/* Panel header */}
            <div className="bg-brand-primary px-6 py-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-white/60 uppercase tracking-widest font-semibold mb-0.5">Pre-Conference Review</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{conferenceName}</h2>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  {/* Collapse toggle — mobile only */}
                  <button
                    onClick={() => setStatsOpen(v => !v)}
                    className="sm:hidden text-white/70 hover:text-white transition-colors"
                    aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
                  >
                    <svg className={`w-5 h-5 transition-transform duration-200 ${statsOpen ? '' : '-rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3 sm:grid ${statsOpen ? 'grid' : 'hidden'}`}>
                <StatPill label="Attendees" value={data.summary.totalAttendees} />
                <StatPill label="Companies" value={data.summary.totalCompanies} />
                <StatPill label="ICP" value={data.summary.icpCount} />
                <StatPill label="Targets" value={targetMap.size} />
                <StatPill label="Meetings" value={data.summary.meetingCount} />
                <StatPill label="Open Follow-ups" value={data.summary.openFollowUps} />
              </div>
            </div>

            {/* Tab nav */}
            <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
              <nav className="flex gap-0 px-4">
                {visibleTabs.map((t) => (
                  <button key={t.key} onClick={() => setActiveTab(t.key)}
                    className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${activeTab === t.key ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-500 hover:text-gray-700'}`}>
                    {t.label}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {activeTab === 'landscape' && (
                <LandscapeTab data={data.landscape} targetMap={targetMap} onToggleTarget={toggleTarget} />
              )}
              {activeTab === 'icp' && (
                <IcpCompaniesTab companies={data.icpCompanies} targetMap={targetMap} onToggleTarget={toggleTarget} />
              )}
              {activeTab === 'meetings' && <MeetingsTab meetings={data.meetings} />}
              {activeTab === 'social' && <SocialEventsTab events={data.socialEvents} />}
              {activeTab === 'by-rep' && (
                <ByRepTab entries={data.byRep} conferenceId={conferenceId} conferenceName={conferenceName} targetMap={targetMap} onToggleTarget={toggleTarget} />
              )}
              {activeTab === 'relationships' && (
                <RelationshipsTab relationships={data.relationships} targetMap={targetMap} onToggleTarget={toggleTarget} />
              )}
              {activeTab === 'conference_targets' && (
                <ConferenceTargetsTab
                  conferenceName={conferenceName}
                  targetMap={targetMap}
                  meetingAttendeeIds={meetingAttendeeIds}
                  onToggleTarget={toggleTarget}
                  onSetTier={setTargetTier}
                />
              )}
              {activeTab === 'parlay_recommendations' && (
                <ParlayRecommendationsTab
                  conferenceId={conferenceId}
                  targetMap={targetMap}
                  onToggleTarget={toggleTarget}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
