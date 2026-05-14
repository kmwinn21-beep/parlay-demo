'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUser } from '@/components/UserContext';
import { CalendarNotesPanel } from './CalendarNotesPanel';

type Decision = 'confirmed' | 'watching' | 'passed' | 'pending_approval';

interface UserDecision {
  userId: number;
  displayName: string;
  email: string;
  decision: Decision;
  note: string | null;
  updatedAt: string;
}

interface BoardConference {
  conferenceId: number;
  name: string;
  year: number;
  attendeeCount: number;
  accountDecision: Decision | null;
  userDecisions: UserDecision[];
}

interface ScoreData {
  conferenceId: number;
  calendarRecommendationScore: number | null;
  recommendationTier: string;
  componentScores?: {
    audienceFit: number | null;
    targetOpportunity: number | null;
    engagementCapture: number | null;
    commercialPotential: number | null;
  };
}

const COLUMNS: { id: Decision; label: string; headerCls: string; borderCls: string }[] = [
  { id: 'confirmed',        label: 'Confirmed',        headerCls: 'text-emerald-700 bg-emerald-50', borderCls: 'border-emerald-200' },
  { id: 'watching',         label: 'Watching',         headerCls: 'text-amber-700 bg-amber-50',     borderCls: 'border-amber-200' },
  { id: 'passed',           label: 'Passed',           headerCls: 'text-red-700 bg-red-50',         borderCls: 'border-red-200' },
  { id: 'pending_approval', label: 'Pending Approval', headerCls: 'text-blue-700 bg-blue-50',       borderCls: 'border-blue-200' },
];

const DECISION_PILL: Record<Decision, string> = {
  confirmed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  watching:         'bg-amber-50 text-amber-700 border-amber-200',
  passed:           'bg-red-50 text-red-700 border-red-200',
  pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
};

