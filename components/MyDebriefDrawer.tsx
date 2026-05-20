'use client';

import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';

// ─── Types ───────────────────────────────────────────────────────────────────

interface DebriefStats {
  companiesEngaged: number;
  meetingsHeld: number;
  touchpoints: number;
  followUpsDue: number;
  sesScore: number | null;
}

interface DebriefAttendee {
  id: number;
  name: string;
  title: string | null;
  meetingCount: number;
  touchpointCount: number;
  followUpCount: number;
}

interface DebriefFollowUp {
  id: number;
  attendeeId: number | null;
  attendeeName: string | null;
  taskText: string;
  nextSteps: string;
  completed: boolean;
  meetingId: number | null;
  source: string;
}

interface DebriefNote {
  id: number;
  content: string;
  created_at: string;
  conference_name: string | null;
  rep: string | null;
  attendee_name: string | null;
  note_type: string | null;
}

interface MeetingInsight {
  id: number;
  insight_type: string;
  content: string;
  quote: string | null;
  confidence: string;
  confirmed: boolean;
  timestamp_seconds: number | null;
}

interface TranscriptSegment {
  text: string;
  start: number;
  end?: number;
}

interface MeetingCard {
  meetingId: number;
  attendeeId: number;
  attendeeName: string;
  attendeeTitle: string | null;
  date: string | null;
  time: string | null;
  meetingType: string | null;
  outcome: string | null;
  isHeld: boolean;
  actionItemCount: number;
  buyingSignalCount: number;
  painPointCount: number;
  summary: string | null;
  notesText: string | null;
  insights: MeetingInsight[];
  transcript: unknown[];
}

interface DebriefCompany {
  id: number;
  name: string;
  tier: string | null;
  status: string | null;
  icp: string | null;
  attendeeCount: number;
  meetingCount: number;
  meetingsHeld: number;
  touchpointCount: number;
  openFollowUpCount: number;
  completedFollowUpCount: number;
  attendees: DebriefAttendee[];
  meetingCards: MeetingCard[];
  followUps: DebriefFollowUp[];
  timeline: unknown[];
}

