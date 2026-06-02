'use client';

import { useEffect, useState, useCallback, useMemo, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { getPreset } from '@/lib/colors';

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
  wse: number | null;
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

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-white/20 last:border-r-0 min-w-[90px] flex-shrink-0">
      <span className="text-xl font-bold text-white leading-tight">{value}</span>
      <span className="text-xs text-white/70 mt-0.5 text-center leading-tight">{label}</span>
      {sub && <span className="text-[9px] text-white/50">{sub}</span>}
    </div>
  );
}

function MobileStatCell({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col items-center justify-center py-2.5 px-2 border-b border-white/10 border-r border-r-white/10 last:border-r-0">
      <span className="text-lg font-bold text-white leading-tight">{value}</span>
      <span className="text-xs text-white/60 mt-0.5 text-center leading-tight">{label}</span>
    </div>
  );
}

function InsightChip({ type, count }: { type: string; count: number }) {
  if (count === 0) return null;
  const map: Record<string, { label: string; cls: string }> = {
    buying_signal: { label: 'Buy Signal', cls: 'bg-green-100 text-green-700' },
    pain_point: { label: 'Pain Point', cls: 'bg-red-100 text-red-700' },
    next_step: { label: 'Action Item', cls: 'bg-blue-100 text-blue-700' },
  };
  const m = map[type];
  if (!m) return null;
  return (
    <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium ${m.cls}`}>
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
        <span className="text-xs text-white font-semibold">{fmt$(value)}</span>
      </div>
      <div className="h-2 bg-white/20 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${barColor ?? 'bg-emerald-400'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between mt-0.5">
        {goal != null ? (
          <span className="text-[9px] text-white/50">{goalPct != null ? `${goalPct}%` : ''} of {fmt$(goal)}</span>
        ) : <span />}
        {teamPct != null && <span className="text-[9px] text-white/50">{teamPct}% of team</span>}
      </div>
    </div>
  );
}

function Col4Section({
  title, count, isOpen, onToggle, children,
}: {
  title: string; count: number; isOpen: boolean; onToggle: () => void; children: ReactNode;
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
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
              {count}
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && <div className="px-4 pb-3 space-y-1.5">{children}</div>}
    </div>
  );
}

function NoteCard({ note }: { note: DebriefNote }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = note.content.length > 200;
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
      {note.attendee_name && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-semibold bg-brand-primary/10 text-brand-primary">
            {note.attendee_name}
          </span>
        </div>
      )}
      <p className={`text-xs text-gray-700 leading-relaxed ${expanded ? '' : 'line-clamp-4'}`}>{note.content}</p>
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          className="text-xs text-brand-secondary hover:underline"
        >
          {expanded ? 'Show less' : 'Show more'}
        </button>
      )}
      <div className="flex items-center justify-between text-xs text-gray-400 pt-1 border-t border-gray-100">
        {note.rep ? <span>{note.rep}</span> : <span />}
        <span>{fmtDate(note.created_at)}</span>
      </div>
    </div>
  );
}

// Shared meeting notes panel — used by both desktop col4 and mobile overlay
function MeetingNotesPanel({
  activeMeeting,
  selectedCompany,
  activeMeetingId,
  col4Sections,
  setCol4Sections,
  col4FadeKey,
  expandedQuoteIds,
  setExpandedQuoteIds,
  switchMeeting,
  onClose,
}: {
  activeMeeting: MeetingCard;
  selectedCompany: DebriefCompany;
  activeMeetingId: number | null;
  col4Sections: Record<string, boolean>;
  setCol4Sections: (fn: (prev: Record<string, boolean>) => Record<string, boolean>) => void;
  col4FadeKey: number;
  expandedQuoteIds: Set<number>;
  setExpandedQuoteIds: (fn: (prev: Set<number>) => Set<number>) => void;
  switchMeeting: (id: number) => void;
  onClose: () => void;
}) {
  return (
    <>
      {/* Panel header */}
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
          <button type="button" onClick={onClose} className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors">
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
                className={`flex-shrink-0 px-2 py-1 rounded text-xs font-medium transition-colors ${
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

      {/* Panel content */}
      <div key={col4FadeKey} className="flex-1 overflow-y-auto" style={{ animation: 'debriefFadeIn 0.15s ease-out' }}>
        {activeMeeting.notesText && (
          <Col4Section
            title="User Notes"
            count={0}
            isOpen={col4Sections.userNotes ?? true}
            onToggle={() => setCol4Sections(prev => ({ ...prev, userNotes: !prev.userNotes }))}
          >
            <div className="bg-yellow-50 border border-yellow-100 rounded-lg p-3">
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-wrap">{activeMeeting.notesText}</p>
            </div>
          </Col4Section>
        )}

        <Col4Section
          title="Meeting Summary"
          count={0}
          isOpen={col4Sections.summary ?? false}
          onToggle={() => setCol4Sections(prev => ({ ...prev, summary: !prev.summary }))}
        >
          {activeMeeting.summary ? (
            <p className="text-xs text-gray-600 leading-relaxed">{activeMeeting.summary}</p>
          ) : (
            <p className="text-xs text-gray-400 italic">No AI summary available.</p>
          )}
        </Col4Section>

        {(() => {
          const items = activeMeeting.insights.filter(i => i.insight_type === 'next_step');
          return (
            <Col4Section title="Action Items" count={items.length}
              isOpen={col4Sections.actions ?? false}
              onToggle={() => setCol4Sections(prev => ({ ...prev, actions: !prev.actions }))}>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic">None identified.</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map(i => (
                    <div key={i.id} className="rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2">
                      <p className="text-xs text-gray-700 leading-snug">{i.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </Col4Section>
          );
        })()}

        {(['buying_signal', 'pain_point'] as const).map(type => {
          const title = type === 'buying_signal' ? 'Buying Signals' : 'Pain Points';
          const key = type === 'buying_signal' ? 'buying' : 'pain';
          const cardCls = type === 'buying_signal'
            ? 'border-green-100 bg-green-50/60'
            : 'border-red-100 bg-red-50/60';
          const items = activeMeeting.insights.filter(i => i.insight_type === type);
          return (
            <Col4Section key={type} title={title} count={items.length}
              isOpen={col4Sections[key] ?? false}
              onToggle={() => setCol4Sections(prev => ({ ...prev, [key]: !prev[key] }))}>
              {items.length === 0 ? (
                <p className="text-xs text-gray-400 italic">None identified.</p>
              ) : (
                <div className="space-y-1.5">
                  {items.map(i => (
                    <div key={i.id} className={`rounded-lg border px-3 py-2 space-y-1.5 ${cardCls}`}>
                      <p className="text-xs text-gray-700 leading-snug">{i.content}</p>
                      {i.quote && (
                        <>
                          <button
                            type="button"
                            onClick={() => setExpandedQuoteIds(prev => {
                              const n = new Set(prev);
                              n.has(i.id) ? n.delete(i.id) : n.add(i.id);
                              return n;
                            })}
                            className="text-xs text-brand-secondary hover:underline"
                          >
                            {expandedQuoteIds.has(i.id) ? 'Hide quote' : 'Show quote'}
                          </button>
                          {expandedQuoteIds.has(i.id) && (
                            <p className="text-xs text-gray-500 italic border-t border-gray-200/60 pt-1.5">&ldquo;{i.quote}&rdquo;</p>
                          )}
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Col4Section>
          );
        })}

        {(() => {
          const segments = (activeMeeting.transcript ?? []) as TranscriptSegment[];
          if (segments.length === 0) return null;
          return (
            <Col4Section title="Transcript" count={segments.length}
              isOpen={col4Sections.transcript ?? false}
              onToggle={() => setCol4Sections(prev => ({ ...prev, transcript: !prev.transcript }))}>
              {segments.map((s, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5 font-mono">
                    {Math.floor((s.start ?? 0) / 60)}:{String(Math.round((s.start ?? 0) % 60)).padStart(2, '0')}
                  </span>
                  <p className="text-[11px] text-gray-600 leading-snug">{s.text}</p>
                </div>
              ))}
            </Col4Section>
          );
        })()}
      </div>
    </>
  );
}

// ─── Session Note Types ───────────────────────────────────────────────────────

interface AgendaItemWithNote {
  id: number;
  title: string;
  day_label: string | null;
  start_time: string | null;
  end_time: string | null;
  session_type: string | null;
  note_content: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type MobileTab = 'companies' | 'activity' | 'followups';

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
  const [mobileTab, setMobileTab] = useState<MobileTab>('activity');
  const [statsOpen, setStatsOpen] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [tpMapOpen, setTpMapOpen] = useState(false);
  const [tpMapData, setTpMapData] = useState<{
    total: number;
    attendees: { id: number; first_name: string; last_name: string }[];
    conferences: { id: number; name: string; cells: Record<string, { option_id: number; value: string; color: string | null; count: number }[]> }[];
  } | null>(null);
  const [tpMapLoading, setTpMapLoading] = useState(false);
  const [recordDrawer, setRecordDrawer] = useState<{ type: 'attendee' | 'company'; id: number } | null>(null);
  const [sessionNotesOpen, setSessionNotesOpen] = useState(false);
  const [sessionNotes, setSessionNotes] = useState<AgendaItemWithNote[]>([]);
  const [sessionNotesLoading, setSessionNotesLoading] = useState(false);
  const [expandedSessionNoteIds, setExpandedSessionNoteIds] = useState<Set<number>>(new Set());

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

  useEffect(() => {
    if (!selectedCompanyId || !data) { setCompanyNotes([]); return; }
    fetch(`/api/notes?entity_type=company&entity_id=${selectedCompanyId}`)
      .then(r => r.ok ? r.json() : [])
      .then((notes: DebriefNote[]) => setCompanyNotes(notes.filter(n => n.conference_name === data.conference.name)))
      .catch(() => setCompanyNotes([]));
  }, [selectedCompanyId, data]);

  useEffect(() => {
    if (!sessionNotesOpen) return;
    setSessionNotesLoading(true);
    fetch(`/api/conferences/${conferenceId}/my-agenda`)
      .then(r => r.ok ? r.json() : { myItems: [] })
      .then((d: { myItems: AgendaItemWithNote[] }) => {
        setSessionNotes((d.myItems ?? []).filter(item => item.note_content?.trim()));
      })
      .catch(() => setSessionNotes([]))
      .finally(() => setSessionNotesLoading(false));
  }, [sessionNotesOpen, conferenceId]);

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
        method: 'PATCH',
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
    setTpMapOpen(false);
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

  const closeMeetingPanel = useCallback(() => {
    setActiveMeetingId(null);
  }, []);

  const openTouchpointMap = useCallback(async (companyId: number) => {
    setTpMapOpen(true);
    if (tpMapData) return; // already loaded
    setTpMapLoading(true);
    try {
      const res = await fetch(`/api/companies/${companyId}/touchpoints`);
      if (res.ok) setTpMapData(await res.json());
    } catch { /* non-blocking */ } finally {
      setTpMapLoading(false);
    }
  }, [tpMapData]);

  const openRecordDrawer = useCallback((type: 'attendee' | 'company', id: number) => {
    setRecordDrawer({ type, id });
  }, []);

  const closeRecordDrawer = useCallback(() => {
    setRecordDrawer(null);
  }, []);

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-50">
      <style>{`
        @keyframes debriefFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideInRight { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>

      {/* Dark backdrop — desktop only (mobile uses full-screen modal) */}
      <div className="hidden sm:block absolute inset-0" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} />

      {/* Mobile: full-screen white backdrop */}
      <div className="sm:hidden absolute inset-0 bg-black/30" />

      {/* ── Centering wrapper ──
          Mobile: absolute inset-0 (full screen)
          Desktop: starts at sidebar right edge (left-64), flex centered */}
      <div className="absolute inset-0 sm:left-64 sm:flex sm:items-center sm:justify-center sm:p-5">

        {/* Modal box — full-screen on mobile, contained on desktop */}
        <div className="relative w-full h-full sm:h-[85vh] sm:max-w-[1440px] flex flex-col bg-white sm:rounded-xl sm:shadow-2xl overflow-hidden">

          {/* ── Header ── */}
          <div className="bg-brand-primary flex-shrink-0">

            {/* Top bar */}
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 border-b border-white/20">
              <div className="flex items-center gap-3 min-w-0">
                <button onClick={onClose} className="text-white/70 hover:text-white transition-colors flex-shrink-0">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-white/60 font-semibold uppercase tracking-widest">Field Report</p>
                  <h2 className="text-base font-bold text-white font-serif leading-tight truncate">
                    {data?.conference.name ?? 'Loading…'}
                  </h2>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                {data && <p className="text-xs text-white/60 hidden sm:block">{data.conference.location}</p>}
                {data && (
                  <button
                    type="button"
                    onClick={() => setSessionNotesOpen(v => !v)}
                    className={`text-xs font-semibold px-3 py-1 rounded-full border transition-colors flex-shrink-0 ${
                      sessionNotesOpen
                        ? 'bg-white text-brand-primary border-white'
                        : 'bg-white/10 text-white/80 border-white/30 hover:bg-white/20 hover:text-white'
                    }`}
                  >
                    Session Notes
                  </button>
                )}
                {/* Mobile stats toggle */}
                {data && (
                  <button
                    type="button"
                    onClick={() => setStatsOpen(v => !v)}
                    className="sm:hidden text-white/70 hover:text-white transition-colors p-1"
                    aria-label={statsOpen ? 'Collapse stats' : 'Expand stats'}
                  >
                    <svg className={`w-5 h-5 transition-transform duration-200 ${statsOpen ? '' : 'rotate-180'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                )}
              </div>
            </div>

            {/* ── Mobile stats grid (collapsible) ── */}
            {data && (
              <div className={`sm:hidden ${statsOpen ? 'block' : 'hidden'}`}>
                <div className="grid grid-cols-3 border-t border-white/10">
                  <MobileStatCell label="Companies" value={data.stats.companiesEngaged} />
                  <MobileStatCell label="Meetings" value={data.stats.meetingsHeld} />
                  <MobileStatCell label="Touchpoints" value={data.stats.touchpoints} />
                  <MobileStatCell label="Follow-ups Due" value={followUpsDue} />
                  <MobileStatCell
                    label="Sales Exec"
                    value={repSesScore != null ? `${repSesScore}/100` : '—'}
                  />
                  <div className="py-2.5 px-2 border-b border-white/10" /> {/* spacer */}
                </div>
                {pipelineByRep && (pipelineByRep.repPipeline != null || pipelineByRep.total > 0) && (
                  <div className="px-4 py-3 space-y-2.5 border-t border-white/10">
                    <PipelineBar label="My Pipeline Influence" value={pipelineByRep.repPipeline ?? 0} goal={pipelineByRep.repShare} teamTotal={pipelineByRep.total} barColor="bg-emerald-400" />
                    <PipelineBar label="Team vs. Goal" value={pipelineByRep.total} goal={pipelineByRep.goal} barColor="bg-sky-400" />
                  </div>
                )}
              </div>
            )}

            {/* ── Desktop stats bar (always visible) ── */}
            {data && (
              <div className="hidden sm:flex items-stretch overflow-x-auto hide-scrollbar">
                <StatTile label="Companies" value={data.stats.companiesEngaged} />
                <StatTile label="Meetings Held" value={data.stats.meetingsHeld} />
                <StatTile label="Touchpoints" value={data.stats.touchpoints} />
                <StatTile label="Follow-ups Due" value={followUpsDue} />
                <StatTile
                  label="Sales Exec Score"
                  value={repSesScore != null ? String(repSesScore) : '—'}
                  sub={repSesScore != null ? '/100' : undefined}
                />
                {pipelineByRep && (pipelineByRep.repPipeline != null || pipelineByRep.total > 0) && (
                  <div className="flex flex-col justify-center px-5 py-2 border-l border-white/20 min-w-[400px] max-w-[480px] flex-shrink-0 gap-2.5">
                    <PipelineBar label="My Pipeline Influence" value={pipelineByRep.repPipeline ?? 0} goal={pipelineByRep.repShare} teamTotal={pipelineByRep.total} barColor="bg-emerald-400" />
                    <PipelineBar label="Team vs. Goal" value={pipelineByRep.total} goal={pipelineByRep.goal} barColor="bg-sky-400" />
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Session Notes panel ── */}
          {sessionNotesOpen && (
            <div className="flex-shrink-0 border-b border-gray-200 bg-gray-50 max-h-72 overflow-y-auto">
              {sessionNotesLoading ? (
                <div className="flex items-center justify-center py-6">
                  <svg className="w-5 h-5 animate-spin text-brand-primary" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                </div>
              ) : sessionNotes.length === 0 ? (
                <div className="px-4 py-5 text-center">
                  <p className="text-sm text-gray-400">No session notes found for this conference.</p>
                  <p className="text-xs text-gray-400 mt-1">Add notes to sessions in My Agenda and they will appear here.</p>
                </div>
              ) : (
                <div className="p-3 space-y-2">
                  {sessionNotes.map(item => {
                    const isExpanded = expandedSessionNoteIds.has(item.id);
                    const timeLabel = [item.start_time, item.end_time].filter(Boolean).join(' – ');
                    return (
                      <div key={item.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          type="button"
                          onClick={() => setExpandedSessionNoteIds(prev => {
                            const n = new Set(prev);
                            n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                            return n;
                          })}
                          className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{item.title}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {[item.day_label, timeLabel].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            {item.session_type && (
                              <span className="flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary border border-brand-primary/20">
                                {item.session_type}
                              </span>
                            )}
                          </div>
                          <svg
                            className={`w-4 h-4 text-gray-400 flex-shrink-0 ml-2 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                            fill="none" stroke="currentColor" viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        {isExpanded && (
                          <div className="px-3 pb-3 border-t border-gray-100">
                            <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap pt-2">{item.note_content}</p>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Mobile tab bar ── */}
          {data && !loading && !error && (
            <div className="sm:hidden flex border-b border-gray-200 bg-white flex-shrink-0">
              {(['companies', 'activity', 'followups'] as const).map(tab => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setMobileTab(tab)}
                  className={`flex-1 py-2.5 text-xs font-semibold transition-colors ${
                    mobileTab === tab
                      ? 'text-brand-primary border-b-2 border-brand-primary'
                      : 'text-gray-400 hover:text-gray-600'
                  }`}
                >
                  {tab === 'companies' ? 'Companies' : tab === 'activity' ? 'Activity' : 'Follow-ups'}
                </button>
              ))}
            </div>
          )}

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
            <div className="relative flex flex-1 overflow-hidden" onClick={() => closeRecordDrawer()}>

              {/* Col 1 — Company list
                  Mobile: full-width when tab=companies, hidden otherwise
                  Desktop: collapsible w-56/w-8 */}
              <div className={[
                // Mobile visibility
                mobileTab === 'companies' ? 'flex' : 'hidden',
                // Desktop: always shown (overrides hidden), collapsible width
                `sm:flex sm:flex-col sm:flex-shrink-0 sm:border-r sm:border-gray-200 sm:bg-white sm:overflow-hidden sm:transition-all sm:duration-200 sm:ease-out`,
                col1Collapsed ? 'sm:w-8' : 'sm:w-72',
                // Mobile: full width
                'flex-col w-full',
              ].join(' ')}>
                {/* Header with collapse toggle (desktop only) */}
                <div className="hidden sm:flex items-center justify-between px-2 py-2 border-b border-gray-100 flex-shrink-0">
                  {!col1Collapsed && (
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
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
                {/* Mobile header */}
                <div className="sm:hidden px-3 py-2 border-b border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                    {data.companies.length} Compan{data.companies.length !== 1 ? 'ies' : 'y'}
                  </p>
                </div>

                {/* Company list — hidden when desktop-collapsed */}
                {(!col1Collapsed || true) && (
                  <div className={`overflow-y-auto flex-1 p-2 space-y-2 ${col1Collapsed ? 'sm:hidden' : ''}`}>
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
                          onClick={() => {
                            setSelectedCompanyId(co.id);
                            setActiveMeetingId(null);
                            setMobileTab('activity');
                            setTpMapOpen(false);
                            setTpMapData(null);
                          }}
                          className={`w-full text-left bg-white rounded-xl p-3 border-2 transition-all hover:shadow-sm ${
                            isSelected ? 'border-brand-primary' : 'border-gray-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-1">
                            <p className={`text-sm font-semibold leading-snug min-w-0 truncate ${isSelected ? 'text-brand-primary' : 'text-gray-800'}`}>
                              {co.name}
                            </p>
                            {allDone && (
                              <span className="flex-shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-green-100 text-green-700 border border-green-300">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                                </svg>
                                Done
                              </span>
                            )}
                            {!allDone && openFus > 0 && (
                              <span className="flex-shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-rose-100 text-rose-600 border border-rose-200">
                                {openFus} due
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Col 2 — Company activity
                  Mobile: full-width when tab=activity
                  Desktop: flex-1 */}
              <div className={[
                mobileTab === 'activity' ? 'block' : 'hidden',
                'sm:block sm:flex-1 overflow-y-auto p-4 sm:p-5 border-r border-gray-200 min-w-0 w-full',
              ].join(' ')}>
                {!selectedCompany ? (
                  <p className="text-sm text-gray-400 text-center mt-12">Select a company to view activity.</p>
                ) : (
                  <div className="space-y-5">
                    {/* Company header */}
                    <div>
                      <button
                        type="button"
                        onClick={e => { e.stopPropagation(); openRecordDrawer('company', selectedCompany.id); }}
                        className="text-left hover:underline"
                      >
                        <h3 className="text-lg font-bold text-brand-primary font-serif">{selectedCompany.name}</h3>
                      </button>
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        {selectedCompany.status && selectedCompany.status !== 'Unknown' && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_COLORS[selectedCompany.status] ?? 'bg-gray-100 text-gray-500'}`}>
                            {selectedCompany.status}
                          </span>
                        )}
                        {selectedCompany.icp && selectedCompany.icp !== 'No' && (
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-700">ICP</span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-200 bg-gray-50 text-gray-600">
                          {selectedCompany.attendeeCount} attendee{selectedCompany.attendeeCount !== 1 ? 's' : ''}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-200 bg-gray-50 text-gray-600">
                          {selectedCompany.meetingsHeld} meeting{selectedCompany.meetingsHeld !== 1 ? 's' : ''} held
                        </span>
                        {selectedCompany.touchpointCount > 0 && (
                          <button
                            type="button"
                            onClick={() => openTouchpointMap(selectedCompany.id)}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium border border-gray-200 bg-gray-50 text-gray-600 hover:bg-gray-100 hover:border-gray-300 transition-colors cursor-pointer"
                          >
                            {selectedCompany.touchpointCount} touchpoint{selectedCompany.touchpointCount !== 1 ? 's' : ''}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Contacts grid */}
                    {selectedCompany.attendees.length > 0 && (
                      <div>
                        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contacts</p>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {selectedCompany.attendees.map(a => (
                            <div key={a.id} className="border border-gray-200 rounded-lg p-2.5 bg-white hover:border-gray-300 transition-colors">
                              <button
                                type="button"
                                onClick={e => { e.stopPropagation(); openRecordDrawer('attendee', a.id); }}
                                className="text-left w-full hover:underline"
                              >
                                <p className="text-xs font-semibold text-gray-800 leading-tight truncate">{a.name}</p>
                              </button>
                              {a.title && <p className="text-xs text-gray-400 mt-0.5 truncate">{a.title}</p>}
                              <div className="flex flex-col gap-1 mt-1.5">
                                {a.meetingCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-brand-primary/10 text-brand-primary">
                                    {a.meetingCount} Meeting{a.meetingCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {a.touchpointCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                    {a.touchpointCount} Touchpoint{a.touchpointCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {a.followUpCount > 0 && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-rose-100 text-rose-600">
                                    {a.followUpCount} Follow-Up{a.followUpCount !== 1 ? 's' : ''}
                                  </span>
                                )}
                                {a.meetingCount === 0 && a.touchpointCount === 0 && a.followUpCount === 0 && (
                                  <span className="text-xs text-gray-300 italic">No activity</span>
                                )}
                              </div>
                            </div>
                          ))}
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
                                  isActive ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 bg-white hover:border-gray-300 hover:bg-gray-50'
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
                                  <svg className={`w-4 h-4 flex-shrink-0 mt-0.5 transition-colors ${isActive ? 'text-brand-primary' : 'text-gray-300'}`}
                                    fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
                                {m.summary && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{m.summary}</p>}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {companyNotes.map(note => <NoteCard key={note.id} note={note} />)}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Col 3 — Follow-ups
                  Mobile: full-width when tab=followups
                  Desktop: fixed w-[27rem] */}
              <div className={[
                mobileTab === 'followups' ? 'flex' : 'hidden',
                'sm:flex sm:flex-col sm:flex-shrink-0 sm:w-[27rem] sm:border-r sm:border-gray-200 sm:bg-white sm:overflow-y-auto',
                'flex-col w-full overflow-y-auto',
              ].join(' ')}>
                <div className="px-4 py-2.5 border-b border-gray-100 flex-shrink-0">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Follow-ups</p>
                  {selectedCompany && <p className="text-xs text-gray-500 mt-0.5">{selectedCompany.name}</p>}
                </div>
                {!selectedCompany ? (
                  <p className="text-sm text-gray-400 p-4 text-center">Select a company.</p>
                ) : companyFollowUps.length === 0 ? (
                  <p className="text-sm text-gray-400 p-4 text-center">No follow-ups.</p>
                ) : (
                  <div className="divide-y divide-gray-100 overflow-y-auto flex-1">
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
                              <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                                {fu.nextSteps && (
                                  <span className={`inline-flex px-2 py-0.5 rounded-lg text-[11px] font-semibold ${
                                    fu.completed ? 'bg-green-100 text-green-700' : 'bg-brand-primary text-white'
                                  }`}>{fu.nextSteps}</span>
                                )}
                                {fu.attendeeName && (
                                  <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                                    {fu.attendeeName}
                                  </span>
                                )}
                              </div>
                              {taskLines.length === 0 ? (
                                <p className="text-xs text-gray-700 leading-snug">{fu.taskText}</p>
                              ) : (
                                <div>
                                  {visibleLines.map((line, i) => (
                                    <p key={i} className={`text-xs text-gray-700 leading-snug${i > 0 ? ' mt-1.5' : ''}`}>- {line}</p>
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
                                        className="text-xs text-brand-secondary hover:underline mt-0.5"
                                      >
                                        {isExpanded ? 'Show less' : `Show All (${taskLines.length})`}
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}
                              <p className="text-xs text-gray-400 mt-1">{fu.source}</p>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => selectedCompany && toggleFollowUp(fu, selectedCompany.id)}
                                disabled={togglingId === fu.id}
                                className={`flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium border-2 transition-all disabled:opacity-50 ${
                                  fu.completed ? 'bg-green-500 text-white border-green-600' : 'bg-white text-gray-500 border-gray-300 hover:border-green-400'
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
                                onClick={() => selectedCompany && deleteFollowUp(fu.id, selectedCompany.id)}
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

              {/* Col 4 — Meeting notes: desktop slide-in panel */}
              <div
                className={`hidden sm:flex sm:flex-col sm:flex-shrink-0 sm:border-l sm:border-gray-200 sm:bg-white sm:overflow-hidden sm:transition-all sm:ease-out ${
                  activeMeetingId != null ? 'sm:w-80' : 'sm:w-0'
                }`}
                style={{ transitionDuration: '200ms' }}
              >
                {activeMeeting && selectedCompany && (
                  <div className="w-80 h-full flex flex-col overflow-hidden">
                    <MeetingNotesPanel
                      activeMeeting={activeMeeting}
                      selectedCompany={selectedCompany}
                      activeMeetingId={activeMeetingId}
                      col4Sections={col4Sections}
                      setCol4Sections={setCol4Sections}
                      col4FadeKey={col4FadeKey}
                      expandedQuoteIds={expandedQuoteIds}
                      setExpandedQuoteIds={setExpandedQuoteIds}
                      switchMeeting={switchMeeting}
                      onClose={closeMeetingPanel}
                    />
                  </div>
                )}
              </div>

              {/* Mobile meeting notes overlay — slides in over the modal, full-screen */}
              {activeMeetingId != null && activeMeeting && selectedCompany && (
                <div
                  className="sm:hidden absolute inset-0 z-10 bg-white flex flex-col"
                  style={{ animation: 'slideInRight 0.25s ease-out' }}
                >
                  <MeetingNotesPanel
                    activeMeeting={activeMeeting}
                    selectedCompany={selectedCompany}
                    activeMeetingId={activeMeetingId}
                    col4Sections={col4Sections}
                    setCol4Sections={setCol4Sections}
                    col4FadeKey={col4FadeKey}
                    expandedQuoteIds={expandedQuoteIds}
                    setExpandedQuoteIds={setExpandedQuoteIds}
                    switchMeeting={switchMeeting}
                    onClose={closeMeetingPanel}
                  />
                </div>
              )}

              {/* Touchpoint Map overlay */}
              {tpMapOpen && selectedCompany && data && (
                <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40 p-4">
                  <div className="relative bg-white rounded-2xl shadow-2xl border border-gray-200 w-full max-w-4xl max-h-[75vh] flex flex-col">
                    {/* Header */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
                      <div>
                        <h3 className="text-base font-semibold text-brand-primary font-serif">Touchpoint Map</h3>
                        {(() => {
                          const conf = tpMapData?.conferences.find(c => c.id === data.conference.id);
                          if (!conf) return <p className="text-xs text-gray-400 mt-0.5">{selectedCompany.name} · {data.conference.name}</p>;
                          const confTotal = Object.values(conf.cells).flat().reduce((s, e) => s + e.count, 0);
                          const attendeeCount = Object.keys(conf.cells).length;
                          return <p className="text-xs text-gray-400 mt-0.5">{confTotal} total touchpoint{confTotal !== 1 ? 's' : ''} · {attendeeCount} attendee{attendeeCount !== 1 ? 's' : ''}</p>;
                        })()}
                      </div>
                      <button type="button" onClick={() => setTpMapOpen(false)} className="text-gray-300 hover:text-gray-500 transition-colors">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* Body */}
                    <div className="flex-1 overflow-auto p-4 sm:p-6">
                      {tpMapLoading ? (
                        <div className="flex justify-center py-8">
                          <svg className="w-6 h-6 animate-spin text-brand-primary" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        </div>
                      ) : (() => {
                        const conf = tpMapData?.conferences.find(c => c.id === data.conference.id);
                        const attendees = tpMapData?.attendees ?? [];
                        if (!conf || attendees.length === 0) {
                          return <p className="text-sm text-gray-400 text-center py-8">No touchpoints for this conference.</p>;
                        }
                        // Only show attendees who have cells in this conference
                        const activeAttendees = attendees.filter(a => conf.cells[String(a.id)]?.length);
                        return (
                          <table className="w-full text-xs border-collapse min-w-max">
                            <thead>
                              <tr>
                                <th className="text-left py-2 pr-4 text-xs font-semibold text-gray-400 uppercase tracking-wider w-36 sticky left-0 bg-white">Conference</th>
                                {activeAttendees.map(a => (
                                  <th key={a.id} className="text-left py-2 px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider min-w-[140px]">
                                    {a.first_name} {a.last_name}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              <tr className="bg-gray-50/60">
                                <td className="py-3 pr-4 align-top sticky left-0 bg-gray-50/60">
                                  <span className="font-semibold text-gray-700 leading-snug block">{conf.name}</span>
                                </td>
                                {activeAttendees.map(a => {
                                  const entries = conf.cells[String(a.id)] ?? [];
                                  return (
                                    <td key={a.id} className="py-3 px-3 align-top">
                                      {entries.length === 0 ? (
                                        <span className="text-gray-200">—</span>
                                      ) : (
                                        <div className="flex flex-col gap-1">
                                          {entries.map((e, i) => {
                                            const preset = getPreset(e.color);
                                            return (
                                              <div
                                                key={i}
                                                className="inline-flex items-center justify-between gap-3 rounded-lg border-2 pl-2.5 pr-2 py-1 text-xs font-medium"
                                                style={{
                                                  borderColor: preset.hex,
                                                  backgroundColor: `${preset.hex}18`,
                                                  color: preset.hex,
                                                  minWidth: '7rem',
                                                  width: 'fit-content',
                                                }}
                                              >
                                                <span>{e.value}</span>
                                                <span className="font-bold flex-shrink-0">{e.count}</span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}

            </div>
          )}

        </div>
      </div>

      {/* Record drawer — fixed, full viewport height, slides in from right */}
      {/* Mobile backdrop */}
      {recordDrawer != null && (
        <div
          className="sm:hidden fixed inset-0 z-[59] bg-black/30"
          onClick={closeRecordDrawer}
        />
      )}
      <div
        className={`fixed top-0 right-0 h-screen bg-white border-l border-gray-200 shadow-2xl z-[60] flex flex-col overflow-hidden transition-all ease-out ${
          recordDrawer != null ? 'w-full sm:w-[400px]' : 'w-0'
        }`}
        style={{ transitionDuration: '200ms' }}
        onClick={e => e.stopPropagation()}
      >
        {recordDrawer != null && (
          <>
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100 flex-shrink-0 bg-white">
              <a
                href={`/${recordDrawer.type === 'attendee' ? 'attendees' : 'companies'}/${recordDrawer.id}`}
                className="text-xs text-brand-secondary hover:underline font-medium"
              >
                Go to {recordDrawer.type === 'attendee' ? 'Attendee' : 'Company'} Record →
              </a>
              <button type="button" onClick={closeRecordDrawer} className="text-gray-400 hover:text-gray-600 transition-colors">
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
          </>
        )}
      </div>
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
