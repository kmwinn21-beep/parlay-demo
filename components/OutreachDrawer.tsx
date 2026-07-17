'use client';

import { useEffect, useState } from 'react';

interface TimelineActivity {
  id: number;
  activityType: 'phone' | 'email' | 'linkedin';
  loggedByName: string;
  attendeeName: string | null;
  notes: string | null;
  loggedAt: string;
}

interface ThreadNote {
  id: number;
  body: string;
  userName: string;
  userInitials: string;
  createdAt: string;
}

const DOT_COLOR: Record<TimelineActivity['activityType'], string> = {
  phone: 'bg-green-500',
  email: 'bg-blue-500',
  linkedin: 'bg-purple-500',
};

const ACTIVITY_LABEL: Record<TimelineActivity['activityType'], string> = {
  phone: 'Phone call',
  email: 'Email',
  linkedin: 'LinkedIn touch',
};

function relativeTime(iso: string): string {
  const d = new Date(iso.includes('Z') || iso.includes('+') ? iso : iso + 'Z');
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays <= 0) return 'today';
  if (diffDays === 1) return 'yesterday';
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'short' });
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function OutreachDrawer({
  conferenceId,
  companyId,
  companyName,
  initialTab = 'timeline',
  onClose,
}: {
  conferenceId: number;
  companyId: number;
  companyName: string;
  initialTab?: 'timeline' | 'notes';
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'timeline' | 'notes'>(initialTab);
  const [activities, setActivities] = useState<TimelineActivity[] | null>(null);
  const [notes, setNotes] = useState<ThreadNote[] | null>(null);
  const [noteDraft, setNoteDraft] = useState('');
  const [posting, setPosting] = useState(false);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab, companyId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/timeline`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { if (!cancelled) setActivities(data.activities); })
      .catch(() => { if (!cancelled) setActivities([]); });
    return () => { cancelled = true; };
  }, [conferenceId, companyId]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/notes`)
      .then(r => (r.ok ? r.json() : Promise.reject()))
      .then(data => { if (!cancelled) setNotes(data.notes); })
      .catch(() => { if (!cancelled) setNotes([]); });
    return () => { cancelled = true; };
  }, [conferenceId, companyId]);

  const handlePostNote = async () => {
    const body = noteDraft.trim();
    if (!body || posting) return;
    setPosting(true);
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/outreach/${companyId}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as ThreadNote;
      setNotes(prev => [...(prev ?? []), created]);
      setNoteDraft('');
    } catch {
      // best-effort — leave the draft text so the user can retry
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className="border border-gray-200 rounded-xl bg-white overflow-hidden sticky top-4 flex flex-col max-h-[calc(100vh-6rem)]">
      <div className="flex items-center justify-between gap-2 px-3 py-2.5 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-700 truncate">{companyName}</p>
        <button type="button" onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>

      <div className="flex border-b border-gray-100 flex-shrink-0">
        {(['timeline', 'notes'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 py-2 text-xs font-medium capitalize transition-colors border-b-2 ${
              tab === t ? 'border-brand-secondary text-brand-secondary' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {tab === 'timeline' && (
          <div className="p-3">
            {activities === null && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {activities !== null && activities.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-xs text-gray-400">No outreach logged yet.</p>
              </div>
            )}
            {activities !== null && activities.length > 0 && (
              <div className="space-y-0">
                {activities.map((a, idx) => (
                  <div key={a.id} className="flex gap-2.5">
                    <div className="flex flex-col items-center flex-shrink-0">
                      <div className={`w-2.5 h-2.5 rounded-full mt-1 ${DOT_COLOR[a.activityType]}`} />
                      {idx < activities.length - 1 && <div className="w-px flex-1 bg-gray-200 my-0.5" />}
                    </div>
                    <div className="pb-4 min-w-0">
                      <p className="text-xs font-medium text-gray-700">{ACTIVITY_LABEL[a.activityType]}</p>
                      <p className="text-[11px] text-gray-400 truncate">
                        {a.loggedByName}{a.attendeeName ? ` → ${a.attendeeName}` : ''}
                      </p>
                      {a.notes && <p className="text-[11px] text-gray-500 mt-0.5">{a.notes}</p>}
                      <p className="text-[10px] text-gray-300 mt-0.5">{relativeTime(a.loggedAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'notes' && (
          <div className="p-3">
            {notes === null && (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full" />
              </div>
            )}
            {notes !== null && notes.length === 0 && (
              <div className="text-center py-8">
                <svg className="w-8 h-8 text-gray-200 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                <p className="text-xs text-gray-400">No notes yet. Add context for your team.</p>
              </div>
            )}
            {notes !== null && notes.length > 0 && (
              <div className="space-y-3">
                {notes.map(n => (
                  <div key={n.id} className="flex gap-2">
                    <div className="w-6 h-6 rounded-full bg-brand-secondary text-white text-[10px] font-semibold flex items-center justify-center flex-shrink-0">
                      {n.userInitials}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-medium text-gray-700">
                        {n.userName} <span className="font-normal text-gray-300">· {relativeTime(n.createdAt)}</span>
                      </p>
                      <p className="text-xs text-gray-600 mt-0.5 break-words">{n.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'notes' && (
        <div className="border-t border-gray-100 p-2.5 flex gap-1.5 flex-shrink-0">
          <input
            type="text"
            value={noteDraft}
            onChange={e => setNoteDraft(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handlePostNote(); }}
            placeholder="Add a note…"
            className="input-field text-xs flex-1 py-1.5"
          />
          <button
            type="button"
            onClick={handlePostNote}
            disabled={posting || !noteDraft.trim()}
            className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
          >
            Post
          </button>
        </div>
      )}
    </div>
  );
}
