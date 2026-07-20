'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { type LogisticsHostedEvent, fmtDate } from './types';
import { EmptyState } from './shared';

const EVENT_TYPE_OPTIONS = [
  { value: 'dinner', label: 'Dinner' },
  { value: 'reception', label: 'Reception' },
  { value: 'happy_hour', label: 'Happy hour' },
  { value: 'breakfast', label: 'Breakfast' },
  { value: 'other', label: 'Other' },
];

interface Props {
  conferenceId: number;
  planYear: number;
  hostedEvents: LogisticsHostedEvent[];
  onChange: (events: LogisticsHostedEvent[]) => void;
}

interface Draft {
  eventType: string; venueName: string; eventDate: string; eventTime: string;
  guestCap: string; cateringConfirmed: boolean; invitationsSentDate: string; rsvpDeadline: string; notes: string;
}

function toDraft(e: LogisticsHostedEvent): Draft {
  return {
    eventType: e.eventType ?? '', venueName: e.venueName ?? '', eventDate: e.eventDate ?? '', eventTime: e.eventTime ?? '',
    guestCap: e.guestCap != null ? String(e.guestCap) : '', cateringConfirmed: e.cateringConfirmed,
    invitationsSentDate: e.invitationsSentDate ?? '', rsvpDeadline: e.rsvpDeadline ?? '', notes: e.notes ?? '',
  };
}

export function LogisticsHostedEventsTab({ conferenceId, planYear, hostedEvents, onChange }: Props) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (event: LogisticsHostedEvent) => {
    setEditingId(event.id);
    setDraft(toDraft(event));
  };

  const addEvent = async () => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/hosted-events?year=${planYear}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as LogisticsHostedEvent;
      onChange([...hostedEvents, created]);
      startEdit(created);
    } catch {
      toast.error('Failed to add hosted event.');
    }
  };

  const saveEvent = async () => {
    if (editingId == null || !draft) return;
    setSaving(true);
    const body = {
      eventType: draft.eventType || null,
      venueName: draft.venueName || null,
      eventDate: draft.eventDate || null,
      eventTime: draft.eventTime || null,
      guestCap: draft.guestCap ? Number(draft.guestCap) : null,
      cateringConfirmed: draft.cateringConfirmed,
      invitationsSentDate: draft.invitationsSentDate || null,
      rsvpDeadline: draft.rsvpDeadline || null,
      notes: draft.notes || null,
    };
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/hosted-events/${editingId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      onChange(hostedEvents.map(e => e.id === editingId ? { ...e, ...body } : e));
      setEditingId(null);
      setDraft(null);
    } catch {
      toast.error('Failed to save hosted event.');
    } finally {
      setSaving(false);
    }
  };

  const deleteEvent = async (id: number) => {
    try {
      const res = await fetch(`/api/program-planner/conferences/${conferenceId}/logistics/hosted-events/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      onChange(hostedEvents.filter(e => e.id !== id));
      if (editingId === id) { setEditingId(null); setDraft(null); }
    } catch {
      toast.error('Failed to delete hosted event.');
    }
  };

  if (hostedEvents.length === 0) {
    return (
      <div>
        <EmptyState icon="ti-confetti" headline="No hosted events planned" subtext="Add a dinner, reception, or other event" />
        <button type="button" onClick={addEvent} className="btn-primary text-xs px-3 py-1.5 mx-auto block">+ Add hosted event</button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {hostedEvents.map(event => {
        const isEditing = editingId === event.id;
        if (!isEditing) {
          const typeLabel = EVENT_TYPE_OPTIONS.find(o => o.value === event.eventType)?.label ?? event.eventType;
          return (
            <div key={event.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    {typeLabel && <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200">{typeLabel}</span>}
                    <p className="text-xs font-medium text-gray-800 truncate">{event.venueName || 'Venue TBD'}</p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1">
                    {event.eventDate ? fmtDate(event.eventDate) : 'Date TBD'}{event.eventTime ? ` · ${event.eventTime}` : ''}
                    {event.guestCap != null ? ` · ${event.guestCap} guests` : ''}
                  </p>
                  {event.rsvpDeadline && <p className="text-[11px] text-gray-400 mt-0.5">RSVP by {fmtDate(event.rsvpDeadline)}</p>}
                </div>
                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${event.cateringConfirmed ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                  {event.cateringConfirmed ? 'Catering confirmed' : 'Catering pending'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-2">
                <button type="button" onClick={() => startEdit(event)} className="text-[11px] text-brand-secondary hover:text-brand-primary font-medium">Edit</button>
                <button type="button" onClick={() => deleteEvent(event.id)} className="text-[11px] text-red-500 hover:text-red-700 font-medium">Delete</button>
              </div>
            </div>
          );
        }

        return (
          <div key={event.id} className="border border-brand-secondary rounded-lg p-3 space-y-2.5">
            <div>
              <label className="label">Event type</label>
              <select value={draft!.eventType} onChange={e => setDraft(d => d && { ...d, eventType: e.target.value })} className="input-field text-xs">
                <option value="">Select...</option>
                {EVENT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Venue name</label>
              <input value={draft!.venueName} onChange={e => setDraft(d => d && { ...d, venueName: e.target.value })} className="input-field text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Date</label>
                <input type="date" value={draft!.eventDate} onChange={e => setDraft(d => d && { ...d, eventDate: e.target.value })} className="input-field text-xs" />
              </div>
              <div>
                <label className="label">Time</label>
                <input type="time" value={draft!.eventTime} onChange={e => setDraft(d => d && { ...d, eventTime: e.target.value })} className="input-field text-xs" />
              </div>
            </div>
            <div>
              <label className="label">Guest cap</label>
              <input type="number" min="0" value={draft!.guestCap} onChange={e => setDraft(d => d && { ...d, guestCap: e.target.value })} className="input-field text-xs" />
            </div>
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" checked={draft!.cateringConfirmed} onChange={e => setDraft(d => d && { ...d, cateringConfirmed: e.target.checked })} className="accent-brand-secondary w-4 h-4" />
              Catering confirmed
            </label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="label">Invitations sent</label>
                <input type="date" value={draft!.invitationsSentDate} onChange={e => setDraft(d => d && { ...d, invitationsSentDate: e.target.value })} className="input-field text-xs" />
              </div>
              <div>
                <label className="label">RSVP deadline</label>
                <input type="date" value={draft!.rsvpDeadline} onChange={e => setDraft(d => d && { ...d, rsvpDeadline: e.target.value })} className="input-field text-xs" />
              </div>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea value={draft!.notes} onChange={e => setDraft(d => d && { ...d, notes: e.target.value })} className="input-field text-xs resize-none" rows={2} />
            </div>
            <div className="flex items-center justify-end gap-2 pt-1">
              <button type="button" onClick={() => { setEditingId(null); setDraft(null); }} className="btn-secondary text-xs px-2.5 py-1.5">Cancel</button>
              <button type="button" onClick={saveEvent} disabled={saving} className="btn-primary text-xs px-2.5 py-1.5">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </div>
        );
      })}
      <button type="button" onClick={addEvent} className="w-full text-center text-xs text-brand-secondary hover:text-brand-primary font-medium py-2">
        + Add hosted event
      </button>
    </div>
  );
}
