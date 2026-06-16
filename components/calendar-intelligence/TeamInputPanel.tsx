'use client';

import { useState, useEffect } from 'react';
import { CalendarNotesPanel } from './CalendarNotesPanel';
import { RequestInputForm } from '@/components/RequestInputDropdown';
import { useUser } from '@/components/UserContext';

type DecisionKey = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

interface UserOpinion {
  userId: number;
  displayName: string;
  email: string;
  note: string | null;
  updatedAt: string;
  isGuest?: boolean;
}

interface ConferenceData {
  conferenceId: number;
  name: string;
  year: number;
  attendeeCount: number;
  noteCount: number;
  opinionsByDecision: Record<DecisionKey, UserOpinion[]>;
}

interface PendingRequest {
  id: number;
  recipientEmail: string;
  recipientName: string;
  recipientTitle: string | null;
  recipientUserId: number | null;
  status: 'pending' | 'responded' | 'expired';
  createdAt: string;
  expiresAt: string | null;
}

export type ConferenceInputPanelProps = {
  conferenceId: number;
  conferenceName: string;
  requestFormOpen?: boolean;
  onRequestFormChange?: (open: boolean) => void;
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

function daysRemaining(expiresAt: string | null): number | null {
  if (!expiresAt) return null;
  const diff = new Date(expiresAt).getTime() - Date.now();
  return Math.ceil(diff / 86400000);
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dy = String(d.getUTCDate()).padStart(2, '0');
  const yr = String(d.getUTCFullYear()).slice(-2);
  return `${mo}/${dy}/${yr}`;
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

function AwaitingInputSection({ pendingRequests }: { pendingRequests: PendingRequest[] }) {
  const pending = pendingRequests.filter(r => r.status === 'pending');
  if (pending.length === 0) return null;

  return (
    <div style={{ borderTop: '0.5px solid var(--color-border-tertiary, #e5e7eb)', paddingTop: 10, marginTop: 8, marginBottom: 4 }}>
      <p style={{
        fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
        letterSpacing: '.06em', color: '#9ca3af', marginBottom: 8,
      }}>
        Awaiting Input · {pending.length}
      </p>
      {pending.map(r => {
        const days = daysRemaining(r.expiresAt);
        const pillColor = days == null ? '#9ca3af'
          : days >= 5 ? '#059669'
          : days >= 3 ? '#d97706'
          : '#dc2626';
        const pillBg = days == null ? '#f3f4f6'
          : days >= 5 ? '#d1fae5'
          : days >= 3 ? '#fef3c7'
          : '#fee2e2';
        return (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}>
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              background: '#e5e7eb', display: 'flex', alignItems: 'center',
              justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#6b7280',
            }}>
              {r.recipientName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 11, margin: 0, fontWeight: 500, color: '#1a1a1a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {r.recipientName}
              </p>
              <p style={{ fontSize: 10, margin: 0, color: '#9ca3af' }}>Sent {fmtDate(r.createdAt)}</p>
            </div>
            {days != null && (
              <span style={{
                fontSize: 9, fontWeight: 600, padding: '2px 6px', borderRadius: 20,
                background: pillBg, color: pillColor, flexShrink: 0, whiteSpace: 'nowrap',
              }}>
                {days <= 0 ? 'Due today' : `${days}d left`}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

interface EditModalProps {
  fromKey: DecisionKey;
  fromOpinion: UserOpinion;
  conferenceId: number;
  onSave: (newKey: DecisionKey) => Promise<void>;
  onClose: () => void;
}

function EditDecisionModal({ fromKey, fromOpinion, conferenceId, onSave, onClose }: EditModalProps) {
  const [selected, setSelected] = useState<DecisionKey>(fromKey);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    await onSave(selected);
    setSaving(false);
  };

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.45)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '16px',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 360,
        boxShadow: '0 8px 40px rgba(0,0,0,.2)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ background: 'rgb(var(--brand-primary-rgb, 11 60 98))', padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ margin: 0, fontSize: 10, color: 'rgba(255,255,255,.6)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.08em' }}>Update Input</p>
            <p style={{ margin: '2px 0 0', fontSize: 13, color: '#fff', fontWeight: 600 }}>{fromOpinion.displayName}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.7)', cursor: 'pointer', padding: 4 }}>
            <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div style={{ padding: '16px 20px 20px' }}>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: '#6b7280' }}>
            Currently: <strong style={{ color: DECISION_COLOR[fromKey] }}>{DECISION_LABEL[fromKey]}</strong>. Select your new recommendation:
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DECISION_KEYS.map(k => {
              const isSelected = selected === k;
              const color = DECISION_COLOR[k];
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setSelected(k)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '9px 14px', borderRadius: 7, border: `1.5px solid ${color}`,
                    background: isSelected ? color : color + '12',
                    color: isSelected ? '#fff' : color,
                    fontWeight: 600, fontSize: 12, cursor: 'pointer',
                    transition: 'background .1s ease, color .1s ease',
                    textAlign: 'left',
                  }}
                >
                  {isSelected && (
                    <svg width="13" height="13" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <polyline points="20 6 9 17 4 12" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {!isSelected && <span style={{ width: 13, display: 'inline-block' }} />}
                  {DECISION_LABEL[k]}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || selected === fromKey}
              style={{
                flex: 1, padding: '8px 16px', borderRadius: 7,
                background: selected !== fromKey ? DECISION_COLOR[selected] : '#e5e7eb',
                color: selected !== fromKey ? '#fff' : '#9ca3af',
                border: 'none', fontWeight: 600, fontSize: 12, cursor: selected !== fromKey && !saving ? 'pointer' : 'not-allowed',
                transition: 'background .15s',
              }}
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 7,
                background: 'none', border: '1px solid #e5e7eb',
                color: '#6b7280', fontSize: 12, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TeamInputPanel({
  conferenceId,
  conferenceName,
  requestFormOpen: requestFormOpenProp,
  onRequestFormChange,
}: ConferenceInputPanelProps) {
  const { user } = useUser();
  const currentUserEmail = user?.email ?? '';

  const [data, setData] = useState<ConferenceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  // Form open state — controlled externally if prop provided, otherwise internal
  const [formOpenInternal, setFormOpenInternal] = useState(false);
  const formOpen = requestFormOpenProp ?? formOpenInternal;
  const setFormOpen = (v: boolean) => {
    if (onRequestFormChange) onRequestFormChange(v);
    else setFormOpenInternal(v);
  };

  // Edit decision state
  const [editTarget, setEditTarget] = useState<{ fromKey: DecisionKey; op: UserOpinion } | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    Promise.all([
      fetch(`/api/calendar-intelligence/decisions/board?conferenceId=${conferenceId}`)
        .then(r => r.ok ? r.json() : { conferences: [] })
        .then((res: { conferences: ConferenceData[] }) => res.conferences[0] ?? null)
        .catch(() => null),
      fetch(`/api/calendar-intelligence/request-input?conferenceId=${conferenceId}`)
        .then(r => r.ok ? r.json() : { requests: [] })
        .then((res: { requests: PendingRequest[] }) => res.requests ?? [])
        .catch(() => [] as PendingRequest[]),
    ]).then(([boardData, requests]) => {
      setData(boardData);
      setPendingRequests(requests);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId]);

  // Re-fetch pending requests when form is sent
  const handleSent = () => {
    fetch(`/api/calendar-intelligence/request-input?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : { requests: [] })
      .then((res: { requests: PendingRequest[] }) => setPendingRequests(res.requests ?? []))
      .catch(() => {});
  };

  const handleEditSave = async (newKey: DecisionKey) => {
    if (!editTarget) return;
    const { fromKey, op } = editTarget;
    if (newKey === fromKey) { setEditTarget(null); return; }

    // Optimistically update UI
    setData(prev => {
      if (!prev) return prev;
      const next = { ...prev, opinionsByDecision: { ...prev.opinionsByDecision } };
      // Remove from old bucket
      next.opinionsByDecision[fromKey] = next.opinionsByDecision[fromKey].filter(o => o.userId !== op.userId);
      // Add to new bucket with fresh timestamp
      next.opinionsByDecision[newKey] = [
        ...next.opinionsByDecision[newKey],
        { ...op, updatedAt: new Date().toISOString() },
      ];
      return next;
    });

    setEditTarget(null);

    // Persist
    await fetch('/api/calendar-intelligence/decisions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conferenceId, decision: newKey, level: 'user' }),
    }).catch(() => {});

    // Auto-comment
    const msg = `Changed input from ${DECISION_LABEL[fromKey]} to ${DECISION_LABEL[newKey]} (system generated)`;
    await fetch('/api/calendar-intelligence/notes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conferenceId, content: msg }),
    }).catch(() => {});
  };

  const requestFormSection = (
    <div style={{
      overflow: 'hidden',
      maxHeight: formOpen ? 600 : 0,
      opacity: formOpen ? 1 : 0,
      transition: 'max-height 250ms ease, opacity 180ms ease',
    }}>
      <p style={{
        fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase',
        color: 'rgb(var(--brand-secondary-rgb, 27 118 188))', marginBottom: 6, marginTop: 2,
      }}>
        Request Input
      </p>
      <div style={{
        background: 'rgb(var(--brand-secondary-rgb, 27 118 188) / 0.05)',
        padding: '4px 12px 14px',
        borderRadius: 8,
        marginBottom: 8,
        border: '0.5px solid rgb(var(--brand-secondary-rgb, 27 118 188) / 0.15)',
      }}>
        <RequestInputForm
          conferenceId={conferenceId}
          conferenceName={conferenceName}
          onSent={() => { handleSent(); setFormOpen(false); }}
        />
      </div>
    </div>
  );

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
        {requestFormSection}
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
        <AwaitingInputSection pendingRequests={pendingRequests} />
        <div className="border-t border-gray-100">
          <CalendarNotesPanel conferenceId={conferenceId} onClose={() => {}} variant="sheet" />
        </div>
        {editTarget && (
          <EditDecisionModal
            fromKey={editTarget.fromKey}
            fromOpinion={editTarget.op}
            conferenceId={conferenceId}
            onSave={handleEditSave}
            onClose={() => setEditTarget(null)}
          />
        )}
      </>
    );
  }

  const groupCounts = Object.fromEntries(
    DECISION_KEYS.map(k => [k, data?.opinionsByDecision[k].length ?? 0])
  ) as Record<DecisionKey, number>;

  return (
    <div>
      {/* Inline request form — animates open/closed */}
      {requestFormSection}

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
              {opinions.map(op => {
                const isCurrentUser = !op.isGuest && op.email === currentUserEmail;
                return (
                  <div
                    key={op.userId}
                    style={{ borderLeft: `2px solid ${color}`, paddingLeft: 10, marginBottom: 8 }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="w-6 h-6 rounded-full bg-gray-200 flex items-center justify-center text-[10px] font-bold text-gray-500 flex-shrink-0">
                        {op.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <p className="text-sm font-medium text-gray-800 leading-tight truncate">{op.displayName}</p>
                          {op.isGuest && (
                            <span style={{ fontSize: 9, fontWeight: 600, color: '#6b7280', background: '#f3f4f6', borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
                              External
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-gray-400">{timeAgo(op.updatedAt)}</p>
                      </div>
                      {/* Edit button for current user's opinion — left of the pill */}
                      {isCurrentUser && (
                        <button
                          type="button"
                          onClick={() => setEditTarget({ fromKey: k, op })}
                          title="Change your input"
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '2px 6px', borderRadius: 5, fontSize: 9, fontWeight: 600,
                            border: `1px solid ${color}`, background: color + '18',
                            color, cursor: 'pointer', flexShrink: 0,
                          }}
                        >
                          <svg width="9" height="9" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                          Edit
                        </button>
                      )}
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
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Awaiting input */}
      <AwaitingInputSection pendingRequests={pendingRequests} />

      {/* Discussion thread */}
      <div className="border-t border-gray-100 mt-2">
        <CalendarNotesPanel conferenceId={conferenceId} onClose={() => {}} variant="sheet" />
      </div>

      {/* Edit decision modal */}
      {editTarget && (
        <EditDecisionModal
          fromKey={editTarget.fromKey}
          fromOpinion={editTarget.op}
          conferenceId={conferenceId}
          onSave={handleEditSave}
          onClose={() => setEditTarget(null)}
        />
      )}
    </div>
  );
}
