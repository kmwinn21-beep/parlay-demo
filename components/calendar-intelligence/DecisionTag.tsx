'use client';

import { useState, useEffect } from 'react';

type Decision = 'confirmed' | 'attend_but_reduce' | 'watching' | 'passed' | 'pending_approval';

interface Props {
  conferenceId: number;
  syncKey?: number;
  onDecisionChanged?: () => void;
  disabled?: boolean;
}

const DECISIONS: { value: Decision; label: string; activeCls: string }[] = [
  { value: 'pending_approval',  label: 'Evaluating',       activeCls: 'bg-blue-600 text-white border-blue-600' },
  { value: 'watching',          label: 'On the Fence',     activeCls: 'bg-amber-500 text-white border-amber-500' },
  { value: 'attend_but_reduce', label: 'Attend (Reduced)', activeCls: 'bg-teal-600 text-white border-teal-600' },
  { value: 'confirmed',         label: 'Attend',           activeCls: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'passed',            label: "Don't Attend",     activeCls: 'bg-red-600 text-white border-red-600' },
];

const ghostCls = 'bg-white text-gray-600 border-gray-200 hover:border-gray-400';

export function DecisionTag({ conferenceId, syncKey, onDecisionChanged, disabled = false }: Props) {
  const [userDecision, setUserDecision] = useState<Decision | null>(null);
  const [noteText, setNoteText] = useState('');
  const [posting, setPosting] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/calendar-intelligence/decisions?conferenceId=${conferenceId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { user?: { decision: string } | null } | null) => {
        if (data) setUserDecision((data.user?.decision as Decision) ?? null);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conferenceId, syncKey]);

  const selectUserDecision = async (d: Decision) => {
    if (disabled) return;
    const newVal = userDecision === d ? null : d;
    setUserDecision(newVal);
    if (!newVal) {
      await fetch('/api/calendar-intelligence/decisions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId, level: 'user' }),
      });
      onDecisionChanged?.();
      return;
    }
    await fetch('/api/calendar-intelligence/decisions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conferenceId, decision: newVal, level: 'user' }),
    });
    onDecisionChanged?.();
  };

  const handlePostNote = async () => {
    if (!noteText.trim()) return;
    setPosting(true);
    try {
      await fetch('/api/calendar-intelligence/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conferenceId, content: noteText.trim() }),
      });
      setNoteText('');
    } finally {
      setPosting(false);
    }
  };

  if (loading) return <div className="h-8 bg-gray-100 animate-pulse rounded-lg" />;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">My Decision</p>
        <div className={`flex flex-wrap gap-1.5 ${disabled ? 'opacity-60 pointer-events-none' : ''}`}>
          {DECISIONS.map(d => (
            <button
              key={d.value}
              onClick={() => selectUserDecision(d.value)}
              className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${userDecision === d.value ? d.activeCls : ghostCls}`}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>

      {userDecision && !disabled && (
        <div className="space-y-1.5">
          <textarea
            rows={2}
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Add a note about this decision…"
            className="input-field text-sm w-full resize-none"
          />
          <button
            onClick={handlePostNote}
            disabled={posting || !noteText.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            {posting ? 'Posting…' : 'Post Note'}
          </button>
        </div>
      )}
    </div>
  );
}
