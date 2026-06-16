'use client';

import { useState, useEffect } from 'react';
import { CalendarNotesPanel } from './CalendarNotesPanel';
import { RequestInputDropdown } from '@/components/RequestInputDropdown';

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

export type ConferenceInputPanelProps = {
  conferenceId: number;
  conferenceName: string;
};

const DECISION_KEYS: DecisionKey[] = ['confirmed', 'attend_but_reduce', 'watching', 'passed', 'pending_approval'];

const DECISION_LABEL: Record<DecisionKey, string> = {
  confirmed:         'Attend',
  attend_but_reduce: 'Attend (Reduced)',
  watching:          'On the Fence',
  passed:            "Don't Attend",
  pending_approval:  'Evaluating',
};

const DECISION_COLOR: Record<DecisionKey, string> = {
  confirmed:         '#1D9E75',
  attend_but_reduce: '#085041',
  watching:          '#EF9F27',
  passed:            '#E24B4A',
  pending_approval:  '#185FA5',
};

function timeAgo(dateStr: string): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const d = Math.floor(diff / 86400000);
  if (d < 1) return 'today';
  if (d === 1) return '1d ago';
  if (d < 30) return `${d}d ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function TeamInputPanel({ conferenceId, conferenceName }: ConferenceInputPanelProps) {
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

  if (loading) {
    return (
      <div className="p-4 space-y-2">
        {[0, 1, 2].map(i => (
          <div key={i} className="h-14 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const allOpinions = data
    ? DECISION_KEYS.flatMap(k => data.opinionsByDecision[k].map(op => ({ ...op, decisionKey: k })))
    : [];

  if (allOpinions.length === 0) {
    return (
      <>
        <div style={{ padding: '24px 0', textAlign: 'center' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline-block' }}>
            <path d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm-7 4a3 3 0 100-6 3 3 0 000 6z" />
          </svg>
          <p style={{ fontSize: 12, color: 'var(--color-text-tertiary, #9ca3af)', marginTop: 8 }}>
            No team input yet.
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-tertiary, #9ca3af)' }}>
            Team members can log opinions in Calendar Intelligence.
          </p>
        </div>
        <div className="border-t border-gray-100">
          <CalendarNotesPanel conferenceId={conferenceId} onClose={() => {}} variant="sheet" />
        </div>
        <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', paddingTop: 12, marginTop: 8 }}>
          <RequestInputDropdown conferenceId={conferenceId} conferenceName={conferenceName} />
        </div>
      </>
    );
  }

  const groupCounts = Object.fromEntries(
    DECISION_KEYS.map(k => [k, data?.opinionsByDecision[k].length ?? 0])
  ) as Record<DecisionKey, number>;

  return (
    <div>
      {/* Proportional bar */}
      <div className="flex rounded-full overflow-hidden h-2 mb-3">
        {DECISION_KEYS.filter(k => groupCounts[k] > 0).map(k => (
          <div
            key={k}
            title={DECISION_LABEL[k]}
            style={{ flex: groupCounts[k], backgroundColor: DECISION_COLOR[k] }}
          />
        ))}
      </div>

      {/* Opinion count pills */}
      <div className="flex flex-wrap gap-1.5 mb-5">
        {DECISION_KEYS.filter(k => groupCounts[k] > 0).map(k => (
          <span
            key={k}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white"
            style={{ backgroundColor: DECISION_COLOR[k] }}
          >
            {DECISION_LABEL[k]}
            <span className="opacity-60">·</span>
            {groupCounts[k]}
          </span>
        ))}
      </div>

      {/* Opinions grouped by decision */}
      <div className="space-y-5 mb-2">
        {DECISION_KEYS.filter(k => groupCounts[k] > 0).map(k => {
          const color = DECISION_COLOR[k];
          const opinions = data!.opinionsByDecision[k];
          return (
            <div key={k}>
              <p className="text-[10px] font-bold uppercase tracking-wide mb-2" style={{ color }}>
                {DECISION_LABEL[k]} · {opinions.length}
              </p>
              {opinions.map(op => (
                <div
                  key={op.userId}
                  style={{ borderLeft: `2px solid ${color}`, paddingLeft: 10, marginBottom: 8 }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                      {op.displayName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 leading-tight truncate">{op.displayName}</p>
                      <p className="text-[10px] text-gray-400">{timeAgo(op.updatedAt)}</p>
                    </div>
                    <span
                      className="flex-shrink-0 px-1.5 py-0.5 rounded-full text-[9px] font-semibold text-white"
                      style={{ backgroundColor: color }}
                    >
                      {DECISION_LABEL[k]}
                    </span>
                  </div>
                  {op.note && (
                    <p className="text-xs text-gray-500 italic mt-1.5 bg-gray-50 rounded px-2 py-1.5">
                      &ldquo;{op.note}&rdquo;
                    </p>
                  )}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Discussion thread */}
      <div className="border-t border-gray-100 mt-2">
        <CalendarNotesPanel conferenceId={conferenceId} onClose={() => {}} variant="sheet" />
      </div>

      {/* Request input */}
      <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', paddingTop: 12, marginTop: 8 }}>
        <RequestInputDropdown conferenceId={conferenceId} conferenceName={conferenceName} />
      </div>
    </div>
  );
}
