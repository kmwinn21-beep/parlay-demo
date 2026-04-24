'use client';

import { useState } from 'react';
import { useSectionConfig } from '@/lib/useSectionConfig';
import { SummaryTab } from './post-conference/SummaryTab';
import { ContactsCapturedTab } from './post-conference/ContactsCapturedTab';
import { MeetingsTab } from './post-conference/MeetingsTab';
import { FollowUpsTab } from './post-conference/FollowUpsTab';
import { RelationshipShiftsTab } from './post-conference/RelationshipShiftsTab';
import { ActionItemsTab } from './post-conference/ActionItemsTab';

// ── Shared interfaces (imported by tab components) ─────────────────────────

export interface ContactRow {
  attendee_id: number; first_name: string; last_name: string;
  title: string | null; company_id: number | null; company_name: string | null;
  company_type: string | null; seniority: string | null; icp: string | null;
  assigned_user_names: string[]; firstSeenConference: string | null;
  priorConferenceCount: number; lastEngagementType: string | null;
  healthScore: number; healthDelta: number;
  meetingHeld: boolean; hasNotes: boolean;
}
export interface MeetingRow {
  id: number; attendee_id: number; attendeeName: string; attendeeTitle: string | null;
  company_name: string | null; company_type: string | null; company_id: number | null;
  seniority: string | null; meeting_date: string | null; meeting_time: string | null;
  location: string | null; scheduled_by: string | null; outcome: string | null;
  meeting_type: string | null; isWalkIn: boolean;
  status: 'held' | 'no_show' | 'rescheduled' | 'cancelled';
}
export interface FollowUpRow {
  id: number; attendee_id: number; attendeeName: string; attendeeTitle: string | null;
  company_name: string | null; company_id: number | null;
  next_steps: string | null; assigned_rep: string | null;
  completed: number; created_at: string | null;
  daysSinceConference: number; status: 'completed' | 'in_progress' | 'not_started';
}
export interface RepPerformanceRow {
  repName: string; contactsCaptured: number; newlyEngaged: number;
  reEngagements: number; meetingsHeld: number; walkInMeetings: number;
  followUpsCreated: number; followUpsCompleted: number; followUpRate: number;
  companies: {
    company_id: number; company_name: string; company_type: string | null;
    icp: string | null; engagementType: string | null;
    followUpStatus: 'completed' | 'in_progress' | 'not_started' | 'none';
    healthDelta: number;
  }[];
}
export interface RelationshipShiftRow {
  attendee_id: number; attendeeName: string;
  company_name: string | null; company_type: string | null;
  company_id: number | null; icp: string | null;
  assignedUsers: string[];
  priorConferenceCount: number; healthBefore: number; healthAfter: number;
  healthDelta: number; shiftReason: string;
  conferenceBreakdown: { label: string; points: number }[];
}
export interface ActionItem {
  type: 'overdue_followup' | 'missing_outcome' | 'no_show' | 'ghost_penalty' | 'pipeline' | 'new_contact' | 'retrospective';
  priority: 'high' | 'medium' | 'low';
  title: string; description: string;
  repName: string | null; attendeeName: string | null; companyName: string | null;
}
export interface PostConferenceData {
  summary: {
    conference: { id: number; name: string; start_date: string; end_date: string; location: string };
    totalCaptured: number; newlyEngaged: number; reEngagements: number;
    stillUnengaged: number; icpContacts: number; icpCaptureRate: number;
    meetingsScheduled: number; meetingsHeld: number; walkInMeetings: number;
    noShows: number; meetingsWithOutcome: number;
    followUpsCreated: number; followUpsCompleted: number;
    followUpsInProgress: number; followUpsNotStarted: number;
    formSubmissions: number;
    relationshipsImproved: number; relationshipsDeclined: number; repsAttended: number;
    engagementByType: { meetingsHeld: number; socialConversations: number; touchpoints: number; notesLogged: number; zeroEngagement: number };
    companyTypeBreakdown: { label: string; count: number }[];
    priorAverageComparison: {
      contactsPerRep: { current: number; avg: number | null };
      meetingsPerRep: { current: number; avg: number | null };
      icpCaptureRate: { current: number; avg: number | null };
      followUpRate: { current: number; avg: number | null };
      notesPerContact: { current: number; avg: number | null };
    };
  };
  contacts: { newlyEngaged: ContactRow[]; reEngagements: ContactRow[]; stillUnengaged: ContactRow[] };
  meetings: MeetingRow[];
  followUps: FollowUpRow[];
  repPerformance: RepPerformanceRow[];
  relationshipShifts: { improved: RelationshipShiftRow[]; declined: RelationshipShiftRow[]; unchanged: RelationshipShiftRow[] };
  actionItems: ActionItem[];
}

// ── Constants ─────────────────────────────────────────────────────────────────
const GREEN = '#34D399';
const GREEN_DARK = '#064e3b';
const GREEN_ACTIVE = '#059669';
const TAB_ORDER = ['summary', 'contacts', 'meetings', 'follow_ups', 'relationship_shifts', 'action_items'];

