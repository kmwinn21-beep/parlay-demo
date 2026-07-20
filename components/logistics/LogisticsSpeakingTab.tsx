'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsSpeakingSlot, type AssignedRepOption } from './types';
import { EmptyState } from './shared';

const SESSION_TYPE_OPTIONS = [
  { value: 'keynote', label: 'Keynote' },
  { value: 'panel', label: 'Panel' },
  { value: 'breakout', label: 'Breakout' },
  { value: 'workshop', label: 'Workshop' },
  { value: 'fireside_chat', label: 'Fireside chat' },
  { value: 'moderator', label: 'Moderator' },
  { value: 'other', label: 'Other' },
];

interface Props {
  conferenceId: number;
  planYear: number;
  speakingSlots: LogisticsSpeakingSlot[];
  assignedReps: AssignedRepOption[];
  onChange: (slots: LogisticsSpeakingSlot[]) => void;
}

interface DraftSlot {
  speakerUserId: number | null;
  speakerName: string;
  useOther: boolean;
  sessionTitle: string;
  sessionType: string;
  sessionDate: string;
  sessionTime: string;
  roomStage: string;
  notes: string;
}

function toDraft(s: LogisticsSpeakingSlot): DraftSlot {
  return {
    speakerUserId: s.speakerUserId,
    speakerName: s.speakerName ?? '',
    useOther: s.speakerUserId == null && !!s.speakerName,
    sessionTitle: s.sessionTitle ?? '',
    sessionType: s.sessionType ?? '',
    sessionDate: s.sessionDate ?? '',
    sessionTime: s.sessionTime ?? '',
    roomStage: s.roomStage ?? '',
    notes: s.notes ?? '',
  };
}

