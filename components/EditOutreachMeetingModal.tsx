'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { RepMultiSelect } from './RepMultiSelect';
import { type UserOption, parseRepIds } from '@/lib/useUserOptions';
import { type Meeting } from './MeetingsTable';

// Editing a meeting scheduled with an attendee, launched from the outreach tab's
// per-attendee meeting icon. Unlike the app-wide PUT /api/meetings/[id] (which
// edits in place), this posts to /api/meetings/[id]/supersede — it inserts a new
// meeting row and links the old one to it, so the outreach timeline can keep
// showing the old (struck-through) entry alongside the new one.
export function EditOutreachMeetingModal({
  meetingId,
  onClose,
  onSuccess,
}: {
  meetingId: number;
  onClose: () => void;
  onSuccess: (meeting: Meeting) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userOptions, setUserOptions] = useState<UserOption[]>([]);
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [location, setLocation] = useState('');
  const [repIds, setRepIds] = useState<number[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`/api/meetings/${meetingId}`).then(r => (r.ok ? r.json() : Promise.reject())),
      fetch('/api/config?category=user&form=conference_detail').then(r => (r.ok ? r.json() : [])),
    ])
      .then(([meeting, users]: [
        { meeting_date: string; meeting_time: string; location: string | null; scheduled_by: string | null },
        UserOption[],
      ]) => {
        setMeetingDate(meeting.meeting_date ?? '');
        setMeetingTime(meeting.meeting_time ?? '');
        setLocation(meeting.location ?? '');
        setRepIds(parseRepIds(meeting.scheduled_by));
        setUserOptions(users ?? []);
      })
      .catch(() => toast.error('Failed to load meeting'))
      .finally(() => setLoading(false));
  }, [meetingId]);

  const handleSave = async () => {
    if (!meetingDate || !meetingTime) { toast.error('Date and time are required'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/meetings/${meetingId}/supersede`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          meeting_date: meetingDate,
          meeting_time: meetingTime,
          location: location.trim() || null,
          scheduled_by: repIds.length > 0 ? repIds.join(',') : null,
        }),
      });
      if (!res.ok) throw new Error();
      const meeting = await res.json() as Meeting;
      toast.success('Meeting updated');
      onSuccess(meeting);
    } catch {
      toast.error('Failed to update meeting');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 py-6">
      <div className="relative bg-white rounded-xl shadow-2xl border border-gray-200 w-full mx-4 max-w-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-brand-primary font-serif">Edit Meeting</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10">
            <div className="animate-spin w-6 h-6 border-2 border-brand-secondary border-t-transparent rounded-full" />
          </div>
        ) : (
          <div className="px-5 py-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Date</label>
                <input type="date" value={meetingDate} onChange={e => setMeetingDate(e.target.value)} className="input-field text-sm w-full" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Time</label>
                <input type="time" value={meetingTime} onChange={e => setMeetingTime(e.target.value)} className="input-field text-sm w-full" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Location</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="input-field text-sm w-full" placeholder="Booth, room, etc." />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-500 mb-1">Reps</label>
              <RepMultiSelect options={userOptions} selectedIds={repIds} onChange={setRepIds} />
            </div>
          </div>
        )}

        <div className="flex gap-2 px-5 py-3 border-t border-gray-100">
          <button type="button" onClick={handleSave} disabled={saving || loading} className="btn-primary text-sm flex-1 disabled:opacity-50">
            {saving ? 'Saving…' : 'Save'}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary text-sm">Cancel</button>
        </div>
      </div>
    </div>
  );
}