function fmtDate(d: string) {
  try {
    const [y, m, day] = d.split('-').map(Number);
    return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch { return d; }
}

// ── Stat pill in header ────────────────────────────────────────────────────────
function StatPill({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border-2 border-brand-primary p-3 bg-white flex flex-col items-center gap-0.5 min-w-0">
      <div className="text-xl font-bold text-brand-primary leading-tight">{value}</div>
      <div className="text-sm font-semibold text-gray-500 text-center truncate w-full">{label}</div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
interface Props {
  conferenceId: number;
  conferenceName: string;
  endDate: string;
  userRole: string;
}

export function PostConferenceReview({ conferenceId, conferenceName, endDate, userRole }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<PostConferenceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('summary');

  const tabConfig = useSectionConfig('post_conference_review');
  const visibleTabs = TAB_ORDER.filter(k => tabConfig.orderedKeys.includes(k) && tabConfig.isVisible(k));

  const today = new Date();
  const end = new Date(endDate + 'T00:00:00');
  const isAccessible = userRole === 'administrator' || today >= end;

  const handleOpen = async () => {
    if (!isAccessible) return;
    if (data) { setOpen(true); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/post-conference`);
      if (res.ok) {
        const d = await res.json() as PostConferenceData;
        setData(d);
        setOpen(true);
        setActiveTab(visibleTabs[0] ?? 'summary');
      }
    } finally {
      setLoading(false);
    }
  };

  const fuRate = data
    ? data.summary.followUpsCreated > 0
      ? Math.round((data.summary.followUpsCompleted / data.summary.followUpsCreated) * 100)
      : 0
    : 0;

  // ── Trigger button ──────────────────────────────────────────────────────────
  const triggerBtn = (
    <div className="relative group inline-block">
      <button
        type="button"
        disabled={!isAccessible}
        onClick={handleOpen}
        className={`flex items-center gap-1.5 py-1 px-1 text-sm font-medium transition-colors whitespace-nowrap
          ${isAccessible
            ? `text-gray-500 hover:text-brand-accent ${loading ? 'cursor-wait' : 'cursor-pointer'}`
            : 'text-gray-400 cursor-not-allowed opacity-40'}`}
      >
        {loading ? (
          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        ) : (
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        )}
        <span>Post-Conference</span>
      </button>
      {!isAccessible && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 whitespace-nowrap
          bg-gray-800 text-white text-xs rounded px-2 py-1 opacity-0 group-hover:opacity-100
          transition-opacity pointer-events-none z-10">
          Available on {fmtDate(endDate)}
        </div>
      )}
    </div>
  );

  if (!open || !data) return triggerBtn;

  const effectiveTab = visibleTabs.includes(activeTab) ? activeTab : (visibleTabs[0] ?? 'summary');

  return (
    <>
      {triggerBtn}

      {/* Modal */}
      <div className="fixed inset-0 z-50" style={{ animation: 'fadeUp 0.2s ease-out' }}>
        <style>{`@keyframes fadeUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }`}</style>
        <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
        <div className="absolute inset-0 sm:inset-4 md:inset-6 flex flex-col bg-white overflow-hidden shadow-2xl sm:rounded-2xl">

          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4" style={{ backgroundColor: GREEN }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold mb-0.5 uppercase tracking-widest" style={{ color: `${GREEN_DARK}99` }}>Post-Conference Review</p>
                <h2 className="text-lg font-bold leading-tight" style={{ color: GREEN_DARK }}>{conferenceName}</h2>
              </div>
              <button onClick={() => setOpen(false)} className="mt-1 transition-colors" style={{ color: `${GREEN_DARK}aa` }}>
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 mt-3">
              <StatPill label="Reps" value={data.summary.repsAttended} />
              <StatPill label="Meetings Held" value={data.summary.meetingsHeld} />
              <StatPill label="Follow-ups" value={data.summary.followUpsCreated} />
              <StatPill label="Follow-up Rate" value={`${fuRate}%`} />
              <StatPill label="Form Submissions" value={data.summary.formSubmissions} />
              <StatPill label="ICP Capture Rate" value={`${data.summary.icpCaptureRate}%`} />
            </div>
          </div>

          {/* Tab nav */}
          <div className="border-b border-gray-200 bg-white overflow-x-auto flex-shrink-0">
            <nav className="flex gap-0 px-4">
              {visibleTabs.map(t => (
                <button key={t} onClick={() => setActiveTab(t)}
                  className="py-3 px-3 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap"
                  style={effectiveTab === t
                    ? { borderColor: GREEN_ACTIVE, color: GREEN_ACTIVE }
                    : { borderColor: 'transparent', color: '#6b7280' }}>
                  {tabConfig.getLabel(t)}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-y-auto p-4 sm:p-6">
            {effectiveTab === 'summary' && <SummaryTab summary={data.summary} repPerformance={data.repPerformance} />}
            {effectiveTab === 'contacts' && <ContactsCapturedTab contacts={data.contacts} />}
            {effectiveTab === 'meetings' && <MeetingsTab meetings={data.meetings} />}
            {effectiveTab === 'follow_ups' && <FollowUpsTab followUps={data.followUps} />}
            {effectiveTab === 'relationship_shifts' && <RelationshipShiftsTab relationshipShifts={data.relationshipShifts} />}
            {effectiveTab === 'action_items' && <ActionItemsTab actionItems={data.actionItems} />}
          </div>
        </div>
      </div>
    </>
  );
}