export function LogisticsSpeakingTab({ conferenceId, planYear, speakingSlots, assignedReps, onChange }: Props) {
  const [editingSlotId, setEditingSlotId] = useState<number | null>(null);
  const [draft, setDraft] = useState<DraftSlot | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (slot: LogisticsSpeakingSlot) => {
    setEditingSlotId(slot.id);
    setDraft(toDraft(slot));
    setConfirmDeleteId(null);
  };

  const addSlot = async () => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/speaking?year=${planYear}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as LogisticsSpeakingSlot;
      onChange([...speakingSlots, created]);
      startEdit(created);
    } catch {
      toast.error('Failed to add speaking slot.');
    }
  };

  const saveSlot = async () => {
    if (editingSlotId == null || !draft) return;
    setSaving(true);
    const body = {
      speakerUserId: draft.useOther ? null : draft.speakerUserId,
      speakerName: draft.useOther ? (draft.speakerName || null) : null,
      sessionTitle: draft.sessionTitle || null,
      sessionType: draft.sessionType || null,
      sessionDate: draft.sessionDate || null,
      sessionTime: draft.sessionTime || null,
      roomStage: draft.roomStage || null,
      notes: draft.notes || null,
    };
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/speaking/${editingSlotId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      const rep = assignedReps.find(r => r.userId === body.speakerUserId);
      onChange(speakingSlots.map(s => s.id === editingSlotId ? {
        ...s, ...body, speakerDisplayName: draft.useOther ? null : (rep?.displayName ?? s.speakerDisplayName),
      } : s));
      setEditingSlotId(null);
      setDraft(null);
    } catch {
      toast.error('Failed to save speaking slot.');
    } finally {
      setSaving(false);
    }
  };

  const toggleField = async (slot: LogisticsSpeakingSlot, field: 'slidesSubmitted' | 'bioSubmitted') => {
    const next = !slot[field];
    onChange(speakingSlots.map(s => s.id === slot.id ? { ...s, [field]: next } : s));
    const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/speaking/${slot.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [field]: next }),
    }).catch(() => null);
    if (!res || !res.ok) {
      onChange(speakingSlots.map(s => s.id === slot.id ? { ...s, [field]: !next } : s));
      toast.error('Failed to update.');
    }
  };

  const deleteSlot = async (id: number) => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/speaking/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onChange(speakingSlots.filter(s => s.id !== id));
      setConfirmDeleteId(null);
      if (editingSlotId === id) { setEditingSlotId(null); setDraft(null); }
    } catch {
      toast.error('Failed to delete speaking slot.');
    }
  };

  if (speakingSlots.length === 0) {
    return (
      <div>
        <EmptyState icon="ti-microphone" headline="No speaking slots yet" subtext="Add a session or panel appearance" />
        <button type="button" onClick={addSlot} className="btn-primary text-xs px-3 py-1.5 mx-auto block">+ Add speaking slot</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {speakingSlots.map(slot => {
        const isEditing = editingSlotId === slot.id;
        if (!isEditing) {
          return (
            <div key={slot.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{slot.sessionTitle || 'Untitled session'}</p>
                  <p className="text-[11px] text-gray-500 mt-0.5">
                    {slot.speakerDisplayName || slot.speakerName || 'No speaker set'}
                    {slot.sessionDate ? ` · ${slot.sessionDate}` : ''}{slot.sessionTime ? ` ${slot.sessionTime}` : ''}
                  </p>
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${
                  slot.slidesSubmitted && slot.bioSubmitted ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                }`}>
                  {slot.slidesSubmitted && slot.bioSubmitted ? 'Confirmed' : 'Pending'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button type="button" onClick={() => startEdit(slot)} className="text-[11px] text-brand-secondary hover:text-brand-primary font-medium">Edit</button>
                {confirmDeleteId === slot.id ? (
                  <span className="flex items-center gap-1.5" style={{ fontSize: 11 }}>
                    <span style={{ color: 'var(--text-danger, #DC2626)' }}>Remove this slot?</span>
                    <button type="button" onClick={() => deleteSlot(slot.id)} className="text-red-600 font-medium">Yes, remove</button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)} className="text-gray-400">Cancel</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmDeleteId(slot.id)} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Delete</button>
                )}
              </div>
            </div>
          );
        }

        return (
          <div key={slot.id} className="border border-brand-secondary rounded-lg p-3 space-y-2.5">
            <div>
              <label className="label">Speaker</label>
              {!draft!.useOther ? (
                <select
                  value={draft!.speakerUserId ?? ''}
                  onChange={e => {
                    const v = e.target.value;
                    if (v === '__other__') setDraft(d => d && { ...d, useOther: true, speakerUserId: null });
                    else setDraft(d => d && { ...d, speakerUserId: v ? Number(v) : null });
                  }}
                  className="input-field text-xs"
                >
                  <option value="">Select speaker...</option>
                  {assignedReps.length > 0 && (
                    <optgroup label="Assigned reps">
                      {assignedReps.map(r => <option key={r.userId} value={r.userId}>{r.displayName}</option>)}
                    </optgroup>
                  )}
                  <option value="__other__">Other — enter name</option>
                </select>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    value={draft!.speakerName}
                    onChange={e => setDraft(d => d && { ...d, speakerName: e.target.value })}
                    placeholder="Speaker name"
                    className="input-field text-xs flex-1"
                  />
                  <button type="button" onClick={() => setDraft(d => d && { ...d, useOther: false, speakerName: '' })} className="text-[11px] text-gray-400 hover:text-gray-600 flex-shrink-0">
                    Use rep instead
                  </button>
                </div>
              )}
            </div>
            <div>
              <label className="label">Session title</label>
              <input value={draft!.sessionTitle} onChange={e => setDraft(d => d && { ...d, sessionTitle: e.target.value })} className="input-field text-xs" />
            </div>
            <div>
              <label className="label">Session type</label>
              <select value={draft!.sessionType} onChange={e => setDraft(d => d && { ...d, sessionType: e.target.value })} className="input-field text-xs">
                <option value="">Select...</option>
                {SESSION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Date</label>
                <input type="date" value={draft!.sessionDate} onChange={e => setDraft(d => d && { ...d, sessionDate: e.target.value })} className="input-field text-xs" />
              </div>
              <div>
                <label className="label">Time</label>
                <input type="time" value={draft!.sessionTime} onChange={e => setDraft(d => d && { ...d, sessionTime: e.target.value })} className="input-field text-xs" />
              </div>
            </div>
            <div>
              <label className="label">Room/stage</label>
              <input value={draft!.roomStage} onChange={e => setDraft(d => d && { ...d, roomStage: e.target.value })} className="input-field text-xs" />
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={slot.slidesSubmitted} onChange={() => toggleField(slot, 'slidesSubmitted')} className="accent-brand-secondary w-4 h-4" />
                Slides submitted
              </label>
              <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
                <input type="checkbox" checked={slot.bioSubmitted} onChange={() => toggleField(slot, 'bioSubmitted')} className="accent-brand-secondary w-4 h-4" />
                Bio submitted
              </label>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea value={draft!.notes} onChange={e => setDraft(d => d && { ...d, notes: e.target.value })} className="input-field text-xs resize-none" rows={2} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setEditingSlotId(null); setDraft(null); }} className="btn-secondary text-xs px-2.5 py-1.5">Cancel</button>
              <button type="button" onClick={saveSlot} disabled={saving} className="btn-primary text-xs px-2.5 py-1.5">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={addSlot} className="w-full text-center text-xs text-brand-secondary hover:text-brand-primary font-medium py-2">
        + Add speaking slot
      </button>
    </div>
  );
}
