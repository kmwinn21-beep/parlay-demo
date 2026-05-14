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
  accountDecision: Decision;
  userDecisions: UserDecision[];
}

const COLUMNS: { id: Decision; label: string; headerCls: string; borderCls: string }[] = [
  { id: 'confirmed',        label: 'Confirmed',       headerCls: 'text-emerald-700 bg-emerald-50', borderCls: 'border-emerald-200' },
  { id: 'watching',         label: 'Watching',        headerCls: 'text-amber-700 bg-amber-50',     borderCls: 'border-amber-200' },
  { id: 'passed',           label: 'Passed',          headerCls: 'text-red-700 bg-red-50',         borderCls: 'border-red-200' },
  { id: 'pending_approval', label: 'Pending Approval',headerCls: 'text-blue-700 bg-blue-50',       borderCls: 'border-blue-200' },
];

const DECISION_PILL: Record<Decision, string> = {
  confirmed:        'bg-emerald-50 text-emerald-700 border-emerald-200',
  watching:         'bg-amber-50 text-amber-700 border-amber-200',
  passed:           'bg-red-50 text-red-700 border-red-200',
  pending_approval: 'bg-blue-50 text-blue-700 border-blue-200',
};

export function DecisionsBoard() {
  const { user } = useUser();
  const [conferences, setConferences] = useState<BoardConference[]>([]);
  const [loading, setLoading] = useState(true);
  const [notesConferenceId, setNotesConferenceId] = useState<number | null>(null);
  const [draggedId, setDraggedId] = useState<number | null>(null);
  const isAdmin = user?.role === 'administrator';

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/calendar-intelligence/decisions/board')
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((data: { conferences: BoardConference[] }) => setConferences(data.conferences ?? []))
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

  return (
    <div className="flex gap-4 h-[calc(100vh-220px)] relative">
      {/* Kanban columns */}
      {COLUMNS.map(col => {
        const colConfs = conferences.filter(c => c.accountDecision === col.id);
        return (
          <div
            key={col.id}
            className={`flex flex-col flex-1 min-w-[220px] rounded-xl border ${col.borderCls} bg-white overflow-hidden`}
            onDragOver={isAdmin ? (e) => e.preventDefault() : undefined}
            onDrop={isAdmin ? (e) => handleDrop(e, col.id) : undefined}
          >
            {/* Column header */}
            <div className={`px-4 py-3 flex items-center justify-between border-b ${col.borderCls} ${col.headerCls}`}>
              <span className="font-semibold text-sm">{col.label}</span>
              <span className="text-xs font-bold opacity-60">{colConfs.length}</span>
            </div>

            {/* Cards */}
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {colConfs.length === 0 && (
                <p className="text-xs text-gray-300 text-center py-6">No conferences</p>
              )}
              {colConfs.map(conf => {
                const aligned = conf.userDecisions.length > 0 && conf.userDecisions.every(ud => ud.decision === conf.accountDecision);
                const misaligned = conf.userDecisions.some(ud => ud.decision !== conf.accountDecision);
                return (
                  <div
                    key={conf.conferenceId}
                    draggable={isAdmin}
                    onDragStart={isAdmin ? () => setDraggedId(conf.conferenceId) : undefined}
                    onDragEnd={() => setDraggedId(null)}
                    className={`rounded-lg border border-gray-100 bg-white shadow-sm p-3 space-y-2 transition-opacity ${draggedId === conf.conferenceId ? 'opacity-50' : ''} ${isAdmin ? 'cursor-grab active:cursor-grabbing' : ''}`}
                  >
                    {/* Title */}
                    <div className="flex items-start justify-between gap-1">
                      <div>
                        <p className="font-semibold text-sm text-gray-900 leading-tight">{conf.name}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{conf.year} · {conf.attendeeCount} attendees</p>
                      </div>
                    </div>

                    {/* Account decision pill */}
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-semibold border ${DECISION_PILL[conf.accountDecision]}`}>
                      {col.label}
                    </span>

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

                    {/* Alignment status */}
                    {conf.userDecisions.length > 0 && (
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
              })}
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
  );
}
