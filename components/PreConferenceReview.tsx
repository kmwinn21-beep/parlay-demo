'use client';

import { useState, useCallback } from 'react';
import { LandscapeTab } from './pre-conference/LandscapeTab';
import { IcpCompaniesTab } from './pre-conference/IcpCompaniesTab';
import { MeetingsTab } from './pre-conference/MeetingsTab';
import { SocialEventsTab } from './pre-conference/SocialEventsTab';
import { ByRepTab } from './pre-conference/ByRepTab';
import { RelationshipsTab } from './pre-conference/RelationshipsTab';
import { CoverageGapsTab } from './pre-conference/CoverageGapsTab';

export interface PreConferenceSummary {
  conference: { id: number; name: string; start_date: string | null; end_date: string | null; location: string | null };
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  meetingCount: number;
  openFollowUps: number;
  reps: string[];
}

export interface LandscapeData {
  totalAttendees: number;
  totalCompanies: number;
  icpCount: number;
  wseCount: number;
  companyTypeBreakdown: { label: string; count: number }[];
  seniorityBreakdown: { label: string; count: number }[];
  priorOverlapCount: number;
  priorOverlapAttendees: { id: number; first_name: string; last_name: string; title: string | null; company_name: string | null }[];
}

export interface IcpCompany {
  id: number;
  name: string;
  company_type: string | null;
  avgHealth: number;
  attendees: { id: number; first_name: string; last_name: string; title: string | null; health: number }[];
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
}

export interface ByRepEntry {
  rep: string;
  companies: {
    company_id: number;
    company_name: string;
    company_type: string | null;
    relationship_status: string | null;
    description: string | null;
    attendees: { id: number; first_name: string; last_name: string; title: string | null; status: string | null; health: number }[];
    notes: { id: number; content: string; created_at: string | null; rep: string | null; attendee_name: string | null; conference_name: string | null }[];
  }[];
}

export interface RelationshipRow {
  id: number;
  company_id: number;
  company_name: string;
  relationship_status: string;
  description: string;
  rep_ids: string[];
  attendees: { id: number; first_name: string; last_name: string; title: string | null; health: number }[];
  recentNotes: { id: number; content: string; created_at: string | null; rep: string | null }[];
}

export interface GapsData {
  icpAttendeesNoMeeting: { id: number; first_name: string; last_name: string; title: string | null; company_name: string | null }[];
  icpCompaniesNoRelationship: { id: number; name: string; company_type: string | null }[];
  attendeesWithOpenFollowUps: { id: number; first_name: string; last_name: string; company_name: string | null; openCount: number }[];
  totalGaps: number;
}

export interface PreConferenceData {
  summary: PreConferenceSummary;
  landscape: LandscapeData;
  icpCompanies: IcpCompany[];
  meetings: MeetingRow[];
  socialEvents: SocialEventRow[];
  byRep: ByRepEntry[];
  relationships: RelationshipRow[];
  gaps: GapsData;
}

type TabKey = 'landscape' | 'icp' | 'meetings' | 'social' | 'by-rep' | 'relationships' | 'gaps';
const TABS: { key: TabKey; label: string }[] = [
  { key: 'landscape', label: 'Landscape' },
  { key: 'icp', label: 'ICP Companies' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'social', label: 'Social Events' },
  { key: 'by-rep', label: 'By Rep' },
  { key: 'relationships', label: 'Relationships' },
  { key: 'gaps', label: 'Coverage Gaps' },
];

function StatPill({ label, value, highlight }: { label: string; value: number | string; highlight?: boolean }) {
  return (
    <div className={`flex flex-col items-center px-4 py-2 rounded-lg ${highlight ? 'bg-brand-secondary/10' : 'bg-white/10'}`}>
      <span className="text-xl font-bold text-white">{value}</span>
      <span className="text-xs text-white/70 whitespace-nowrap">{label}</span>
    </div>
  );
}

export function PreConferenceReview({ conferenceId, conferenceName }: { conferenceId: number; conferenceName: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PreConferenceData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TabKey>('landscape');

  const load = useCallback(async () => {
    if (data) { setOpen(true); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/pre-conference`);
      if (!res.ok) throw new Error('Failed to load');
      const json: PreConferenceData = await res.json();
      setData(json);
      setOpen(true);
    } catch {
      setError('Failed to load pre-conference data.');
    } finally {
      setLoading(false);
    }
  }, [conferenceId, data]);

  return (
    <>
      <button
        onClick={load}
        disabled={loading}
        className="btn-primary flex items-center gap-2 text-sm"
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
          </svg>
        )}
        Pre-Conference Review
      </button>

      {error && <p className="text-sm text-red-600 mt-1">{error}</p>}

      {open && data && (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ animation: 'fadeUp 0.2s ease-out' }}>
          <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>

          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />

          {/* Panel */}
          <div className="relative flex flex-col bg-white w-full h-full overflow-hidden shadow-2xl md:m-6 md:rounded-2xl md:h-[calc(100vh-48px)]">
            {/* Panel header */}
            <div className="bg-brand-primary px-6 py-4 flex-shrink-0">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs text-white/60 uppercase tracking-widest font-semibold mb-0.5">Pre-Conference Review</p>
                  <h2 className="text-lg font-bold text-white leading-tight">{conferenceName}</h2>
                </div>
                <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white transition-colors mt-1">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="flex flex-wrap gap-2 mt-3">
                <StatPill label="Attendees" value={data.summary.totalAttendees} />
                <StatPill label="Companies" value={data.summary.totalCompanies} />
                <StatPill label="ICP" value={data.summary.icpCount} highlight />
                <StatPill label="Meetings" value={data.summary.meetingCount} />
                <StatPill label="Open Follow-ups" value={data.summary.openFollowUps} />
                {data.gaps.totalGaps > 0 && (
                  <StatPill label="Gaps" value={data.gaps.totalGaps} />
                )}
              </div>
            </div>

            {/* Tab nav */}
            <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
              <nav className="flex gap-0 px-4">
                {TABS.map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                      ${activeTab === t.key
                        ? 'border-brand-secondary text-brand-secondary'
                        : 'border-transparent text-gray-500 hover:text-gray-700'}`}
                  >
                    {t.label}
                    {t.key === 'gaps' && data.gaps.totalGaps > 0 && (
                      <span className="ml-1 px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 text-xs font-bold">
                        {data.gaps.totalGaps}
                      </span>
                    )}
                  </button>
                ))}
              </nav>
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">
              {activeTab === 'landscape' && <LandscapeTab data={data.landscape} />}
              {activeTab === 'icp' && <IcpCompaniesTab companies={data.icpCompanies} />}
              {activeTab === 'meetings' && <MeetingsTab meetings={data.meetings} />}
              {activeTab === 'social' && <SocialEventsTab events={data.socialEvents} />}
              {activeTab === 'by-rep' && <ByRepTab entries={data.byRep} conferenceId={conferenceId} conferenceName={conferenceName} />}
              {activeTab === 'relationships' && <RelationshipsTab relationships={data.relationships} />}
              {activeTab === 'gaps' && <CoverageGapsTab gaps={data.gaps} />}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
