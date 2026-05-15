'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
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
  noteCount?: number;
  userDecisions: UserDecision[];
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

const COLUMNS: { id: Decision; label: string; headerCls: string; borderCls: string }[] = [
  { id: 'confirmed',        label: 'Attend',              headerCls: 'text-emerald-700 bg-emerald-50', borderCls: 'border-emerald-200' },
  { id: 'watching',         label: 'On the Fence',        headerCls: 'text-amber-700 bg-amber-50',     borderCls: 'border-amber-200' },
  { id: 'passed',           label: "Don't Attend",        headerCls: 'text-red-700 bg-red-50',         borderCls: 'border-red-200' },
  { id: 'pending_approval', label: 'Actively Evaluating', headerCls: 'text-blue-700 bg-blue-50',       borderCls: 'border-blue-200' },
];

const DECISION_PILL: Record<Decision, string> = {
  confirmed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  watching:         'bg-amber-50 text-amber-700 border-amber-200',
  passed:           'bg-red-50 text-red-700 border-red-200',
  pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
};
const DECISION_LABEL: Record<Decision, string> = {
  confirmed: 'Attend',
  watching: 'On the Fence',
  passed: "Don't Attend",
  pending_approval: 'Evaluating',
};
const DECISION_BUTTON_ORDER: Decision[] = ['pending_approval', 'watching', 'passed', 'confirmed'];

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

