'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { useConferenceReviewModals } from '@/lib/ConferenceReviewModalsContext';
import { DraggableTabNav } from './DraggableTabNav';
import { RecordDrawerCtx } from './pre-conference/RecordDrawerContext';
import { LandscapeTab } from './pre-conference/LandscapeTab';
import { IcpCompaniesTab } from './pre-conference/IcpCompaniesTab';
import { MeetingsTab } from './pre-conference/MeetingsTab';
import { SocialEventsTab } from './pre-conference/SocialEventsTab';
import { ByRepTab } from './pre-conference/ByRepTab';
import { RelationshipsTab } from './pre-conference/RelationshipsTab';
import { ConferenceTargetsTab } from './pre-conference/ConferenceTargetsTab';
import { TargetRecommendationsTab } from './pre-conference/TargetRecommendationsTab';
import { ProductIcpTab } from './pre-conference/ProductIcpTab';
import { type Meeting } from './MeetingsTable';
export type { StrategyAssessment } from '@/lib/strategyAssessment';

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
  clientCompanies: ClientCompanyEntry[];
  competitorCompanies: ClientCompanyEntry[];
  clientColor: string;
  competitorColor: string | null;
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
  companyWse: number | null;
  assignedUserNames: string[];
  tier: string;
}

export interface ProductIcpAttendee {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  function: string | null;
  seniority: string | null;
  health: number;
  assignedUserNames: string[];
}

export interface ProductIcpCompany {
  companyId: number;
  companyName: string;
  assignedUserNames: string[];
  attendees: ProductIcpAttendee[];
}

export interface ProductIcpEntry {
  product: string;
  color: string | null;
  categoryId: number | null;
  categoryLabel: string;
  categoryColor: string | null;
  companies: ProductIcpCompany[];
}

export interface ProductIcpV2Attendee {
  id: number;
  firstName: string;
  lastName: string;
  title: string | null;
  function: string | null;
  seniority: string | null;
  health: number;
  companyId: number | null;
  companyName: string;
  companyAssignedUserNames: string[];
  companyWse: number | null;
  companyIcp: string | null;
}

export interface ProductIcpV2Product {
  id: number;
  name: string;
  meta: string | null;
  color: string | null;
  categoryId: number | null;
  categoryLabel: string;
  categoryColor: string | null;
}

export interface PreConferenceData {
  summary: PreConferenceSummary;
  landscape: LandscapeData;
  icpCompanies: IcpCompany[];
  meetings: MeetingRow[];
  socialEvents: SocialEventRow[];
  byRep: ByRepEntry[];
  relationships: RelationshipRow[];
  productIcp: ProductIcpEntry[];
  strategyAssessment: import('@/lib/strategyAssessment').StrategyAssessment | null;
  productCatalog: ProductIcpV2Product[];
  icpAttendees: ProductIcpV2Attendee[];
  industryOptions: Array<{ id: number; value: string }>;
}

type TabKey = 'landscape' | 'icp' | 'meetings' | 'social' | 'by-rep' | 'relationships' | 'product_icp' | 'conference_targets' | 'target_recommendations';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'landscape', label: 'Landscape' },
  { key: 'icp', label: 'ICP Companies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'social', label: 'Social Events' },
  { key: 'by-rep', label: 'By Rep' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'product_icp', label: 'Product ICP' },
  { key: 'conference_targets', label: 'Conference Targets' },
  { key: 'target_recommendations', label: 'Target Recommendations' },
];

function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border-2 border-brand-accent p-3 bg-white flex flex-col items-center gap-0.5 min-w-0">
      <div className="text-xl font-bold text-brand-primary leading-tight">{value}</div>
      <div className="text-sm font-semibold text-gray-500 text-center truncate w-full">{label}</div>
    </div>
  );
}

// Page-local trigger button — the heavy modal itself is mounted once at the app
// root (see PreConferenceReviewModal) so it survives navigation while minimized.
export function PreConferenceReview({ conferenceId, conferenceName, targetsReadOnly = false }: { conferenceId: number; conferenceName: string; targetsReadOnly?: boolean }) {
  const { openPreConference } = useConferenceReviewModals();
  return (
    <button
      onClick={() => openPreConference(conferenceId, conferenceName, targetsReadOnly)}
      className="flex items-center gap-1 py-1 px-1 text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors whitespace-nowrap"
    >
      <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      Pre-Conference
    </button>
  );
}

