'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarNotesPanel } from './CalendarNotesPanel';

type DecisionKey = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

interface UserOpinion {
  userId: number;
  displayName: string;
  email: string;
  note: string | null;
  updatedAt: string;
}

interface BoardConference {
  conferenceId: number;
  name: string;
  year: number;
  attendeeCount: number;
  noteCount: number;
  opinionsByDecision: Record<DecisionKey, UserOpinion[]>;
}

interface ScoreData {
  conferenceId: number;
  calendarRecommendationScore: number | null;
  recommendationTier: string;
  componentScores?: {
    audienceFit: number | null;
    targetOpportunity: number | null;
    commercialPotential: number | null;
    costJustification: number | null;
  };
}

interface Props {
  onOpenDrawer?: (conferenceId: number) => void;
  refreshKey?: number;
  scoredRows?: ScoreData[];
}

const COLUMNS: { id: DecisionKey; label: string; headerCls: string; borderCls: string }[] = [
  { id: 'confirmed',         label: 'Attend',              headerCls: 'text-emerald-700 bg-emerald-50', borderCls: 'border-emerald-200' },
  { id: 'attend_but_reduce', label: 'Attend (Reduced)',    headerCls: 'text-teal-700 bg-teal-50',       borderCls: 'border-teal-200' },
  { id: 'watching',          label: 'On the Fence',        headerCls: 'text-amber-700 bg-amber-50',     borderCls: 'border-amber-200' },
  { id: 'passed',            label: "Don't Attend",        headerCls: 'text-red-700 bg-red-50',         borderCls: 'border-red-200' },
  { id: 'pending_approval',  label: 'Actively Evaluating', headerCls: 'text-blue-700 bg-blue-50',       borderCls: 'border-blue-200' },
];

const DECISION_PILL: Record<DecisionKey, string> = {
  confirmed:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_but_reduce: 'bg-teal-50 text-teal-700 border-teal-200',
  watching:          'bg-amber-50 text-amber-700 border-amber-200',
  passed:            'bg-red-50 text-red-700 border-red-200',
  pending_approval:  'bg-blue-50 text-blue-700 border-blue-200',
};