interface DebriefData {
  conference: { id: number; name: string; start_date: string; end_date: string; location: string };
  repName: string;
  repFirstName: string;
  configId: number | null;
  stats: DebriefStats;
  companies: DebriefCompany[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TIER_ORDER: Record<string, number> = { must_target: 0, high_priority: 1, worth_engaging: 2, unassigned: 3 };

const TIER_LABELS: Record<string, string> = {
  must_target: 'Must Target',
  high_priority: 'High Priority',
  worth_engaging: 'Worth Engaging',
  unassigned: 'Unassigned',
};

const TIER_COLORS: Record<string, string> = {
  must_target: 'bg-red-100 text-red-700',
  high_priority: 'bg-orange-100 text-orange-700',
  worth_engaging: 'bg-yellow-100 text-yellow-700',
  unassigned: 'bg-gray-100 text-gray-500',
};

const STATUS_COLORS: Record<string, string> = {
  Client: 'bg-yellow-100 text-yellow-700',
  Priority: 'bg-red-100 text-red-700',
  Interested: 'bg-green-100 text-green-700',
  'Not Interested': 'bg-gray-100 text-gray-500',
  Unknown: 'bg-gray-100 text-gray-500',
  'Active Op.': 'bg-blue-100 text-blue-700',
  Nurturing: 'bg-orange-100 text-orange-700',
  DNC: 'bg-purple-100 text-purple-700',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmt$(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}

function parseTaskLines(text: string | null | undefined): string[] {
  if (!text) return [];
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.startsWith('- '));
  return lines.length > 0 ? lines.map(l => l.slice(2)) : [text.trim()].filter(Boolean);
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

// Replicates SalesExecutionTab per-rep SES computation exactly.
function computeRepSes(repName: string, effData: Record<string, unknown>): number | null {
  const repAttrib = ((effData.pipeline as Record<string, unknown> | null)?.rep_attribution) as Record<string, unknown>[] | null;
  const sx = effData.sales_execution as Record<string, unknown> | null;
  if (!repAttrib?.length || !sx) return null;
  const repRow = repAttrib.find(r => String(r.rep ?? '') === repName);
  if (!repRow) return null;

  const meetingsHeld = Number(repRow.meetings_held ?? 0);
  const touchpoints = Number(repRow.touchpoints ?? 0);
  const salesActivities = meetingsHeld + touchpoints;
  const pipelineInfluence = Number(repRow.pipeline_influence_attributed ?? 0);
  const meetingsScheduled = Number(repRow.meetings_scheduled ?? 0);
  const holdRate = meetingsScheduled > 0 ? (meetingsHeld / meetingsScheduled) * 100 : null;
  const followupRateRaw = Number(repRow.followup_completion_rate ?? NaN);
  const targetAccountsEngaged = Number(repRow.target_accounts_engaged ?? NaN);
  const targetAccountsAssigned = Number(repRow.target_accounts_assigned ?? NaN);
  const targetEngagementRate =
    Number.isFinite(targetAccountsEngaged) && Number.isFinite(targetAccountsAssigned) && targetAccountsAssigned > 0
      ? (targetAccountsEngaged / targetAccountsAssigned) * 100
      : Number(repRow.target_engagement_rate ?? NaN);
  const pipelinePerActivity = salesActivities > 0 ? pipelineInfluence / salesActivities : null;

  const validReps = repAttrib.filter(r =>
    Number.isFinite(Number(r.meetings_held ?? 0) + Number(r.touchpoints ?? 0)) &&
    Number.isFinite(Number(r.pipeline_influence_attributed ?? 0))
  );
  const avgActivity =
    validReps.length > 0
      ? validReps.reduce((s, r) => s + Number(r.meetings_held ?? 0) + Number(r.touchpoints ?? 0), 0) / validReps.length
      : 0;
  const allPpa = validReps
    .map(r => {
      const a = Number(r.meetings_held ?? 0) + Number(r.touchpoints ?? 0);
      const p = Number(r.pipeline_influence_attributed ?? 0);
      return a > 0 ? p / a : null;
    })
    .filter((v): v is number => v != null);
  const avgPpa = allPpa.length > 0 ? allPpa.reduce((s, v) => s + v, 0) / allPpa.length : 0;

  const meetingExecution = meetingsScheduled > 0 && holdRate != null ? Math.max(0, Math.min(holdRate, 100)) : null;
  const followupExecution = Number.isFinite(followupRateRaw) ? Math.max(0, Math.min(followupRateRaw, 100)) : null;
  const pipelineExecution =
    pipelinePerActivity != null && avgPpa > 0
      ? Math.max(0, Math.min((pipelinePerActivity / avgPpa) * 100, 100))
      : null;
  const targetExecution = Number.isFinite(targetEngagementRate) ? Math.max(0, Math.min(targetEngagementRate, 100)) : null;
  const repProductivity = avgActivity > 0 ? Math.max(0, Math.min((salesActivities / avgActivity) * 100, 100)) : null;

  const effectiveWeights = (sx.effective_weights ?? {}) as Record<string, number>;
  const components = [
    { key: 'meeting_execution', score: meetingExecution },
    { key: 'followup_execution', score: followupExecution },
    { key: 'pipeline_influence_execution', score: pipelineExecution },
    { key: 'target_account_execution', score: targetExecution },
    { key: 'rep_productivity', score: repProductivity },
  ];
  const available = components.filter(c => c.score != null);
  const totalWeight = available.reduce((sum, c) => sum + Number(effectiveWeights[c.key] ?? 0), 0);
  if (totalWeight <= 0) return null;
  return Math.round(
    available.reduce((sum, c) => sum + (c.score ?? 0) * (Number(effectiveWeights[c.key] ?? 0) / totalWeight), 0)
  );
}

// ─── UI sub-components ────────────────────────────────────────────────────────

function TierBadge({ tier }: { tier: string | null }) {
  const t = tier ?? 'unassigned';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${TIER_COLORS[t] ?? 'bg-gray-100 text-gray-500'}`}>
      {TIER_LABELS[t] ?? t}
    </span>
  );
}

function StatPill({ children, cls }: { children: ReactNode; cls?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-200 bg-gray-50 text-gray-600 ${cls ?? ''}`}>
      {children}
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-white/20 last:border-r-0 min-w-[90px] flex-shrink-0">
      <span className="text-xl font-bold text-white leading-tight">{value}</span>
      <span className="text-[10px] text-white/70 mt-0.5 text-center leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-white/50">{sub}</span>}
    </div>
  );
}

