'use client';

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { useMeetingNotesDrawer } from '@/lib/MeetingNotesDrawerContext';

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
}

interface DebriefFollowUp {
  id: number;
  taskText: string;
  nextSteps: string;
  completed: boolean;
  meetingId: number | null;
  source: string;
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
  attendeeCount: number;
  meetingCount: number;
  meetingsHeld: number;
  touchpointCount: number;
  openFollowUpCount: number;
  completedFollowUpCount: number;
  attendees: DebriefAttendee[];
  meetingCards: MeetingCard[];
  followUps: DebriefFollowUp[];
  timeline: { type: 'meeting'; attendeeName: string; date: string | null; time: string | null; label: string; isHeld: boolean }[];
}

interface DebriefData {
  conference: { id: number; name: string; start_date: string; end_date: string; location: string };
  repName: string;
  repFirstName: string;
  configId: number | null;
  stats: DebriefStats;
  companies: DebriefCompany[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function TierBadge({ tier }: { tier: string | null }) {
  const t = tier ?? 'unassigned';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${TIER_COLORS[t] ?? 'bg-gray-100 text-gray-500'}`}>
      {TIER_LABELS[t] ?? t}
    </span>
  );
}

function StatTile({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-3 border-r border-white/20 last:border-r-0 min-w-[100px]">
      <span className="text-2xl font-bold text-white">{value}</span>
      <span className="text-xs text-white/70 mt-0.5 text-center leading-tight">{label}</span>
      {sub && <span className="text-[10px] text-white/50 mt-0.5">{sub}</span>}
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
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium ${m.cls}`}>
      {count} {m.label}{count > 1 ? 's' : ''}
    </span>
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [followUps, setFollowUps] = useState<Record<number, DebriefFollowUp[]>>({});
  const { openMeetingNotes } = useMeetingNotesDrawer();
  const [togglingId, setTogglingId] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/debrief`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.error ?? 'Failed to load debrief');
      }
      const d: DebriefData = await res.json();
      setData(d);
      // Initialise local follow-up state per company
      const fuMap: Record<number, DebriefFollowUp[]> = {};
      for (const co of d.companies) fuMap[co.id] = co.followUps;
      setFollowUps(fuMap);
      if (d.companies.length > 0 && selectedCompanyId === null) {
        setSelectedCompanyId(d.companies[0].id);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load debrief');
    } finally {
      setLoading(false);
    }
  }, [conferenceId, selectedCompanyId]);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (isOpen && data === null && !loading) {
      fetchData();
    }
  }, [isOpen, data, loading, fetchData]);

  const toggleFollowUp = useCallback(async (fu: DebriefFollowUp, companyId: number) => {
    setTogglingId(fu.id);
    const next = !fu.completed;
    // Optimistic
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
      // Revert
      setFollowUps(prev => ({
        ...prev,
        [companyId]: (prev[companyId] ?? []).map(f => f.id === fu.id ? { ...f, completed: fu.completed } : f),
      }));
      toast.error('Failed to update follow-up');
    } finally {
      setTogglingId(null);
    }
  }, []);

  const selectedCompany = data?.companies.find(c => c.id === selectedCompanyId) ?? null;
  const companyFollowUps = selectedCompanyId != null ? (followUps[selectedCompanyId] ?? []) : [];

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ background: '#f8fafc' }}>
      {/* Header */}
      <div className="bg-brand-primary flex-shrink-0">
        <div className="flex items-center justify-between px-5 py-3 border-b border-white/20">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="text-white/70 hover:text-white transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div>
              <p className="text-xs text-white/60 font-medium uppercase tracking-wider">My Debrief</p>
              <h2 className="text-base font-bold text-white font-serif leading-tight">
                {data?.conference.name ?? 'Loading…'}
              </h2>
            </div>
          </div>
          {data && (
            <p className="text-xs text-white/60">{data.conference.location}</p>
          )}
        </div>

        {/* Stats bar */}
        {data && (
          <div className="flex items-stretch overflow-x-auto hide-scrollbar">
            <StatTile label="Companies Engaged" value={data.stats.companiesEngaged} />
            <StatTile label="Meetings Held" value={data.stats.meetingsHeld} />
            <StatTile label="Touchpoints" value={data.stats.touchpoints} />
            <StatTile label="Follow-ups Due" value={data.stats.followUpsDue} />
            <StatTile
              label="Sales Execution Score"
              value={data.stats.sesScore != null ? `${data.stats.sesScore}` : '—'}
              sub={data.stats.sesScore != null ? '/100' : undefined}
            />
          </div>
        )}
      </div>

      {/* Body */}
      {loading && (
        <div className="flex-1 flex items-center justify-center">
          <svg className="w-8 h-8 animate-spin text-brand-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
          </svg>
        </div>
      )}

      {error && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-gray-500 mb-3">{error}</p>
            <button onClick={fetchData} className="btn-primary text-sm">Try again</button>
          </div>
        </div>
      )}

      {!loading && !error && data && (
        <div className="flex flex-1 overflow-hidden">
          {/* Col 1 — Company list */}
          <div className="w-60 flex-shrink-0 border-r border-gray-200 bg-white overflow-y-auto">
            <div className="px-3 py-2 border-b border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                {data.companies.length} Compan{data.companies.length !== 1 ? 'ies' : 'y'}
              </p>
            </div>
            {data.companies.length === 0 && (
              <p className="text-sm text-gray-400 p-4 text-center">No company activity found.</p>
            )}
            {data.companies.map(co => {
              const isSelected = co.id === selectedCompanyId;
              const openFus = (followUps[co.id] ?? co.followUps).filter(f => !f.completed).length;
              return (
                <button
                  key={co.id}
                  onClick={() => setSelectedCompanyId(co.id)}
                  className={`w-full text-left px-3 py-2.5 border-b border-gray-50 transition-colors ${
                    isSelected
                      ? 'bg-brand-primary/8 border-l-2 border-l-brand-primary'
                      : 'hover:bg-gray-50 border-l-2 border-l-transparent'
                  }`}
                >
                  <p className={`text-sm font-medium truncate ${isSelected ? 'text-brand-primary' : 'text-gray-800'}`}>
                    {co.name}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    {co.tier && <TierBadge tier={co.tier} />}
                    {openFus > 0 && (
                      <span className="text-[11px] text-amber-600 font-medium">{openFus} due</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Col 2 — Company activity */}
          <div className="flex-1 overflow-y-auto p-5 border-r border-gray-200 min-w-0">
            {!selectedCompany ? (
              <p className="text-sm text-gray-400 text-center mt-12">Select a company to view activity.</p>
            ) : (
              <div className="space-y-5">
                {/* Company header */}
                <div>
                  <div className="flex items-start gap-3">
                    <div>
                      <h3 className="text-lg font-bold text-brand-primary font-serif">{selectedCompany.name}</h3>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {selectedCompany.tier && <TierBadge tier={selectedCompany.tier} />}
                        <span className="text-xs text-gray-500">{selectedCompany.attendeeCount} attendee{selectedCompany.attendeeCount !== 1 ? 's' : ''}</span>
                        <span className="text-xs text-gray-500">{selectedCompany.meetingsHeld} meeting{selectedCompany.meetingsHeld !== 1 ? 's' : ''} held</span>
                        {selectedCompany.touchpointCount > 0 && (
                          <span className="text-xs text-gray-500">{selectedCompany.touchpointCount} touchpoint{selectedCompany.touchpointCount !== 1 ? 's' : ''}</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Attendees */}
                {selectedCompany.attendees.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Contacts</p>
                    <div className="space-y-1">
                      {selectedCompany.attendees.map(a => (
                        <div key={a.id} className="flex items-center justify-between text-sm">
                          <div>
                            <span className="font-medium text-gray-800">{a.name}</span>
                            {a.title && <span className="text-gray-400 ml-1.5 text-xs">{a.title}</span>}
                          </div>
                          <div className="flex items-center gap-3 text-xs text-gray-400">
                            {a.meetingCount > 0 && <span>{a.meetingCount} mtg</span>}
                            {a.touchpointCount > 0 && <span>{a.touchpointCount} tp</span>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Meeting cards */}
                {selectedCompany.meetingCards.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Meetings</p>
                    <div className="space-y-2">
                      {selectedCompany.meetingCards.map(m => (
                        <div key={m.meetingId} className="rounded-lg border border-gray-200 bg-white p-3">
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
                            <button
                              onClick={() => openMeetingNotes(m.meetingId)}
                              className="flex-shrink-0 text-gray-400 hover:text-brand-primary transition-colors"
                              title="Open meeting notes"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                              </svg>
                            </button>
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
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Col 3 — Follow-ups */}
          <div className="w-72 flex-shrink-0 overflow-y-auto border-r border-gray-200 bg-white">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">Follow-ups</p>
              {selectedCompany && (
                <p className="text-xs text-gray-500 mt-0.5">{selectedCompany.name}</p>
              )}
            </div>

            {!selectedCompany ? (
              <p className="text-sm text-gray-400 p-4 text-center">Select a company.</p>
            ) : companyFollowUps.length === 0 ? (
              <p className="text-sm text-gray-400 p-4 text-center">No follow-ups.</p>
            ) : (
              <div className="divide-y divide-gray-50">
                {/* Open first */}
                {companyFollowUps.filter(f => !f.completed).map(fu => (
                  <div key={fu.id} className="px-4 py-3 flex items-start gap-3">
                    <button
                      onClick={() => toggleFollowUp(fu, selectedCompany.id)}
                      disabled={togglingId === fu.id}
                      className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 border-gray-300 hover:border-brand-primary transition-colors disabled:opacity-50"
                      title="Mark complete"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800 leading-snug">{fu.taskText}</p>
                      {fu.source !== 'From meeting notes' && (
                        <p className="text-[11px] text-gray-400 mt-0.5">{fu.source}</p>
                      )}
                    </div>
                  </div>
                ))}
                {/* Completed */}
                {companyFollowUps.filter(f => f.completed).map(fu => (
                  <div key={fu.id} className="px-4 py-3 flex items-start gap-3 opacity-50">
                    <button
                      onClick={() => toggleFollowUp(fu, selectedCompany.id)}
                      disabled={togglingId === fu.id}
                      className="mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 border-green-400 bg-green-400 flex items-center justify-center disabled:opacity-50"
                      title="Mark incomplete"
                    >
                      <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </button>
                    <p className="text-sm text-gray-500 line-through leading-snug">{fu.taskText}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );

  if (!mounted) return null;
  return createPortal(content, document.body);
}