const TIER_INFO: Record<string, { label: string; cls: string }> = {
  attend_invest_more:         { label: 'Attend & Invest',   cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  attend_maintain:            { label: 'Attend & Maintain', cls: 'bg-emerald-50 text-emerald-600 border-emerald-100' },
  attend_reconsider_format:   { label: 'Reconsider Format', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  evaluate_before_committing: { label: 'Evaluate First',    cls: 'bg-amber-50 text-amber-600 border-amber-100' },
  do_not_prioritize:          { label: 'Do Not Prioritize', cls: 'bg-red-50 text-red-600 border-red-100' },
  remove_from_calendar:       { label: 'Remove',            cls: 'bg-red-50 text-red-700 border-red-200' },
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

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function DecisionsBoard({ onOpenDrawer, refreshKey, scoredRows }: Props) {
  const [allConferences, setAllConferences] = useState<BoardConference[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState<number | null>(null);
  const [filteredConference, setFilteredConference] = useState<BoardConference | null>(null);
  const [loading, setLoading] = useState(true);
  const [notesConferenceId, setNotesConferenceId] = useState<number | null>(null);

  const scoreMap = useMemo(() => {
    const map = new Map<number, ScoreData>();
    for (const r of scoredRows ?? []) map.set(r.conferenceId, r);
    return map;
  }, [scoredRows]);

  const loadAll = useCallback(() => {
    setLoading(true);
    fetch('/api/calendar-intelligence/decisions/board')
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => setAllConferences(data.conferences ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadAll(); }, [loadAll, refreshKey]);

  useEffect(() => {
    if (selectedConferenceId == null) { setFilteredConference(null); return; }
    setFilteredConference(null);
    fetch(`/api/calendar-intelligence/decisions/board?conferenceId=${selectedConferenceId}`)
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => setFilteredConference(data.conferences[0] ?? null))
      .catch(() => {});
  }, [selectedConferenceId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-10 h-10 rounded-full border-2 border-brand-secondary/20 border-t-brand-secondary animate-spin" />
      </div>
    );
  }

  function ConferenceCard({ conf, colId }: { conf: BoardConference; colId: DecisionKey }) {
    const sd = scoreMap.get(conf.conferenceId);
    const ti = sd ? tierInfo(sd.recommendationTier) : null;
    const colOpinions = conf.opinionsByDecision[colId];

    return (
      <div className="rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden">
        <div className="p-3 space-y-2">
          <div>
            <p
              className={`font-semibold text-sm text-gray-900 leading-tight ${onOpenDrawer ? 'cursor-pointer hover:underline' : ''}`}
              onClick={() => onOpenDrawer?.(conf.conferenceId)}
            >{conf.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
          </div>

          {sd && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-2xl font-bold text-gray-900">
                {sd.calendarRecommendationScore != null ? Math.round(sd.calendarRecommendationScore) : '—'}
              </span>
              {ti && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ti.cls} ${onOpenDrawer ? 'cursor-pointer' : ''}`}
                  onClick={() => onOpenDrawer?.(conf.conferenceId)}
                >
                  {ti.label}
                </span>
              )}
            </div>
          )}

          {sd?.componentScores && (
            <div className="flex flex-wrap gap-1">
              <ScoreChip label="Aud. Fit" value={sd.componentScores.audienceFit} />
              <ScoreChip label="Target Opp" value={sd.componentScores.targetOpportunity} />
              <ScoreChip label="Cost Just." value={sd.componentScores.costJustification} />
              <ScoreChip label="Commercial" value={sd.componentScores.commercialPotential} />
            </div>
          )}

          {colOpinions.length > 0 && (
            <div className="space-y-1">
              {colOpinions.map(op => (
                <div key={op.userId} className="flex items-center gap-1.5 text-xs">
                  <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500 flex-shrink-0">
                    {op.displayName.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-gray-600 truncate flex-1">{op.displayName}</span>
                  {op.note && (
                    <span className="text-gray-400 truncate max-w-[80px] text-[10px]" title={op.note}>
                      &ldquo;{op.note}&rdquo;
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-3 py-2 border-t border-gray-50 flex justify-end">
          <button
            onClick={() => {
              setSelectedConferenceId(conf.conferenceId);
              setNotesConferenceId(conf.conferenceId);
            }}
            className="text-[10px] font-semibold text-gray-400 hover:text-gray-600 transition-colors"
          >
            View details →
          </button>
        </div>
      </div>
    );
  }

  function StakeholderCard({ opinion, colId }: { opinion: UserOpinion; colId: DecisionKey }) {
    return (
      <div className="rounded-lg border border-gray-100 bg-white shadow-sm p-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center text-[11px] font-bold text-gray-500 flex-shrink-0">
            {opinion.displayName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-900 truncate">{opinion.displayName}</p>
            <p className="text-[10px] text-gray-400 truncate">{opinion.email}</p>
          </div>
          <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${DECISION_PILL[colId]}`}>
            {colId === 'attend_but_reduce' ? 'Reduced' : colId === 'pending_approval' ? 'Evaluating' : colId === 'confirmed' ? 'Attend' : colId === 'watching' ? 'Fence' : "Don't Attend"}
          </span>
        </div>
        {opinion.note && (
          <p className="text-xs text-gray-600 italic">&ldquo;{opinion.note}&rdquo;</p>
        )}
        <p className="text-[10px] text-gray-400">{timeAgo(opinion.updatedAt)}</p>
      </div>
    );
  }

  const activeConference = selectedConferenceId != null ? filteredConference : null;

  return (
    <div className="flex flex-col gap-4 relative">
      {/* Conference selector + notes toggle */}
      <div className="flex items-center gap-3">
        <select
          value={selectedConferenceId ?? ''}
          onChange={e => {
            const val = e.target.value;
            setSelectedConferenceId(val ? Number(val) : null);
            setNotesConferenceId(null);
          }}
          className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-brand-secondary/30 max-w-sm"
        >
          <option value="">All conferences</option>
          {allConferences.map(c => (
            <option key={c.conferenceId} value={c.conferenceId}>
              {c.name} ({c.year})
            </option>
          ))}
        </select>

        {selectedConferenceId != null && (
          <>
            <button
              onClick={() => setNotesConferenceId(notesConferenceId === selectedConferenceId ? null : selectedConferenceId)}
              className={`text-sm font-semibold transition-colors whitespace-nowrap ${notesConferenceId === selectedConferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
            >
              {activeConference?.noteCount ? `Notes (${activeConference.noteCount})` : 'Notes'} →
            </button>
            <button
              onClick={() => { setSelectedConferenceId(null); setNotesConferenceId(null); }}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
            >
              ✕ Clear
            </button>
          </>
        )}
      </div>

      {/* Desktop Kanban */}
      <div className="hidden md:flex gap-3 h-[calc(100vh-320px)] relative">
        {COLUMNS.map(col => {
          const colCount = selectedConferenceId != null
            ? (filteredConference?.opinionsByDecision[col.id].length ?? 0)
            : allConferences.filter(c => c.opinionsByDecision[col.id].length > 0).length;

          return (
            <div
              key={col.id}
              className={`flex flex-col flex-1 min-w-[170px] rounded-xl border ${col.borderCls} bg-white overflow-hidden`}
            >
              <div className={`px-3 py-2.5 flex items-center justify-between border-b ${col.borderCls} ${col.headerCls}`}>
                <span className="font-semibold text-xs">{col.label}</span>
                <span className="text-xs font-bold opacity-60">{colCount}</span>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-2">
                {selectedConferenceId != null ? (
                  filteredConference == null ? (
                    <p className="text-xs text-gray-300 text-center py-6">Loading…</p>
                  ) : filteredConference.opinionsByDecision[col.id].length === 0 ? (
                    <p className="text-xs text-gray-300 text-center py-6">No opinions</p>
                  ) : (
                    filteredConference.opinionsByDecision[col.id].map(op => (
                      <StakeholderCard key={op.userId} opinion={op} colId={col.id} />
                    ))
                  )
                ) : (
                  (() => {
                    const colConfs = allConferences.filter(c => c.opinionsByDecision[col.id].length > 0);
                    return colConfs.length === 0
                      ? <p className="text-xs text-gray-300 text-center py-6">No conferences</p>
                      : colConfs.map(conf => <ConferenceCard key={conf.conferenceId} conf={conf} colId={col.id} />);
                  })()
                )}
              </div>
            </div>
          );
        })}

        {notesConferenceId != null && (
          <div className="flex-shrink-0 self-stretch overflow-hidden rounded-xl border border-gray-200 shadow-lg">
            <CalendarNotesPanel
              conferenceId={notesConferenceId}
              onClose={() => setNotesConferenceId(null)}
            />
          </div>
        )}
      </div>

      {/* Mobile grouped list */}
      <div className="md:hidden space-y-4">
        {COLUMNS.map(col => {
          if (selectedConferenceId != null) {
            const opinions = filteredConference?.opinionsByDecision[col.id] ?? [];
            if (opinions.length === 0) return null;
            return (
              <div key={col.id}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${col.headerCls}`}>{col.label}</span>
                  <span className="text-xs font-bold text-gray-400">{opinions.length}</span>
                </div>
                <div className="space-y-2">
                  {opinions.map(op => <StakeholderCard key={op.userId} opinion={op} colId={col.id} />)}
                </div>
              </div>
            );
          }

          const colConfs = allConferences.filter(c => c.opinionsByDecision[col.id].length > 0);
          if (colConfs.length === 0) return null;
          return (
            <div key={col.id}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${col.headerCls}`}>{col.label}</span>
                <span className="text-xs font-bold text-gray-400">{colConfs.length}</span>
              </div>
              <div className="space-y-2">
                {colConfs.map(conf => <ConferenceCard key={conf.conferenceId} conf={conf} colId={col.id} />)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Mobile notes bottom sheet */}
      {notesConferenceId != null && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setNotesConferenceId(null)}>
          <div
            className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-2xl flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <CalendarNotesPanel conferenceId={notesConferenceId} onClose={() => setNotesConferenceId(null)} variant="sheet" />
          </div>
        </div>
      )}
    </div>
  );
}