const TIER_INFO: Record<string, { label: string; cls: string }> = {
  attend_invest_more:          { label: 'Attend & Invest',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attend_maintain:             { label: 'Attend & Maintain', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  attend_reconsider_format:    { label: 'Reconsider Format', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  evaluate_before_committing:  { label: 'Evaluate First',    cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  do_not_prioritize:           { label: 'Do Not Prioritize', cls: 'bg-red-50 text-red-600 border-red-100' },
  remove_from_calendar:        { label: 'Remove',            cls: 'bg-red-50 text-red-700 border-red-200' },
};

function tierInfo(tier: string) {
  return TIER_INFO[tier] ?? { label: tier.replace(/_/g, ' '), cls: 'bg-gray-50 text-gray-600 border-gray-200' };
}

function ScoreChip({ label, value }: { label: string; value: number | null | undefined }) {
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-semibold border bg-gray-50 text-gray-600 border-gray-100">
      <span className="text-gray-400">{label}</span>
      <span>{value != null ? Math.round(value) : '—'}</span>
    </span>
  );
}

export function DecisionsBoard() {
  const { user } = useUser();
  const [conferences, setConferences] = useState<BoardConference[]>([]);
  const [scoreMap, setScoreMap] = useState<Map<number, ScoreData>>(new Map());
  const [loading, setLoading] = useState(true);
  const [notesConferenceId, setNotesConferenceId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const isAdmin = user?.role === 'administrator';

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      fetch('/api/calendar-intelligence/decisions/board')
        .then(r => r.ok ? r.json() : { conferences: [] })
        .then((data: { conferences: BoardConference[] }) => data.conferences ?? []),
      fetch('/api/program-intelligence/calendar-intelligence')
        .then(r => r.ok ? r.json() : { conferences: [] })
        .then((data: { conferences: ScoreData[] }) => {
          const map = new Map<number, ScoreData>();
          for (const c of data.conferences ?? []) map.set(c.conferenceId, c);
          return map;
        }),
    ])
      .then(([confs, scores]) => {
        setConferences(confs);
        setScoreMap(scores);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  const updateAccountDecision = async (conferenceId: number, decision: Decision) => {
    setConferences(prev => prev.map(c => c.conferenceId === conferenceId ? { ...c, accountDecision: decision } : c));
    await fetch('/api/calendar-intelligence/decisions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conferenceId, decision, level: 'account' }),
    });
  };

  const handleDrop = (e: React.DragEvent, targetDecision: Decision) => {
    e.preventDefault();
    if (draggedId == null || !isAdmin) return;
    void updateAccountDecision(draggedId, targetDecision);
    setDraggedId(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
      </div>
    );
  }

  const decidedConferences = conferences.filter(c => c.accountDecision != null);
  const awaitingConferences = conferences.filter(c => c.accountDecision == null);

  function ConferenceCard({ conf, draggable: isDraggable }: { conf: BoardConference; draggable?: boolean }) {
    const sd = scoreMap.get(conf.conferenceId);
    const ti = sd ? tierInfo(sd.recommendationTier) : null;
    const aligned = conf.userDecisions.length > 0 && conf.userDecisions.every(ud => ud.decision === conf.accountDecision);
    const misaligned = conf.userDecisions.some(ud => ud.decision !== conf.accountDecision);

    return (
      <div
        draggable={isDraggable && isAdmin}
        onDragStart={isDraggable && isAdmin ? () => setDraggedId(conf.conferenceId) : undefined}
        onDragEnd={() => setDraggedId(null)}
        className={`rounded-lg border border-gray-100 bg-white shadow-sm p-3 space-y-2 transition-opacity ${draggedId === conf.conferenceId ? 'opacity-50' : ''} ${isDraggable && isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Title row */}
        <div>
          <p className="font-semibold text-sm text-gray-900 leading-tight">{conf.name}</p>
          <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
        </div>

        {/* Parlay score + tier */}
        {sd && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-2xl font-bold text-gray-900">
              {sd.calendarRecommendationScore != null ? Math.round(sd.calendarRecommendationScore) : '—'}
            </span>
            {ti && (
              <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ti.cls}`}>
                {ti.label}
              </span>
            )}
          </div>
        )}

        {/* Component chips */}
        {sd?.componentScores && (
          <div className="flex flex-wrap gap-1">
            <ScoreChip label="Aud. Fit" value={sd.componentScores.audienceFit} />
            <ScoreChip label="Target Opp" value={sd.componentScores.targetOpportunity} />
            <ScoreChip label="Engagement" value={sd.componentScores.engagementCapture} />
            <ScoreChip label="Commercial" value={sd.componentScores.commercialPotential} />
          </div>
        )}

        {/* Account decision pill */}
        {conf.accountDecision && (
          <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_PILL[conf.accountDecision]}`}>
            {conf.accountDecision.replace(/_/g, ' ')}
          </span>
        )}

        {/* Team opinions */}
        {conf.userDecisions.length > 0 && (
          <div className="space-y-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Team</p>
            {conf.userDecisions.map(ud => (
              <div key={ud.userId} className="flex items-center gap-1.5 text-xs">
                <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500 flex-shrink-0">
                  {ud.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="text-gray-600 truncate flex-1">{ud.displayName}</span>
                <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${DECISION_PILL[ud.decision]}`}>
                  {ud.decision.replace(/_/g, ' ')}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Alignment */}
        {conf.userDecisions.length > 0 && conf.accountDecision && (
          <p className={`text-[10px] font-semibold ${aligned ? 'text-emerald-600' : misaligned ? 'text-amber-600' : 'text-gray-400'}`}>
            {aligned ? '✓ Aligned' : '⚠ Discussion needed'}
          </p>
        )}

        {/* Notes button */}
        <button
          onClick={() => setNotesConferenceId(notesConferenceId === conf.conferenceId ? null : conf.conferenceId)}
          className={`text-[10px] font-semibold transition-colors ${notesConferenceId === conf.conferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
        >
          Notes →
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 relative">
      {/* Kanban columns + notes panel */}
      <div className="flex gap-4 h-[calc(100vh-280px)] relative">
        {COLUMNS.map(col => {
          const colConfs = decidedConferences.filter(c => c.accountDecision === col.id);
          return (
            <div
              key={col.id}
              className={`flex flex-col flex-1 min-w-[220px] rounded-xl border ${col.borderCls} bg-white overflow-hidden`}
              onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
              onDrop={isAdmin ? (e) => handleDrop(e, col.id) : undefined}
            >
              <div className={`px-4 py-3 flex items-center justify-between border-b ${col.borderCls} ${col.headerCls}`}>
                <span className="font-semibold text-sm">{col.label}</span>
                <span className="text-xs font-bold opacity-60">{colConfs.length}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {colConfs.length === 0 && (
                  <p className="text-xs text-gray-300 text-center py-6">No conferences</p>
                )}
                {colConfs.map(conf => (
                  <ConferenceCard key={conf.conferenceId} conf={conf} draggable />
                ))}
              </div>
            </div>
          );
        })}

        {/* Notes panel */}
        {notesConferenceId != null && (
          <div className="flex-shrink-0 self-stretch overflow-hidden rounded-xl border border-gray-200 shadow-lg">
            <CalendarNotesPanel
              conferenceId={notesConferenceId}
              onClose={() => setNotesConferenceId(null)}
            />
          </div>
        )}
      </div>

      {/* Awaiting Decision section */}
      {awaitingConferences.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-700">Awaiting Decision</span>
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{awaitingConferences.length}</span>
            <span className="text-xs text-gray-400">— No account decision has been set for these conferences.</span>
          </div>
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {awaitingConferences.map(conf => {
              const sd = scoreMap.get(conf.conferenceId);
              const ti = sd ? tierInfo(sd.recommendationTier) : null;
              return (
                <div key={conf.conferenceId} className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                  <div>
                    <p className="font-semibold text-sm text-gray-900 leading-tight">{conf.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
                  </div>

                  {sd && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xl font-bold text-gray-800">
                        {sd.calendarRecommendationScore != null ? Math.round(sd.calendarRecommendationScore) : '—'}
                      </span>
                      {ti && (
                        <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ti.cls}`}>
                          {ti.label}
                        </span>
                      )}
                    </div>
                  )}

                  {sd?.componentScores && (
                    <div className="flex flex-wrap gap-1">
                      <ScoreChip label="Aud. Fit" value={sd.componentScores.audienceFit} />
                      <ScoreChip label="Target Opp" value={sd.componentScores.targetOpportunity} />
                      <ScoreChip label="Engagement" value={sd.componentScores.engagementCapture} />
                      <ScoreChip label="Commercial" value={sd.componentScores.commercialPotential} />
                    </div>
                  )}

                  {/* Admin: set decision inline */}
                  {isAdmin && (
                    <div className="pt-1">
                      <p className="text-[9px] font-semibold text-gray-400 uppercase mb-1">Set decision</p>
                      <div className="flex flex-wrap gap-1">
                        {COLUMNS.map(col => (
                          <button
                            key={col.id}
                            onClick={() => void updateAccountDecision(conf.conferenceId, col.id)}
                            className={`px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-colors bg-white text-gray-600 border-gray-200 hover:border-gray-400`}
                          >
                            {col.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    onClick={() => setNotesConferenceId(notesConferenceId === conf.conferenceId ? null : conf.conferenceId)}
                    className={`text-[10px] font-semibold transition-colors ${notesConferenceId === conf.conferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
                  >
                    Notes →
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