function InsightChip({ type, count }: { type: string; count: number }) {
  if (count === 0) return null;
  const map: Record<string, { label: string; cls: string }> = {
    buying_signal: { label: 'Buy', cls: 'bg-green-100 text-green-700' },
    pain_point: { label: 'Pain', cls: 'bg-red-100 text-red-700' },
    next_step: { label: 'Action', cls: 'bg-blue-100 text-blue-700' },
  };
  const m = map[type];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${m.cls}`}>
      {count} {m.label}{count > 1 ? 's' : ''}
    </span>
  );
}

function PipelineBar({
  label,
  value,
  goal,
  teamTotal,
  barColor,
}: {
  label: string;
  value: number;
  goal: number | null;
  teamTotal?: number;
  barColor?: string;
}) {
  const pct = goal != null && goal > 0 ? Math.min((value / goal) * 100, 100) : 0;
  const teamPct = teamTotal != null && teamTotal > 0 && value > 0 ? Math.round((value / teamTotal) * 100) : null;
  const goalPct = goal != null && goal > 0 ? Math.round((value / goal) * 100) : null;
  return (
    <div>
      <div className="flex items-baseline justify-between mb-0.5">
        <span className="text-[9px] text-white/60 uppercase tracking-wide">{label}</span>
        <span className="text-[10px] text-white font-semibold">{fmt$(value)}</span>
      </div>
      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${barColor ?? 'bg-emerald-400'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        {goal != null ? (
          <span className="text-[9px] text-white/50">{goalPct != null ? `${goalPct}%` : ''} of {fmt$(goal)}</span>
        ) : <span />}
        {teamPct != null && (
          <span className="text-[9px] text-white/50">{teamPct}% of team</span>
        )}
      </div>
    </div>
  );
}

function Col4Section({
  title,
  count,
  isOpen,
  onToggle,
  children,
}: {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="border-b border-gray-100">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-gray-50 transition-colors text-left"
      >
        <span className="text-xs font-semibold text-gray-700">{title}</span>
        <div className="flex items-center gap-2">
          {count > 0 && (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-600">
              {count}
            </span>
          )}
          <svg
            className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function NoteCard({ note }: { note: DebriefNote }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      {note.attendee_name && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-semibold bg-brand-primary/10 text-brand-primary">
            {note.attendee_name}
          </span>
        </div>
      )}
      <p className="text-xs text-gray-700 leading-relaxed line-clamp-4">{note.content}</p>
      <div className="flex items-center justify-between text-[10px] text-gray-400 pt-1 border-t border-gray-100">
        {note.rep ? <span>{note.rep}</span> : <span />}
        <span>{fmtDate(note.created_at)}</span>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  conferenceId: number;
  isOpen: boolean;
  onClose: () => void;
}

export function MyDebriefDrawer({ conferenceId, isOpen, onClose }: Props) {
  const [data, setData] = useState<DebriefData | null>(null);
  const [effData, setEffData] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [followUps, setFollowUps] = useState<Record<number, DebriefFollowUp[]>>({});
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [expandedFuIds, setExpandedFuIds] = useState<Set<number>>(new Set());
  const [activeMeetingId, setActiveMeetingId] = useState<number | null>(null);
  const [col4Sections, setCol4Sections] = useState<Record<string, boolean>>({});
  const [col4FadeKey, setCol4FadeKey] = useState(0);
  const [expandedQuoteIds, setExpandedQuoteIds] = useState<Set<number>>(new Set());
  const [companyNotes, setCompanyNotes] = useState<DebriefNote[]>([]);
  const [col1Collapsed, setCol1Collapsed] = useState(false);
  const [mounted, setMounted] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [debriefRes, effRes] = await Promise.all([
        fetch(`/api/conferences/${conferenceId}/debrief`),
        fetch(`/api/conferences/${conferenceId}/effectiveness`),
      ]);
      if (!debriefRes.ok) {
        const e = await debriefRes.json().catch(() => ({}));
        throw new Error((e as Record<string, string>).error ?? 'Failed to load debrief');
      }
      const d: DebriefData = await debriefRes.json();
      setData(d);
      const fuMap: Record<number, DebriefFollowUp[]> = {};
      for (const co of d.companies) fuMap[co.id] = co.followUps;
      setFollowUps(fuMap);
      if (d.companies.length > 0) setSelectedCompanyId(d.companies[0].id);
      if (effRes.ok) setEffData(await effRes.json());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load debrief');
    } finally {
      setLoading(false);
    }
  }, [conferenceId]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen && data === null && !loading) fetchData();
  }, [isOpen, data, loading, fetchData]);

  // Fetch notes for selected company filtered to this conference
  useEffect(() => {
    if (!selectedCompanyId || !data) { setCompanyNotes([]); return; }
    fetch(`/api/notes?entity_type=company&entity_id=${selectedCompanyId}`)
      .then(r => r.ok ? r.json() : [])
      .then((notes: DebriefNote[]) => {
        setCompanyNotes(notes.filter(n => n.conference_name === data.conference.name));
      })
      .catch(() => setCompanyNotes([]));
  }, [selectedCompanyId, data]);

  const repSesScore = useMemo(() => {
    if (!data) return null;
    if (effData) {
      const computed = computeRepSes(data.repName, effData);
      if (computed != null) return computed;
    }
    return data.stats.sesScore;
  }, [data, effData]);

  const pipelineByRep = useMemo(() => {
    if (!effData || !data) return null;
    const sx = effData.sales_execution as Record<string, unknown> | null;
    if (!sx) return null;
    const pibr = sx.pipeline_influence_by_rep as Record<string, unknown> | null;
    if (!pibr) return null;
    const reps = (pibr.reps as Array<Record<string, unknown>> | null) ?? [];
    const repRow = reps.find(r => String(r.rep_name ?? '') === data.repName);
    const repPipeline = repRow != null ? Number(repRow.pipeline_influence ?? 0) : null;
    const total = Number(pibr.total_pipeline_influence ?? 0);
    const goal = pibr.required_pipeline_amount != null ? Number(pibr.required_pipeline_amount) : null;
    const numReps = reps.length || 1;
    const repShare = goal != null ? goal / numReps : null;
    return { repPipeline, total, goal, repShare, numReps };
  }, [effData, data]);

  const followUpsDue = useMemo(() => {
    if (!data) return 0;
    return data.companies.reduce(
      (s, co) => s + (followUps[co.id] ?? co.followUps).filter(f => !f.completed).length,
      0
    );
  }, [data, followUps]);

  const sortedCompanies = useMemo(() => {
    if (!data) return [];
    return [...data.companies].sort((a, b) => {
      const ta = TIER_ORDER[a.tier ?? 'unassigned'] ?? 3;
      const tb = TIER_ORDER[b.tier ?? 'unassigned'] ?? 3;
      if (ta !== tb) return ta - tb;
      const openA = (followUps[a.id] ?? a.followUps).filter(f => !f.completed).length;
      const openB = (followUps[b.id] ?? b.followUps).filter(f => !f.completed).length;
      return openB - openA;
    });
  }, [data, followUps]);

  const selectedCompany = useMemo(
    () => data?.companies.find(c => c.id === selectedCompanyId) ?? null,
    [data, selectedCompanyId]
  );
  const companyFollowUps = useMemo(
    () => (selectedCompanyId != null ? followUps[selectedCompanyId] ?? [] : []),
    [followUps, selectedCompanyId]
  );
  const activeMeeting = useMemo(
    () => selectedCompany?.meetingCards.find(m => m.meetingId === activeMeetingId) ?? null,
    [selectedCompany, activeMeetingId]
  );

  const toggleFollowUp = useCallback(async (fu: DebriefFollowUp, companyId: number) => {
    setTogglingId(fu.id);
    const next = !fu.completed;
    setFollowUps(prev => ({
      ...prev,
      [companyId]: (prev[companyId] ?? []).map(f => f.id === fu.id ? { ...f, completed: next } : f),
    }));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fu.id, completed: next }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setFollowUps(prev => ({
        ...prev,
        [companyId]: (prev[companyId] ?? []).map(f => f.id === fu.id ? { ...f, completed: fu.completed } : f),
      }));
      toast.error('Failed to update follow-up');
    } finally {
      setTogglingId(null);
    }
  }, []);

  const deleteFollowUp = useCallback(async (fuId: number, companyId: number) => {
    setDeletingId(fuId);
    setFollowUps(prev => ({
      ...prev,
      [companyId]: (prev[companyId] ?? []).filter(f => f.id !== fuId),
    }));
    try {
      const res = await fetch('/api/follow-ups', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: fuId }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Failed to delete follow-up');
      fetchData();
    } finally {
      setDeletingId(null);
    }
  }, [fetchData]);

  const openMeeting = useCallback((meetingId: number) => {
    setActiveMeetingId(prev => (prev === meetingId ? null : meetingId));
    setCol1Collapsed(true);
    setCol4Sections({});
    setCol4FadeKey(k => k + 1);
    setExpandedQuoteIds(new Set());
  }, []);

  const switchMeeting = useCallback((meetingId: number) => {
    setActiveMeetingId(meetingId);
    setCol4Sections({});
    setCol4FadeKey(k => k + 1);
    setExpandedQuoteIds(new Set());
  }, []);

  if (!isOpen) return null;

  const content = (
    <div
      className="fixed inset-0 z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <style>{`
        @keyframes debriefFadeIn { from { opacity: 0; } to { opacity: 1; } }
      `}</style>
      {/* Center within the area to the right of the sidebar (w-64 = 16rem) */}
      <div className="absolute top-0 bottom-0 right-0 flex items-center justify-center p-5" style={{ left: '16rem' }}>

      <div className="w-full max-w-[1200px] h-[85vh] flex flex-col bg-white rounded-xl shadow-2xl overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-brand-primary flex-shrink-0">
          <div className="flex items-center justify-between px-5 py-3 border-b border-white/20">
            <div className="flex items-center gap-3">
              <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div>
                <p className="text-[10px] text-white/60 font-semibold uppercase tracking-widest">My Debrief</p>
                <h2 className="text-base font-bold text-white font-serif leading-tight">
                  {data?.conference.name ?? 'Loading…'}
                </h2>
              </div>
            </div>
            {data && <p className="text-xs text-white/60 hidden sm:block">{data.conference.location}</p>}
          </div>

          {/* Stats bar */}
          {data && (
            <div className="flex items-stretch overflow-x-auto hide-scrollbar">
              <StatTile label="Companies" value={data.stats.companiesEngaged} />
              <StatTile label="Meetings Held" value={data.stats.meetingsHeld} />
              <StatTile label="Touchpoints" value={data.stats.touchpoints} />
              <StatTile label="Follow-ups Due" value={followUpsDue} />
              <StatTile
                label="Sales Exec Score"
                value={repSesScore != null ? String(repSesScore) : '—'}
                sub={repSesScore != null ? '/100' : undefined}
              />
              {/* Pipeline bars — double width, colored bars */}
              {pipelineByRep && (pipelineByRep.repPipeline != null || pipelineByRep.total > 0) && (
                <div className="flex flex-col justify-center px-5 py-2 border-l border-white/20 min-w-[400px] max-w-[480px] flex-shrink-0 gap-2.5">
                  <PipelineBar
                    label="My Pipeline Influence"
                    value={pipelineByRep.repPipeline ?? 0}
                    goal={pipelineByRep.repShare}
                    teamTotal={pipelineByRep.total}
                    barColor="bg-emerald-400"
                  />
                  <PipelineBar
                    label="Team vs. Goal"
                    value={pipelineByRep.total}
                    goal={pipelineByRep.goal}
                    barColor="bg-sky-400"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Loading ── */}
        {loading && (
          <div className="flex-1 flex items-center justify-center">
            <svg className="w-8 h-8 animate-spin text-brand-primary" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
            </svg>
          </div>
        )}

        {/* ── Error ── */}
        {error && (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <p className="text-gray-500 mb-3">{error}</p>
              <button onClick={fetchData} className="btn-primary text-sm">Try again</button>
            </div>
          </div>
        )}

        {/* ── Body ── */}
        {!loading && !error && data && (
          <div className="flex flex-1 overflow-hidden">

            {/* Col 1 — Company list (collapsible) */}
            <div className={`flex-shrink-0 border-r border-gray-200 bg-white flex flex-col transition-all duration-200 ease-out overflow-hidden ${col1Collapsed ? 'w-8' : 'w-56'}`}>
              {/* Header with collapse toggle */}
              <div className="flex items-center justify-between px-2 py-2 border-b border-gray-100 flex-shrink-0">
                {!col1Collapsed && (
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    {data.companies.length} Compan{data.companies.length !== 1 ? 'ies' : 'y'}
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => setCol1Collapsed(v => !v)}
                  className="ml-auto text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0"
                  title={col1Collapsed ? 'Expand' : 'Collapse'}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d={col1Collapsed ? 'M9 5l7 7-7 7' : 'M15 19l-7-7 7-7'} />
                  </svg>
                </button>
              </div>
              {/* List — hidden when collapsed */}
              {!col1Collapsed && <div className="overflow-y-auto flex-1">
              {sortedCompanies.length === 0 && (
                <p className="text-sm text-gray-400 p-4 text-center">No company activity found.</p>
              )}
              {sortedCompanies.map(co => {
                const isSelected = co.id === selectedCompanyId;
                const openFus = (followUps[co.id] ?? co.followUps).filter(f => !f.completed).length;
                const totalFus = (followUps[co.id] ?? co.followUps).length;
                const allDone = totalFus > 0 && openFus === 0;
                return (
                  <button
                    key={co.id}
                    onClick={() => { setSelectedCompanyId(co.id); setActiveMeetingId(null); }}
                    className={`w-full text-left px-3 py-3 border-b border-gray-50 transition-colors border-l-2 ${
                      isSelected
                        ? 'bg-rose-50 border-l-rose-500'
                        : 'border-l-transparent hover:bg-gray-50'
                    }`}
                  >
                    {/* Name row with due pill pinned to upper right */}
                    <div className="flex items-start justify-between gap-1">
                      <p className={`text-sm font-semibold leading-snug min-w-0 ${isSelected ? 'text-brand-primary' : 'text-gray-800'}`}>
                        {co.name}
                      </p>
                      {allDone && (
                        <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700">
                          Done
                        </span>
                      )}
                      {!allDone && openFus > 0 && (
                        <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-600">
                          {openFus} due
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
              </div>}
            </div>

            {/* Col 2 — Company activity (shrinks to accommodate wider col 1 + col 3) */}
            <div className="flex-1 overflow-y-auto p-5 border-r border-gray-200 min-w-0">
              {!selectedCompany ? (
                <p className="text-sm text-gray-400 text-center mt-12">Select a company to view activity.</p>
              ) : (
                <div className="space-y-5">

                  {/* Company header */}
                  <div>
                    <h3 className="text-lg font-bold text-brand-primary font-serif">{selectedCompany.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      {selectedCompany.tier && <TierBadge tier={selectedCompany.tier} />}
                      {selectedCompany.status && selectedCompany.status !== 'Unknown' && (
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${STATUS_COLORS[selectedCompany.status] ?? 'bg-gray-100 text-gray-500'}`}>
                          {selectedCompany.status}
                        </span>
                      )}
                      {selectedCompany.icp && selectedCompany.icp !== 'No' && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">
                          ICP
                        </span>
                      )}
                      <StatPill>{selectedCompany.attendeeCount} attendee{selectedCompany.attendeeCount !== 1 ? 's' : ''}</StatPill>
                      <StatPill>{selectedCompany.meetingsHeld} meeting{selectedCompany.meetingsHeld !== 1 ? 's' : ''} held</StatPill>
                      {selectedCompany.touchpointCount > 0 && (
                        <StatPill>{selectedCompany.touchpointCount} touchpoint{selectedCompany.touchpointCount !== 1 ? 's' : ''}</StatPill>
                      )}
                    </div>
                  </div>

                  {/* Contacts — 3-col grid of cards, ALL conference attendees */}
                  {selectedCompany.attendees.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contacts</p>
                      <div className="grid grid-cols-3 gap-2">
                        {selectedCompany.attendees.map(a => {
                          const hasMeetings = a.meetingCount > 0;
                          const hasTp = a.touchpointCount > 0;
                          const hasFu = a.followUpCount > 0;
                          return (
                            <div key={a.id} className="border border-gray-200 rounded-lg p-2.5 bg-white hover:border-gray-300 transition-colors">
                              <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{a.name}</p>
                              {a.title && <p className="text-[10px] text-gray-400 mt-0.5 truncate">{a.title}</p>}
                              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                                {hasMeetings && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-primary/10 text-brand-primary">
                                    {a.meetingCount} mtg
                                  </span>
                                )}
                                {hasTp && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                    {a.touchpointCount} tp
                                  </span>
                                )}
                                {hasFu && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-100 text-rose-600">
                                    {a.followUpCount} fu
                                  </span>
                                )}
                                {!hasMeetings && !hasTp && !hasFu && (
                                  <span className="text-[10px] text-gray-300 italic">No activity</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Meetings */}
                  {selectedCompany.meetingCards.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Meetings</p>
                      <div className="space-y-2">
                        {selectedCompany.meetingCards.map(m => {
                          const isActive = activeMeetingId === m.meetingId;
                          return (
                            <button
                              key={m.meetingId}
                              type="button"
                              onClick={e => { e.stopPropagation(); openMeeting(m.meetingId); }}
                              className={`w-full text-left rounded-lg border p-3 transition-all ${
                                isActive
                                  ? 'border-brand-primary bg-brand-primary/5'
                                  : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium text-gray-800">{m.attendeeName}</span>
                                    {m.attendeeTitle && <span className="text-xs text-gray-400">{m.attendeeTitle}</span>}
                                  </div>
                                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                    {m.date && <span className="text-xs text-gray-400">{m.date}</span>}
                                    {m.meetingType && <span className="text-xs text-gray-400">{m.meetingType}</span>}
                                    <span className={`text-xs font-medium ${m.isHeld ? 'text-green-600' : 'text-gray-400'}`}>
                                      {m.isHeld ? 'Held' : m.outcome ?? 'Scheduled'}
                                    </span>
                                  </div>
                                </div>
                                <svg
                                  className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-colors ${isActive ? 'text-brand-primary' : 'text-gray-300'}`}
                                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                                >
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                              </div>
                              {(m.actionItemCount > 0 || m.buyingSignalCount > 0 || m.painPointCount > 0) && (
                                <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                                  <InsightChip type="buying_signal" count={m.buyingSignalCount} />
                                  <InsightChip type="pain_point" count={m.painPointCount} />
                                  <InsightChip type="next_step" count={m.actionItemCount} />
                                </div>
                              )}
                              {m.summary && (
                                <p className="text-xs text-gray-500 mt-2 line-clamp-2">{m.summary}</p>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Conference Notes */}
                  {companyNotes.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
                        {data.conference.name} Notes
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {companyNotes.map(note => (
                          <NoteCard key={note.id} note={note} />
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}
            </div>

            {/* Col 3 — Follow-ups (1.5× width = 27rem) */}
            <div className="w-[27rem] flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Follow-ups</p>
                {selectedCompany && <p className="text-xs text-gray-500 mt-0.5">{selectedCompany.name}</p>}
              </div>
              {!selectedCompany ? (
                <p className="text-sm text-gray-400 p-4 text-center">Select a company.</p>
              ) : companyFollowUps.length === 0 ? (
                <p className="text-sm text-gray-400 p-4 text-center">No follow-ups.</p>
              ) : (
                <div className="divide-y divide-gray-100">
                  {[
                    ...companyFollowUps.filter(f => !f.completed),
                    ...companyFollowUps.filter(f => f.completed),
                  ].map(fu => {
                    const taskLines = parseTaskLines(fu.taskText);
                    const isExpanded = expandedFuIds.has(fu.id);
                    const visibleLines = isExpanded ? taskLines : taskLines.slice(0, 1);
                    const multiLine = taskLines.length > 1;
                    return (
                      <div key={fu.id} className={`p-3 ${fu.completed ? 'bg-green-50' : 'bg-white'}`}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            {/* Tag pill + attendee pill */}
                            <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                              {fu.nextSteps && (
                                <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                                  fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'
                                }`}>
                                  {fu.nextSteps}
                                </span>
                              )}
                              {fu.attendeeName && (
                                <span className="inline-flex px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                  {fu.attendeeName}
                                </span>
                              )}
                            </div>
                            {/* Task lines */}
                            {taskLines.length === 0 ? (
                              <p className="text-xs text-gray-700 leading-snug">{fu.taskText}</p>
                            ) : (
                              <div>
                                {visibleLines.map((line, i) => (
                                  <p key={i} className={`text-xs text-gray-700 leading-snug${i > 0 ? ' mt-1.5' : ''}`}>
                                    - {line}
                                  </p>
                                ))}
                                {multiLine && (
                                  <>
                                    {!isExpanded && <div className="border-t border-gray-100 mt-1 pt-1" />}
                                    <button
                                      type="button"
                                      onClick={() => setExpandedFuIds(prev => {
                                        const n = new Set(prev);
                                        n.has(fu.id) ? n.delete(fu.id) : n.add(fu.id);
                                        return n;
                                      })}
                                      className="text-[10px] text-brand-secondary hover:underline mt-0.5"
                                    >
                                      {isExpanded ? 'Show less' : `Show All (${taskLines.length})`}
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                            <p className="text-[10px] text-gray-400 mt-1">{fu.source}</p>
                          </div>
                          {/* Actions */}
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => toggleFollowUp(fu, selectedCompany.id)}
                              disabled={togglingId === fu.id}
                              className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border-2 transition-all disabled:opacity-50 ${
                                fu.completed
                                  ? 'bg-green-500 text-white border-green-600'
                                  : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
                              }`}
                            >
                              {fu.completed ? (
                                <>
                                  <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                  </svg>
                                  Done
                                </>
                              ) : 'Done'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteFollowUp(fu.id, selectedCompany.id)}
                              disabled={deletingId === fu.id}
                              className="text-red-300 hover:text-red-500 p-1 rounded transition-colors disabled:opacity-50"
                              title="Delete"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Col 4 — Meeting notes (slides in at 200ms ease-out) */}
            <div
              className={`flex-shrink-0 border-l border-gray-200 bg-white overflow-hidden transition-all ease-out ${
                activeMeetingId != null ? 'w-80' : 'w-0'
              }`}
              style={{ transitionDuration: '200ms' }}
            >
              {activeMeeting && selectedCompany && (
                <div className="w-80 h-full flex flex-col overflow-hidden">
                  {/* Col 4 header */}
                  <div className="flex-shrink-0 px-4 py-3 border-b border-gray-100 bg-gray-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">
                          Meeting with {activeMeeting.attendeeName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          {activeMeeting.date && <span className="text-[11px] text-gray-400">{activeMeeting.date}</span>}
                          {activeMeeting.meetingType && <span className="text-[11px] text-gray-400">{activeMeeting.meetingType}</span>}
                          <span className={`text-[11px] font-medium ${activeMeeting.isHeld ? 'text-green-600' : 'text-gray-400'}`}>
                            {activeMeeting.isHeld ? 'Held' : activeMeeting.outcome ?? 'Scheduled'}
                          </span>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveMeetingId(null)}
                        className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {selectedCompany.meetingCards.length > 1 && (
                      <div className="flex gap-1 mt-2 overflow-x-auto hide-scrollbar">
                        {selectedCompany.meetingCards.map((m, idx) => (
                          <button
                            key={m.meetingId}
                            type="button"
                            onClick={() => switchMeeting(m.meetingId)}
                            className={`flex-shrink-0 px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                              m.meetingId === activeMeetingId
                                ? 'bg-brand-primary text-white'
                                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-100'
                            }`}
                          >
                            {m.date ?? `Meeting ${idx + 1}`}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Col 4 content — all sections default collapsed, keyed for 150ms fade */}
                  <div
                    key={col4FadeKey}
                    className="flex-1 overflow-y-auto"
                    style={{ animation: 'debriefFadeIn 0.15s ease-out' }}
                  >
                    {/* Summary — default collapsed */}
                    <Col4Section
                      title="Meeting Summary"
                      count={0}
                      isOpen={col4Sections.summary ?? false}
                      onToggle={() => setCol4Sections(prev => ({ ...prev, summary: !prev.summary }))}
                    >
                      {activeMeeting.summary ? (
                        <p className="text-xs text-gray-600 leading-relaxed">{activeMeeting.summary}</p>
                      ) : activeMeeting.notesText ? (
                        <p className="text-xs text-gray-600 leading-relaxed">{activeMeeting.notesText}</p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No summary available.</p>
                      )}
                    </Col4Section>

                    {/* Action Items */}
                    {(() => {
                      const items = activeMeeting.insights.filter(i => i.insight_type === 'next_step');
                      return (
                        <Col4Section
                          title="Action Items"
                          count={items.length}
                          isOpen={col4Sections.actions ?? false}
                          onToggle={() => setCol4Sections(prev => ({ ...prev, actions: !prev.actions }))}
                        >
                          {items.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">None identified.</p>
                          ) : items.map(i => (
                            <div key={i.id} className="text-xs text-gray-700 leading-snug">· {i.content}</div>
                          ))}
                        </Col4Section>
                      );
                    })()}

                    {/* Buying Signals — quote hidden behind toggle */}
                    {(() => {
                      const items = activeMeeting.insights.filter(i => i.insight_type === 'buying_signal');
                      return (
                        <Col4Section
                          title="Buying Signals"
                          count={items.length}
                          isOpen={col4Sections.buying ?? false}
                          onToggle={() => setCol4Sections(prev => ({ ...prev, buying: !prev.buying }))}
                        >
                          {items.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">None identified.</p>
                          ) : items.map(i => (
                            <div key={i.id} className="space-y-0.5">
                              <p className="text-xs text-gray-700 leading-snug">· {i.content}</p>
                              {i.quote && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedQuoteIds(prev => {
                                      const n = new Set(prev);
                                      n.has(i.id) ? n.delete(i.id) : n.add(i.id);
                                      return n;
                                    })}
                                    className="block text-[10px] text-brand-secondary hover:underline ml-3"
                                  >
                                    {expandedQuoteIds.has(i.id) ? 'Hide quote' : 'Show quote'}
                                  </button>
                                  {expandedQuoteIds.has(i.id) && (
                                    <p className="text-[10px] text-gray-400 italic ml-3">&ldquo;{i.quote}&rdquo;</p>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </Col4Section>
                      );
                    })()}

                    {/* Pain Points — quote hidden behind toggle */}
                    {(() => {
                      const items = activeMeeting.insights.filter(i => i.insight_type === 'pain_point');
                      return (
                        <Col4Section
                          title="Pain Points"
                          count={items.length}
                          isOpen={col4Sections.pain ?? false}
                          onToggle={() => setCol4Sections(prev => ({ ...prev, pain: !prev.pain }))}
                        >
                          {items.length === 0 ? (
                            <p className="text-xs text-gray-400 italic">None identified.</p>
                          ) : items.map(i => (
                            <div key={i.id} className="space-y-0.5">
                              <p className="text-xs text-gray-700 leading-snug">· {i.content}</p>
                              {i.quote && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedQuoteIds(prev => {
                                      const n = new Set(prev);
                                      n.has(i.id) ? n.delete(i.id) : n.add(i.id);
                                      return n;
                                    })}
                                    className="block text-[10px] text-brand-secondary hover:underline ml-3"
                                  >
                                    {expandedQuoteIds.has(i.id) ? 'Hide quote' : 'Show quote'}
                                  </button>
                                  {expandedQuoteIds.has(i.id) && (
                                    <p className="text-[10px] text-gray-400 italic ml-3">&ldquo;{i.quote}&rdquo;</p>
                                  )}
                                </>
                              )}
                            </div>
                          ))}
                        </Col4Section>
                      );
                    })()}

                    {/* Transcript */}
                    {(() => {
                      const segments = (activeMeeting.transcript ?? []) as TranscriptSegment[];
                      if (segments.length === 0) return null;
                      return (
                        <Col4Section
                          title="Transcript"
                          count={segments.length}
                          isOpen={col4Sections.transcript ?? false}
                          onToggle={() => setCol4Sections(prev => ({ ...prev, transcript: !prev.transcript }))}
                        >
                          {segments.map((s, i) => (
                            <div key={i} className="flex gap-2">
                              <span className="text-[10px] text-gray-400 flex-shrink-0 mt-0.5 font-mono">
                                {Math.floor((s.start ?? 0) / 60)}:{String(Math.round((s.start ?? 0) % 60)).padStart(2, '0')}
                              </span>
                              <p className="text-[11px] text-gray-600 leading-snug">{s.text}</p>
                            </div>
                          ))}
                        </Col4Section>
                      );
                    })()}
                  </div>
                </div>
              )}
            </div>

          </div>
        )}
      </div>
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