export function DecisionsBoard({ onOpenDrawer, refreshKey, scoredRows }: Props) {
  const { user } = useUser();
  const [conferences, setConferences] = useState<BoardConference[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesConferenceId, setNotesConferenceId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const [mobilePicker, setMobilePicker] = useState<number | null>(null);
  const isAdmin = user?.role === 'administrator';

  // Build score map from the parent's already-scored rows (uses full scoring engine results)
  const scoreMap = useMemo(() => {
    const map = new Map<number, ScoreData>();
    for (const r of scoredRows ?? []) map.set(r.conferenceId, r);
    return map;
  }, [scoredRows]);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/calendar-intelligence/decisions/board')
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => {
        setConferences(data.conferences ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load, refreshKey]);

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

  const decidedConferences = conferences.filter(c => c.accountDecision != null || c.userDecisions.length > 0);
  const awaitingConferences = conferences.filter(c => c.accountDecision == null && c.userDecisions.length === 0);

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
        className={`rounded-lg border border-gray-100 bg-white shadow-sm overflow-hidden transition-opacity ${draggedId === conf.conferenceId ? 'opacity-50' : ''} ${isDraggable && isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
      >
        {/* Card body */}
        <div className="p-3 space-y-2">
          {/* Title row — clickable to open drawer */}
          <div>
            <p
              className={`font-semibold text-sm text-gray-900 leading-tight ${onOpenDrawer ? 'cursor-pointer hover:underline' : ''}`}
              onClick={() => onOpenDrawer?.(conf.conferenceId)}
            >{conf.name}</p>
            <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
          </div>

          {/* Parlay score + tier — tier pill clickable to open drawer */}
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

          {/* Component chips */}
          {sd?.componentScores && (
            <div className="flex flex-wrap gap-1">
              <ScoreChip label="Aud. Fit" value={sd.componentScores.audienceFit} />
              <ScoreChip label="Target Opp" value={sd.componentScores.targetOpportunity} />
              <ScoreChip label="Cost Just." value={sd.componentScores.costJustification} />
              <ScoreChip label="Commercial" value={sd.componentScores.commercialPotential} />
            </div>
          )}

          {/* Account decision pill */}
          {conf.accountDecision && (
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_PILL[conf.accountDecision]}`}>
              {DECISION_LABEL[conf.accountDecision]}
            </span>
          )}
          {!conf.accountDecision && conf.userDecisions.length > 0 && (
            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 bg-gray-50 text-gray-500">
              No team decision set
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
                    {DECISION_LABEL[ud.decision]}
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
        </div>
        {/* Footer with Notes button */}
        <div className="px-3 py-2 border-t border-gray-50 flex justify-end">
          <button
            onClick={(e) => { e.stopPropagation(); setNotesConferenceId(notesConferenceId === conf.conferenceId ? null : conf.conferenceId); }}
            className={`text-[10px] font-semibold transition-colors ${notesConferenceId === conf.conferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {conf.noteCount ? `Notes (${conf.noteCount})` : 'Notes'} →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 relative">
      {/* Mobile grouped list */}
      <div className="md:hidden space-y-4">
        {[...COLUMNS.map(col => ({
          id: col.id, label: col.label, headerCls: col.headerCls, borderCls: col.borderCls,
          confs: decidedConferences.filter(c => (c.accountDecision ?? 'pending_approval') === col.id),
        })).filter(g => g.confs.length > 0),
        ...(awaitingConferences.length > 0 ? [{ id: 'awaiting' as const, label: 'Awaiting Decision', headerCls: 'text-gray-700 bg-gray-100', borderCls: 'border-gray-200', confs: awaitingConferences }] : []),
        ].map(group => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-2 px-1">
              <span className={`inline-flex px-3 py-1 rounded-lg text-sm font-semibold ${group.headerCls}`}>{group.label}</span>
              <span className="text-xs font-bold text-gray-400">{group.confs.length}</span>
            </div>
            <div className="space-y-2">
              {group.confs.map(conf => {
                const sd = scoreMap.get(conf.conferenceId);
                const ti = sd ? tierInfo(sd.recommendationTier) : null;
                const aligned = conf.userDecisions.length > 0 && conf.userDecisions.every(ud => ud.decision === conf.accountDecision);
                const misaligned = conf.userDecisions.some(ud => ud.decision !== conf.accountDecision);
                const pickerOpen = mobilePicker === conf.conferenceId;
                return (
                  <div key={conf.conferenceId} className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
                    <div className="p-3 space-y-2">
                      <div>
                        <p className={`font-semibold text-sm text-gray-900 leading-tight ${onOpenDrawer ? 'cursor-pointer hover:underline' : ''}`} onClick={() => onOpenDrawer?.(conf.conferenceId)}>{conf.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
                      </div>
                      {sd && (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-2xl font-bold text-gray-900">{sd.calendarRecommendationScore != null ? Math.round(sd.calendarRecommendationScore) : '—'}</span>
                          {ti && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold border ${ti.cls} ${onOpenDrawer ? 'cursor-pointer' : ''}`} onClick={() => onOpenDrawer?.(conf.conferenceId)}>{ti.label}</span>}
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
                      <div>
                        {conf.accountDecision ? (
                          isAdmin ? (
                            <button onClick={() => setMobilePicker(pickerOpen ? null : conf.conferenceId)} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_PILL[conf.accountDecision]}`}>
                              {DECISION_LABEL[conf.accountDecision]}
                              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                            </button>
                          ) : (
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_PILL[conf.accountDecision]}`}>{DECISION_LABEL[conf.accountDecision]}</span>
                          )
                        ) : isAdmin ? (
                          <button onClick={() => setMobilePicker(pickerOpen ? null : conf.conferenceId)} className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 border border-dashed border-gray-300 px-2 py-0.5 rounded-full">
                            Set decision
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/></svg>
                          </button>
                        ) : null}
                        {!conf.accountDecision && conf.userDecisions.length > 0 && (
                          <div className="mt-1">
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[10px] font-medium border border-gray-200 bg-gray-50 text-gray-500">
                              No team decision set
                            </span>
                          </div>
                        )}
                        {pickerOpen && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {DECISION_BUTTON_ORDER.map(decision => {
                              const col = COLUMNS.find(c => c.id === decision)!;
                              return (
                                <button key={col.id} onClick={() => { void updateAccountDecision(conf.conferenceId, col.id); setMobilePicker(null); }} className={`px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${conf.accountDecision === col.id ? DECISION_PILL[col.id] : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'}`}>
                                  {col.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      {conf.userDecisions.length > 0 && (
                        <div className="space-y-1">
                          <p className="text-[10px] font-semibold text-gray-400 uppercase">Team</p>
                          {conf.userDecisions.map(ud => (
                            <div key={ud.userId} className="flex items-center gap-1.5 text-xs">
                              <div className="w-4 h-4 rounded-full bg-gray-200 flex items-center justify-center text-[9px] font-bold text-gray-500 flex-shrink-0">{ud.displayName.charAt(0).toUpperCase()}</div>
                              <span className="text-gray-600 truncate flex-1">{ud.displayName}</span>
                              <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${DECISION_PILL[ud.decision]}`}>{DECISION_LABEL[ud.decision]}</span>
                            </div>
                          ))}
                        </div>
                      )}
                      {conf.userDecisions.length > 0 && conf.accountDecision && (
                        <p className={`text-[10px] font-semibold ${aligned ? 'text-emerald-600' : misaligned ? 'text-amber-600' : 'text-gray-400'}`}>
                          {aligned ? '✓ Aligned' : '⚠ Discussion needed'}
                        </p>
                      )}
                    </div>
                    <div className="px-3 py-2 border-t border-gray-50 flex justify-end">
                      <button onClick={() => setNotesConferenceId(notesConferenceId === conf.conferenceId ? null : conf.conferenceId)} className={`text-[10px] font-semibold transition-colors ${notesConferenceId === conf.conferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}>
                        {conf.noteCount ? `Notes (${conf.noteCount})` : 'Notes'} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* Mobile notes bottom sheet */}
      {notesConferenceId != null && (
        <div className="md:hidden fixed inset-0 z-50 bg-black/50" onClick={() => setNotesConferenceId(null)}>
          <div className="absolute bottom-0 left-0 right-0 max-h-[90vh] bg-white rounded-t-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <CalendarNotesPanel conferenceId={notesConferenceId} onClose={() => setNotesConferenceId(null)} variant="sheet" />
          </div>
        </div>
      )}

      {/* Desktop Kanban columns + notes panel */}
      <div className="hidden md:flex gap-4 h-[calc(100vh-280px)] relative">
        {COLUMNS.map(col => {
          const colConfs = decidedConferences.filter(c => (c.accountDecision ?? 'pending_approval') === col.id);
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
          <div className="hidden md:flex flex-shrink-0 self-stretch overflow-hidden rounded-xl border border-gray-200 shadow-lg">
            <CalendarNotesPanel
              conferenceId={notesConferenceId}
              onClose={() => setNotesConferenceId(null)}
            />
          </div>
        )}
      </div>

      {/* Awaiting Decision section — desktop only (mobile shows in grouped list above) */}
      {awaitingConferences.length > 0 && (
        <div className="hidden md:block rounded-xl border border-gray-200 bg-white overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="font-semibold text-sm text-gray-700">Awaiting Decision</span>
            <span className="text-xs font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">{awaitingConferences.length}</span>
            <span className="text-xs text-gray-400">— No account decision and no individual decisions have been set for these conferences.</span>
          </div>
          <div className="p-3 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {awaitingConferences.map(conf => {
              const sd = scoreMap.get(conf.conferenceId);
              const ti = sd ? tierInfo(sd.recommendationTier) : null;
              return (
                <div
                  key={conf.conferenceId}
                  className="rounded-lg border border-gray-100 bg-gray-50 overflow-hidden"
                >
                  {/* Clickable area */}
                  <div
                    className={`p-3 space-y-2 ${onOpenDrawer ? 'cursor-pointer hover:bg-gray-100 transition-colors' : ''}`}
                    onClick={() => onOpenDrawer?.(conf.conferenceId)}
                  >
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
                        <ScoreChip label="Cost Just." value={sd.componentScores.costJustification} />
                        <ScoreChip label="Commercial" value={sd.componentScores.commercialPotential} />
                      </div>
                    )}

                    {/* Admin: set decision inline */}
                    {isAdmin && (
                      <div className="pt-1">
                        <p className="text-[9px] font-semibold text-gray-400 uppercase mb-1">Set decision</p>
                        <div className="flex flex-wrap gap-1">
                          {DECISION_BUTTON_ORDER.map(decision => {
                            const col = COLUMNS.find(c => c.id === decision)!;
                            return (
                              <button
                                key={col.id}
                                onClick={(e) => { e.stopPropagation(); void updateAccountDecision(conf.conferenceId, col.id); }}
                                className="px-2 py-0.5 rounded-full text-[9px] font-semibold border transition-colors bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                              >
                                {col.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                  {/* Footer with Notes button */}
                  <div className="px-3 py-2 border-t border-gray-100 flex justify-end">
                    <button
                      onClick={(e) => { e.stopPropagation(); setNotesConferenceId(notesConferenceId === conf.conferenceId ? null : conf.conferenceId); }}
                      className={`text-[10px] font-semibold transition-colors ${notesConferenceId === conf.conferenceId ? 'text-brand-secondary' : 'text-gray-400 hover:text-gray-600'}`}
                    >
                      {conf.noteCount ? `Notes (${conf.noteCount})` : 'Notes'} →
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
