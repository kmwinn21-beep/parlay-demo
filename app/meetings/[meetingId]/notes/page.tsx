'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

export default function MeetingNotesPage() {
  const params = useParams<{ meetingId: string }>();
  const router = useRouter();
  const meetingId = Number(params.meetingId);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!meetingId) return;
    fetch(`/api/meeting-notes/${meetingId}`).then(r => r.json()).then(d => { if (d?.notes_text) setNotes(String(d.notes_text)); }).catch(() => {});
  }, [meetingId]);

  const onSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/meeting-notes/${meetingId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ notes_text: notes }) });
      if (!res.ok) throw new Error();
      toast.success('Meeting notes saved');
    } catch {
      toast.error('Failed to save notes');
    } finally { setSaving(false); }
  };

  return <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
    <div className="flex items-center justify-between">
      <button className="text-sm text-gray-500 hover:text-gray-800" onClick={() => router.back()}>← Back</button>
      <div className="flex gap-2"><button className="px-3 py-2 text-sm rounded border" onClick={() => router.back()}>Cancel</button><button disabled={saving} className="px-3 py-2 text-sm rounded bg-brand-secondary text-white" onClick={onSave}>{saving ? 'Saving…' : 'Save Meeting'}</button></div>
    </div>
    <h1 className="text-xl font-semibold">Meeting Notes</h1>
    <textarea className="input-field w-full min-h-[280px]" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Take notes during the meeting..." />
    <div className="border rounded-lg p-4 text-sm text-gray-600">AI analysis, transcript, recording controls, and timeline scrubber are scaffolded for follow-up implementation.</div>
  </div>;
}
