'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { CalendarNotesPanel } from './calendar-intelligence/CalendarNotesPanel';

type DecisionKey = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

interface UserOpinion {
  userId: number;
  displayName: string;
  email: string;
  note: string | null;
  updatedAt: string;
}

interface ConferenceData {
  conferenceId: number;
  name: string;
  year: number;
  attendeeCount: number;
  noteCount: number;
  opinionsByDecision: Record<DecisionKey, UserOpinion[]>;
}

interface Props {
  conferenceId: number;
  conferenceName: string;
  onClose: () => void;
}

const DECISION_PILL: Record<DecisionKey, string> = {
  confirmed:         'bg-emerald-50 text-emerald-700 border-emerald-200',
  attend_but_reduce: 'bg-teal-50 text-teal-700 border-teal-200',
  watching:          'bg-amber-50 text-amber-700 border-amber-200',
  passed:            'bg-red-50 text-red-700 border-red-200',
  pending_approval:  'bg-blue-50 text-blue-700 border-blue-200',
};

const DECISION_LABEL: Record<DecisionKey, string> = {
  confirmed:         'Attend',
  attend_but_reduce: 'Attend (Reduced)',
  watching:          'On the Fence',
  passed:            "Don't Attend",
  pending_approval:  'Evaluating',
};

const DECISION_KEYS: DecisionKey[] = ['confirmed', 'attend_but_reduce', 'watching', 'passed', 'pending_approval'];

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function ConferenceInputPanel({ conferenceId, conferenceName, onClose }: Props) {
  const [data, setData] = useState<ConferenceData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setData(null);
    fetch(`/api/calendar-intelligence/decisions/board?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : { conferences: [] })
      .then((res: { conferences: ConferenceData[] }) => setData(res.conferences[0] ?? null))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [conferenceId]);

  const allOpinions = data
    ? DECISION_KEYS.flatMap(k =>
        data.opinionsByDecision[k].map(op => ({ ...op, decision: k as DecisionKey }))
      )
    : [];

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative flex flex-col w-full max-w-[400px] h-full bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-start justify-between px-5 py-4 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0 pr-3">
            <p className="font-semibold text-sm text-gray-900 leading-tight">{conferenceName}</p>
            <p className="text-xs text-gray-400 mt-0.5">Team input</p>
          </div>
          <button
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Team decisions */}
          <div className="px-5 py-4 space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Team decisions</p>

            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map(i => (
                  <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
                ))}
              </div>
            ) : allOpinions.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No team decisions yet</p>
            ) : (
              <div className="space-y-2">
                {allOpinions.map(op => (
                  <div key={op.userId} className="rounded-lg border border-gray-100 bg-gray-50 p-3">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                        {op.displayName.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-gray-800 flex-1 truncate">{op.displayName}</span>
                      <span className={`flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${DECISION_PILL[op.decision]}`}>
                        {DECISION_LABEL[op.decision]}
                      </span>
                    </div>
                    {op.note && (
                      <p className="text-xs text-gray-500 italic mt-1.5 pl-8">&ldquo;{op.note}&rdquo;</p>
                    )}
                    <p className="text-[10px] text-gray-400 mt-1 pl-8">{timeAgo(op.updatedAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes panel embedded below opinions */}
          <div className="border-t border-gray-100">
            <CalendarNotesPanel
              conferenceId={conferenceId}
              onClose={() => {}}
              variant="sidebar"
            />
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