export function PreConferenceReviewModal() {
  const {
    preConference: slot,
    minimizePreConference,
    closePreConference,
  } = useConferenceReviewModals();

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreConferenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('landscape');
  const [targetMap, setTargetMap] = useState<Map<number, TargetEntry>>(new Map());
  const [statsOpen, setStatsOpen] = useState(true);
  const [recordDrawer, setRecordDrawer] = useState<{ type: 'attendee' | 'company'; id: number } | null>(null);
  const openRecord = useCallback((type: 'attendee' | 'company', id: number) => setRecordDrawer({ type, id }), []);
  const closeRecord = useCallback(() => setRecordDrawer(null), []);

  // Cache: avoid reloading if data is less than 5 minutes old
  const loadedAtRef = useRef<number | null>(null);
  const loadedForIdRef = useRef<number | null>(null);
  const CACHE_TTL_MS = 5 * 60 * 1000;

  // Cycling loading text
  const LOADING_LINES = ['Your Pre-Conference Score is Loading', 'Compiling Relevant Data', 'Scoring Attendee Targets'];
  const [loadingLineIdx, setLoadingLineIdx] = useState(0);
  const loadingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (loading && !data) {
      setLoadingLineIdx(0);
      loadingIntervalRef.current = setInterval(() => {
        setLoadingLineIdx(i => (i + 1) % LOADING_LINES.length);
      }, 5000);
    } else {
      if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current);
    }
    return () => { if (loadingIntervalRef.current) clearInterval(loadingIntervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, data]);

  const tabConfig = useSectionConfig('pre_conference_review');
  const visibleTabs = useMemo(() => {
    if (tabConfig.orderedKeys.length === 0) return TABS;
    return tabConfig.orderedKeys
      .filter(k => tabConfig.isVisible(k))
      .map(k => TABS.find(t => t.key === k))
      .filter((t): t is { key: TabKey; label: string } => t !== undefined)
      .map(t => ({ key: t.key, label: tabConfig.getLabel(t.key) }));
  }, [tabConfig]);

  const load = useCallback(async (id: number) => {
    if (loadedForIdRef.current !== id) {
      setData(null);
      setTargetMap(new Map());
      setActiveTab('landscape');
      loadedAtRef.current = null;
    } else if (data && loadedAtRef.current && Date.now() - loadedAtRef.current < CACHE_TTL_MS) {
      // Use cached data if fresh
      return;
    }
    loadedForIdRef.current = id;
    setLoading(true);
    setError(null);
    try {
      const [confRes, targetsRes] = await Promise.all([
        fetch(`/api/conferences/${id}/pre-conference`),
        fetch(`/api/conferences/${id}/targets`),
      ]);
      if (!confRes.ok) throw new Error('Failed to load');
      const json: PreConferenceData = await confRes.json();
      setData(json);
      loadedAtRef.current = Date.now();
      if (targetsRes.ok) {
        const tArr = await targetsRes.json() as TargetEntry[];
        setTargetMap(new Map(tArr.map(t => [t.attendeeId, t])));
      }
    } catch {
      setError('Failed to load pre-conference data.');
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (slot.isOpen && slot.conferenceId != null) {
      load(slot.conferenceId);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slot.isOpen, slot.conferenceId]);

  const conferenceId = slot.conferenceId ?? 0;
  const conferenceName = slot.conferenceName;
  const targetsReadOnly = slot.targetsReadOnly;

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

  const addTargetWithTier = useCallback(async (entry: Omit<TargetEntry, 'tier'>, tier: string) => {
    if (targetMap.has(entry.attendeeId)) return;
    setTargetMap(prev => new Map(prev).set(entry.attendeeId, { ...entry, tier }));
    try {
      await fetch(`/api/conferences/${conferenceId}/targets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attendee_id: entry.attendeeId }),
      });
      if (tier !== 'unassigned') {
        await fetch(`/api/conferences/${conferenceId}/targets/${entry.attendeeId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier }),
        });
      }
    } catch {
      setTargetMap(prev => { const next = new Map(prev); next.delete(entry.attendeeId); return next; });
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

  // Optimistically reflect a meeting scheduled from Conference Targets (or anywhere else
  // NewMeetingModal is used within this conference) in this modal's own Meetings tab too,
  // instead of requiring a reload.
  const handleMeetingScheduled = useCallback((meeting: Meeting) => {
    if (meeting.conference_id !== conferenceId) return;
    setData(prev => {
      if (!prev) return prev;
      if (prev.meetings.some(m => m.id === meeting.id)) return prev;
      return {
        ...prev,
        meetings: [{
          id: meeting.id,
          attendee_id: meeting.attendee_id,
          meeting_date: meeting.meeting_date,
          meeting_time: meeting.meeting_time,
          location: meeting.location,
          scheduled_by: meeting.scheduled_by,
          outcome: meeting.outcome,
          meeting_type: meeting.meeting_type,
          first_name: meeting.first_name,
          last_name: meeting.last_name,
          title: meeting.title,
          company_name: meeting.company_name,
          company_id: meeting.company_id,
          hasConflict: false,
        }, ...prev.meetings],
      };
    });
  }, [conferenceId]);

  if (!slot.isOpen) return null;

  const handleClose = () => {
    closePreConference();
    closeRecord();
    setData(null);
    loadedForIdRef.current = null;
  };

  const minimized = slot.isMinimized;

  return (
    <RecordDrawerCtx.Provider value={openRecord}>
      <div className={`fixed inset-0 z-50 ${minimized ? 'pointer-events-none' : ''}`} style={{ animation: 'fadeUp 0.2s ease-out' }}>
        <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-300 ease-in-out ${minimized ? 'opacity-0' : 'opacity-100'}`}
          onClick={() => { minimizePreConference(); closeRecord(); }}
        />
        <div className="absolute inset-0 sm:left-64 sm:flex sm:items-center sm:justify-center sm:p-5">
          <div
            className={`relative w-full h-full sm:h-[85vh] sm:max-w-[1440px] flex flex-col bg-white sm:rounded-xl sm:shadow-2xl overflow-hidden transition-all duration-300 ease-in-out origin-bottom-left
              ${minimized ? 'opacity-0 scale-50 translate-y-[40vh] -translate-x-[20vw]' : 'opacity-100 scale-100 translate-y-0 translate-x-0'}`}
          >
            {/* Panel header */}
            <div className="bg-brand-primary px-6 py-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-white/60 uppercase tracking-widest font-semibold mb-0.5">Pre-Conference Review</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{conferenceName}</h2>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <button
                    onClick={() => setStatsOpen(v => !v)}
                    className="sm:hidden text-white/70 hover:text-white transition-colors"
                    aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
                  >
                    <svg className={`w-5 h-5 transition-transform duration-200 ${statsOpen ? '' : '-rotate-180'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  <button onClick={() => minimizePreConference()} className="text-white/70 hover:text-white transition-colors" title="Minimize">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
                    </svg>
                  </button>
                  <button onClick={handleClose} className="text-white/70 hover:text-white transition-colors" title="Close">
                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
              {data && (
                <div className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3 sm:grid ${statsOpen ? 'grid' : 'hidden'}`}>
                  <StatPill label="Attendees" value={data.summary.totalAttendees} />
                  <StatPill label="Companies" value={data.summary.totalCompanies} />
                  <StatPill label="ICP" value={data.summary.icpCount} />
                  <StatPill label="Targets" value={targetMap.size} />
                  <StatPill label="Meetings" value={data.summary.meetingCount} />
                  <StatPill label="Open Follow-ups" value={data.summary.openFollowUps} />
                </div>
              )}
            </div>

            {/* Loading bar */}
            {loading && (
              <div className="flex-shrink-0 h-1 bg-gray-100 overflow-hidden">
                <div className="h-full bg-brand-secondary animate-[loadingBar_1.8s_ease-in-out_infinite]" />
                <style>{`@keyframes loadingBar { 0%{width:0;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0;margin-left:100%} }`}</style>
              </div>
            )}

            {/* Centered loading animation */}
            {loading && !data && (
              <div className="flex-1 flex flex-col items-center justify-center gap-4">
                <svg className="w-10 h-10 animate-spin text-brand-primary" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                <p className="text-sm font-medium text-gray-500 transition-all duration-500">
                  {LOADING_LINES[loadingLineIdx]}
                </p>
              </div>
            )}

            {/* Error state */}
            {error && !loading && (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-center">
                  <p className="text-gray-500 mb-3">{error}</p>
                  <button onClick={() => load(conferenceId)} className="btn-primary text-sm">Try again</button>
                </div>
              </div>
            )}

            {/* Tab nav — only when data is ready */}
            {data && (
              <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
                <DraggableTabNav
                  tabs={visibleTabs}
                  activeKey={activeTab}
                  onSelect={key => setActiveTab(key as TabKey)}
                  onReorder={tabConfig.reorderTabs}
                  renderTab={(t, isActive) => ({
                    className: isActive ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-500 hover:text-gray-700',
                  })}
                />
              </div>
            )}

            {/* Tab content */}
            {data && <div className="flex-1 overflow-y-auto p-4 sm:p-6">
              {activeTab === 'landscape' && (
                <LandscapeTab
                  data={data.landscape}
                  targetMap={targetMap}
                  onToggleTarget={toggleTarget}
                  strategyAssessment={data.strategyAssessment ?? null}
                  meetingAttendeeIds={meetingAttendeeIds}
                  conferenceId={conferenceId}
                  conferenceName={conferenceName}
                  byRep={data.byRep}
                  icpCompanies={data.icpCompanies}
                  relationships={data.relationships}
                  onStrategyUpdated={() => load(conferenceId)}
                />
              )}
              {activeTab === 'icp' && (
                <IcpCompaniesTab companies={data.icpCompanies} targetMap={targetMap} onToggleTarget={toggleTarget} readOnly={targetsReadOnly} />
              )}
              {activeTab === 'meetings' && <MeetingsTab meetings={data.meetings} />}
              {activeTab === 'social' && <SocialEventsTab events={data.socialEvents} />}
              {activeTab === 'by-rep' && (
                <ByRepTab entries={data.byRep} conferenceId={conferenceId} conferenceName={conferenceName} targetMap={targetMap} onToggleTarget={toggleTarget} readOnly={targetsReadOnly} />
              )}
              {activeTab === 'relationships' && (
                <RelationshipsTab relationships={data.relationships} targetMap={targetMap} onToggleTarget={toggleTarget} readOnly={targetsReadOnly} />
              )}
              {activeTab === 'product_icp' && (
                <ProductIcpTab
                  conferenceId={conferenceId}
                  targetMap={targetMap}
                  onToggleTarget={toggleTarget}
                  readOnly={targetsReadOnly}
                />
              )}
              {activeTab === 'conference_targets' && (
                <ConferenceTargetsTab
                  conferenceId={conferenceId}
                  conferenceName={conferenceName}
                  targetMap={targetMap}
                  meetingAttendeeIds={meetingAttendeeIds}
                  onToggleTarget={toggleTarget}
                  onSetTier={setTargetTier}
                  readOnly={targetsReadOnly}
                  onMeetingScheduled={handleMeetingScheduled}
                />
              )}
              {activeTab === 'target_recommendations' && (
                <TargetRecommendationsTab
                  conferenceId={conferenceId}
                  targetMap={targetMap}
                  onAddTargetWithTier={targetsReadOnly ? undefined : addTargetWithTier}
                />
              )}
            </div>}
          </div>

          {/* Record drawer — slides up from the bottom on mobile, in from the right on desktop */}
          {recordDrawer != null && (
            <>
              <div className="fixed inset-0 z-[59] bg-black/30" onClick={closeRecord} />
              <div
                className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[85vh] sm:h-screen w-full sm:w-[400px] bg-white border-t sm:border-t-0 sm:border-l border-gray-200 shadow-2xl z-[60] flex flex-col overflow-hidden rounded-t-2xl sm:rounded-none"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0 bg-white">
                  <a
                    href={`/${recordDrawer.type === 'attendee' ? 'attendees' : 'companies'}/${recordDrawer.id}`}
                    className="text-xs text-brand-secondary hover:underline font-medium"
                  >
                    Go to {recordDrawer.type === 'attendee' ? 'Attendee' : 'Company'} Record →
                  </a>
                  <button type="button" onClick={closeRecord} className="text-gray-400 hover:text-gray-600 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <iframe
                  key={`${recordDrawer.type}-${recordDrawer.id}`}
                  src={`/${recordDrawer.type === 'attendee' ? 'attendees' : 'companies'}/${recordDrawer.id}?embed=true`}
                  className="flex-1 border-0 w-full"
                  title={`${recordDrawer.type} record`}
                />
              </div>
            </>
          )}
        </div>
      </div>
      </RecordDrawerCtx.Provider>
  );
}
