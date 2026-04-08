'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';

export interface SocialEvent {
  id: number;
  conference_id: number;
  entered_by: string | null;
  internal_attendees: string | null;
  event_type: string | null;
  host: string | null;
  location: string | null;
  event_date: string | null;
  event_time: string | null;
  invite_only: string;
  prospect_attendees: string | null;
  notes: string | null;
  created_at: string;
}

interface Attendee {
  id: number;
  first_name: string;
  last_name: string;
  company_id?: number;
  company_name?: string;
  company_type?: string;
}

interface SocialEventsTableProps {
  conferenceId: number;
  conferenceName: string;
  events: SocialEvent[];
  onRefresh: () => void;
  userOptions: string[];
  eventTypeOptions: string[];
  companies: Array<{ id: number; name: string }>;
  attendees: Attendee[];
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '—';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function formatTime(timeStr: string | null) {
  if (!timeStr) return '—';
  const [h, m] = timeStr.split(':');
  const hour = parseInt(h, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 || 12;
  return `${h12}:${m} ${ampm}`;
}

function InternalAttendeePill({ internalAttendees }: { internalAttendees: string | null }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  if (!internalAttendees) return <span className="text-gray-400">—</span>;

  const names = internalAttendees.split(',').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return <span className="text-gray-400">—</span>;

  const handleMouseEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 200;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
  };

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-100 text-yellow-800 cursor-pointer">
        {names.length}
      </span>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Internal Attendees</p>
            <ul className="space-y-1">
              {names.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function ProspectAttendeePill({ prospectAttendees, notes, attendees }: { prospectAttendees: string | null; notes: string | null; attendees: Attendee[] }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  if (!prospectAttendees) return <span className="text-gray-400">—</span>;

  const names = prospectAttendees.split(',').map(n => n.trim()).filter(Boolean);
  if (names.length === 0) return <span className="text-gray-400">—</span>;

  // Resolve names to full display names
  const displayNames = names.map(name => {
    // name could be an ID or a full name
    const id = parseInt(name, 10);
    if (!isNaN(id)) {
      const att = attendees.find(a => a.id === id);
      if (att) return `${att.first_name} ${att.last_name}${att.company_name ? ` (${att.company_name})` : ''}`;
    }
    return name;
  });

  const handleMouseEnter = () => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(300, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 200;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
  };

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)}>
      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-700 cursor-pointer">
        {names.length}
      </span>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 9999, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5">
            <p className="font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Prospect Attendees</p>
            <ul className="space-y-1">
              {displayNames.map((name, i) => (
                <li key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400 flex-shrink-0" />
                  {name}
                </li>
              ))}
            </ul>
            {notes && (
              <>
                <div className="border-t border-gray-700 mt-2 pt-2">
                  <p className="font-semibold mb-1 text-gray-300 uppercase tracking-wide text-[10px]">Notes</p>
                  <p className="text-gray-200 whitespace-pre-wrap">{notes}</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SocialEventsTable({
  conferenceId,
  conferenceName,
  events,
  onRefresh,
  userOptions,
  eventTypeOptions,
  companies,
  attendees,
}: SocialEventsTableProps) {
  const [showForm, setShowForm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  const [formData, setFormData] = useState({
    entered_by: '',
    internal_attendees: [] as string[],
    event_type: '',
    host: '',
    location: '',
    event_date: '',
    event_time: '',
    invite_only: 'No',
    prospect_attendees: [] as string[],
    notes: '',
  });

  // Multiselect dropdown state
  const [internalOpen, setInternalOpen] = useState(false);
  const [prospectOpen, setProspectOpen] = useState(false);
  const [prospectSearch, setProspectSearch] = useState('');
  const internalRef = useRef<HTMLDivElement>(null);
  const prospectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (internalRef.current && !internalRef.current.contains(e.target as Node)) setInternalOpen(false);
      if (prospectRef.current && !prospectRef.current.contains(e.target as Node)) { setProspectOpen(false); setProspectSearch(''); }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  // Filter attendees to only "Operator" company type for prospect attendees
  const operatorAttendees = attendees.filter(a => {
    const ct = (a.company_type || '').toLowerCase();
    return ct.includes('operator') || ct.includes('own/op') || ct.includes('opco');
  });

  const resetForm = () => {
    setFormData({
      entered_by: '',
      internal_attendees: [],
      event_type: '',
      host: '',
      location: '',
      event_date: '',
      event_time: '',
      invite_only: 'No',
      prospect_attendees: [],
      notes: '',
    });
    setEditingEventId(null);
    setShowForm(false);
  };

  const handleEdit = (event: SocialEvent) => {
    setFormData({
      entered_by: event.entered_by || '',
      internal_attendees: event.internal_attendees ? event.internal_attendees.split(',').map(n => n.trim()).filter(Boolean) : [],
      event_type: event.event_type || '',
      host: event.host || '',
      location: event.location || '',
      event_date: event.event_date || '',
      event_time: event.event_time || '',
      invite_only: event.invite_only || 'No',
      prospect_attendees: event.prospect_attendees ? event.prospect_attendees.split(',').map(n => n.trim()).filter(Boolean) : [],
      notes: event.notes || '',
    });
    setEditingEventId(event.id);
    setShowForm(true);
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    try {
      const payload = {
        conference_id: conferenceId,
        entered_by: formData.entered_by || null,
        internal_attendees: formData.internal_attendees.length > 0 ? formData.internal_attendees.join(',') : null,
        event_type: formData.event_type || null,
        host: formData.host || null,
        location: formData.location || null,
        event_date: formData.event_date || null,
        event_time: formData.event_time || null,
        invite_only: formData.invite_only,
        prospect_attendees: formData.prospect_attendees.length > 0 ? formData.prospect_attendees.join(',') : null,
        notes: formData.notes || null,
      };

      const isEditing = editingEventId !== null;
      const url = isEditing ? `/api/social-events/${editingEventId}` : '/api/social-events';
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error();

      // Cross-post notes only for new events (not edits)
      if (!isEditing && formData.notes && formData.notes.trim()) {
        const crossPostPromises: Promise<unknown>[] = [];
        const noteContent = formData.notes.trim();
        const eventLabel = formData.event_type ? `[${formData.event_type}]` : '[Social Event]';
        const attendeeEventLabel = `[${conferenceName} | ${formData.event_type || 'Social Event'} | ${formData.host || 'N/A'}]`;
        const enteredBy = formData.entered_by || null;

        // Post to conference notes
        crossPostPromises.push(
          fetch('/api/notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              entity_type: 'conference',
              entity_id: conferenceId,
              content: `${eventLabel} ${noteContent}`,
              conference_name: conferenceName,
              rep: enteredBy,
            }),
          })
        );

        // Cross-post notes to each selected prospect attendee
        for (const attIdStr of formData.prospect_attendees) {
          const attId = parseInt(attIdStr, 10);
          const att = attendees.find(a => a.id === attId);
          if (!att) continue;

          // Post to attendee notes
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'attendee',
                entity_id: attId,
                content: `${attendeeEventLabel} ${noteContent}`,
                conference_name: conferenceName,
                rep: enteredBy,
              }),
            })
          );

          // Post to company notes if attendee has a company
          if (att.company_id) {
            const attName = `${att.first_name} ${att.last_name}`;
            crossPostPromises.push(
              fetch('/api/notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  entity_type: 'company',
                  entity_id: att.company_id,
                  content: `[${attName}] ${eventLabel} ${noteContent}`,
                  conference_name: conferenceName,
                  rep: enteredBy,
                }),
              })
            );
          }
        }

        await Promise.allSettled(crossPostPromises);
      }

      toast.success(isEditing ? 'Social event updated.' : 'Social event added.');
      resetForm();
      onRefresh();
    } catch {
      toast.error('Failed to save social event.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (eventId: number) => {
    if (!confirm('Delete this social event? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/social-events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      toast.success('Social event deleted.');
      onRefresh();
    } catch {
      toast.error('Failed to delete social event.');
    }
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Social Events</h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => { setEditingEventId(null); setShowForm(true); }}
            className="flex items-center gap-1.5 text-sm text-procare-bright-blue hover:text-procare-dark-blue font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            Add Social Event
          </button>
        )}
      </div>

      {showForm && (
        <div className="mb-5 p-4 bg-blue-50 border border-procare-bright-blue rounded-xl">
          <p className="text-sm font-semibold text-procare-dark-blue mb-3">{editingEventId ? 'Edit Social Event' : 'New Social Event'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-3">
            {/* Entered By */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Entered By</label>
              <select
                value={formData.entered_by}
                onChange={e => setFormData(prev => ({ ...prev, entered_by: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="">Select user...</option>
                {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            {/* Internal Attendees (multiselect) */}
            <div ref={internalRef}>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Internal Attendees</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setInternalOpen(v => !v)}
                  className="input-field w-full text-left flex items-center justify-between text-sm"
                >
                  <span className={formData.internal_attendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                    {formData.internal_attendees.length === 0 ? 'Select...' : `${formData.internal_attendees.length} selected`}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${internalOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {internalOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                    {userOptions.length === 0 ? (
                      <div className="px-3 py-2 text-sm text-gray-500">No users configured.</div>
                    ) : (
                      userOptions.map(option => {
                        const checked = formData.internal_attendees.includes(option);
                        return (
                          <button
                            key={option}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              internal_attendees: checked
                                ? prev.internal_attendees.filter(v => v !== option)
                                : [...prev.internal_attendees, option],
                            }))}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                              {checked && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            {option}
                          </button>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
              {formData.internal_attendees.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formData.internal_attendees.map(v => (
                    <span key={v} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200">
                      {v}
                      <button type="button" onClick={() => setFormData(prev => ({ ...prev, internal_attendees: prev.internal_attendees.filter(x => x !== v) }))} className="hover:text-red-500">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Type</label>
              <select
                value={formData.event_type}
                onChange={e => setFormData(prev => ({ ...prev, event_type: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="">Select type...</option>
                {eventTypeOptions.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {/* Host */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Host</label>
              <select
                value={formData.host}
                onChange={e => setFormData(prev => ({ ...prev, host: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="">Select company...</option>
                {companies.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
            </div>

            {/* Location */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Location</label>
              <input
                type="text"
                value={formData.location}
                onChange={e => setFormData(prev => ({ ...prev, location: e.target.value }))}
                placeholder="Enter location..."
                className="input-field text-sm w-full"
              />
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Date</label>
              <input
                type="date"
                value={formData.event_date}
                onChange={e => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            {/* Time */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Time</label>
              <input
                type="time"
                value={formData.event_time}
                onChange={e => setFormData(prev => ({ ...prev, event_time: e.target.value }))}
                className="input-field text-sm w-full"
              />
            </div>

            {/* Invite Only */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Invite Only?</label>
              <select
                value={formData.invite_only}
                onChange={e => setFormData(prev => ({ ...prev, invite_only: e.target.value }))}
                className="input-field text-sm w-full"
              >
                <option value="No">No</option>
                <option value="Yes">Yes</option>
              </select>
            </div>

            {/* Prospect Attendees (multiselect) */}
            <div ref={prospectRef} className="sm:col-span-2 lg:col-span-1">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Prospect Attendees</label>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => { setProspectOpen(v => !v); if (prospectOpen) setProspectSearch(''); }}
                  className="input-field w-full text-left flex items-center justify-between text-sm"
                >
                  <span className={formData.prospect_attendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                    {formData.prospect_attendees.length === 0 ? 'Select attendees...' : `${formData.prospect_attendees.length} selected`}
                  </span>
                  <svg className={`w-4 h-4 text-gray-400 transition-transform ${prospectOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {prospectOpen && (
                  <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg">
                    <div className="p-2 border-b border-gray-100">
                      <input
                        type="text"
                        value={prospectSearch}
                        onChange={e => setProspectSearch(e.target.value)}
                        placeholder="Search attendees..."
                        className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-procare-bright-blue focus:border-procare-bright-blue"
                        autoFocus
                      />
                    </div>
                    <div className="max-h-48 overflow-y-auto">
                    {(() => {
                      const query = prospectSearch.toLowerCase().trim();
                      const filtered = query
                        ? operatorAttendees.filter(att => {
                            const fullName = `${att.first_name} ${att.last_name}`.toLowerCase();
                            const company = (att.company_name || '').toLowerCase();
                            return fullName.includes(query) || company.includes(query);
                          })
                        : operatorAttendees;
                      if (filtered.length === 0) {
                        return <div className="px-3 py-2 text-sm text-gray-500">{operatorAttendees.length === 0 ? 'No operator attendees found.' : 'No matching attendees.'}</div>;
                      }
                      return filtered.map(att => {
                        const attId = String(att.id);
                        const checked = formData.prospect_attendees.includes(attId);
                        return (
                          <button
                            key={att.id}
                            type="button"
                            onClick={() => setFormData(prev => ({
                              ...prev,
                              prospect_attendees: checked
                                ? prev.prospect_attendees.filter(v => v !== attId)
                                : [...prev.prospect_attendees, attId],
                            }))}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                          >
                            <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${checked ? 'bg-procare-bright-blue border-procare-bright-blue' : 'border-gray-300'}`}>
                              {checked && (
                                <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                </svg>
                              )}
                            </span>
                            <span>{att.first_name} {att.last_name}</span>
                            {att.company_name && <span className="text-gray-400 text-xs">({att.company_name})</span>}
                          </button>
                        );
                      });
                    })()}
                    </div>
                  </div>
                )}
              </div>
              {formData.prospect_attendees.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {formData.prospect_attendees.map(attId => {
                    const att = attendees.find(a => a.id === parseInt(attId, 10));
                    const label = att ? `${att.first_name} ${att.last_name}` : attId;
                    return (
                      <span key={attId} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-procare-bright-blue border border-blue-200">
                        {label}
                        <button type="button" onClick={() => setFormData(prev => ({ ...prev, prospect_attendees: prev.prospect_attendees.filter(x => x !== attId) }))} className="hover:text-red-500">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Notes */}
          <div className="mb-3">
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">Notes</label>
            <textarea
              value={formData.notes}
              onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
              placeholder="Enter notes..."
              className="input-field resize-none w-full text-sm"
              rows={3}
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-primary text-sm"
            >
              {isSubmitting ? 'Saving...' : editingEventId ? 'Update Event' : 'Add Event'}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No social events yet. Click &quot;Add Social Event&quot; to get started.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Entered By</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Internal</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Type</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Host</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Location</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Time</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Invite Only</th>
                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-nowrap">Prospects</th>
                <th className="px-3 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {events.map(event => (
                <tr key={event.id} className="hover:bg-gray-50 align-top">
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{event.entered_by || '—'}</td>
                  <td className="px-3 py-3 text-gray-700">
                    <InternalAttendeePill internalAttendees={event.internal_attendees} />
                  </td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{event.event_type || '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{event.host || '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{event.location || '—'}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{formatDate(event.event_date)}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{formatTime(event.event_time)}</td>
                  <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{event.invite_only === 'Yes' ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-3">
                    <ProspectAttendeePill prospectAttendees={event.prospect_attendees} notes={event.notes} attendees={attendees} />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => handleEdit(event)}
                        className="text-gray-300 hover:text-procare-bright-blue transition-colors"
                        title="Edit event"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(event.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete event"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
