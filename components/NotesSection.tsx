'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { getPreset } from '@/lib/colors';
import { useConfigColors } from '@/lib/useConfigColors';
import { useUser } from '@/components/UserContext';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { MentionTextarea } from '@/components/MentionTextarea';
import { useUserOptions, getRepInitials } from '@/lib/useUserOptions';

export interface EntityNote {
  id: number;
  entity_type: string;
  entity_id: number;
  content: string;
  created_at: string;
  company_name?: string;
  conference_name?: string | null;
  rep?: string | null;
  attendee_name?: string | null;
  tagged_users?: string | null;
}

function formatDateTime(dt: string) {
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function isLongNote(content: string) {
  return content.length > 300 || content.split('\n').length > 4;
}

export function NotesSection({
  entityType,
  entityId,
  initialNotes = [],
  parentEntityId,
  conferences = [],
  companies = [],
  attendees = [],
  currentAttendeeName,
  currentCompanyName,
  currentCompanyId,
  currentAttendeeId,
  currentConferenceName,
  onPin,
  pinnedNoteIds = new Set(),
  showPinnedIndicator = false,
}: {
  entityType: 'attendee' | 'company' | 'conference';
  entityId: number;
  initialNotes?: EntityNote[];
  parentEntityId?: number;
  conferences?: Array<{ id: number; name: string }>;
  companies?: Array<{ id: number; name: string }>;
  attendees?: Array<{ id: number; first_name: string; last_name: string; company_id?: number; company_name?: string }>;
  currentAttendeeName?: string;
  currentCompanyName?: string;
  currentCompanyId?: number;
  currentAttendeeId?: number;
  currentConferenceName?: string;
  onPin?: (noteId: number, conferenceName: string | null, attendeeName: string | null, attendeeId: number | null) => void;
  pinnedNoteIds?: Set<number>;
  showPinnedIndicator?: boolean;
}) {
  const [notes, setNotes] = useState<EntityNote[]>(initialNotes);
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [pinOnSubmit, setPinOnSubmit] = useState(false);

  const [pinModalNoteId, setPinModalNoteId] = useState<number | null>(null);
  const [pinConference, setPinConference] = useState('');
  const [pinAttendeeId, setPinAttendeeId] = useState('');
  const { user } = useUser();
  const colorMaps = useConfigColors();
  const userOptionsWithIds = useUserOptions();

  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);

  const [taggedUserIds, setTaggedUserIds] = useState<number[]>([]);
  const [selectedConference, setSelectedConference] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');

  const filteredAttendees = selectedCompanyId
    ? attendees.filter(a => String(a.company_id) === selectedCompanyId)
    : attendees;

  function handleMentionAdd(configId: number) {
    setTaggedUserIds(prev => prev.includes(configId) ? prev : [...prev, configId]);
  }

  const handleSubmit = async () => {
    if (!noteText.trim()) { toast.error('Note cannot be empty.'); return; }
    setIsSubmitting(true);
    const content = noteText.trim();
    const conferenceName = selectedConference || (entityType === 'conference' ? currentConferenceName : '') || 'General Note';
    // Auto-detect rep from logged-in user
    const repValue = user?.displayName || null;
    const taggedUsersStr = taggedUserIds.length > 0 ? taggedUserIds.join(',') : null;

    try {
      let selAttendee: (typeof attendees)[0] | undefined;
      let selCompany: (typeof companies)[0] | undefined;
      let selConf: (typeof conferences)[0] | undefined;
      let attendeeLabel = '';
      let companyLabel = '';
      let notifyFor: 'attendee' | 'company' | 'conference' | null = null;

      if (entityType === 'conference') {
        selCompany = companies.find(c => String(c.id) === selectedCompanyId);
        selAttendee = filteredAttendees.find(a => String(a.id) === selectedAttendeeId);
        attendeeLabel = selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : '';
        companyLabel = selCompany ? selCompany.name : '';
        notifyFor = selAttendee ? 'attendee' : selCompany ? 'company' : 'conference';
      } else if (entityType === 'company') {
        selConf = conferences.find(c => c.name === selectedConference);
        selAttendee = attendees.find(a => String(a.id) === selectedAttendeeId);
        attendeeLabel = selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : '';
        companyLabel = currentCompanyName || '';
      } else if (entityType === 'attendee') {
        selConf = conferences.find(c => c.name === selectedConference);
        attendeeLabel = currentAttendeeName || '';
        companyLabel = currentCompanyName || '';
      }

      const primaryContent = content;

      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          content: primaryContent,
          conference_name: conferenceName,
          rep: repValue,
          attendee_name: attendeeLabel || null,
          company_name: companyLabel || null,
          tagged_users: taggedUsersStr,
          ...(entityType === 'conference' && notifyFor !== 'conference' ? { skip_notification: true } : {}),
        }),
      });
      if (!res.ok) throw new Error();
      const newNote: EntityNote = await res.json();
      setNotes(prev => [newNote, ...prev]);

      const crossPostPromises: Promise<unknown>[] = [];

      if (entityType === 'company') {
        if (selConf) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'conference',
                entity_id: selConf.id,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: true,
              }),
            })
          );
        }
        if (selAttendee) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'attendee',
                entity_id: selAttendee.id,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: true,
              }),
            })
          );
        }
      } else if (entityType === 'conference') {
        if (selCompany) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'company',
                entity_id: selCompany.id,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: notifyFor !== 'company',
              }),
            })
          );
        }
        if (selAttendee) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'attendee',
                entity_id: selAttendee.id,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: notifyFor !== 'attendee',
              }),
            })
          );
        }
      } else if (entityType === 'attendee') {
        const companyId = currentCompanyId;
        if (companyId) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'company',
                entity_id: companyId,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: true,
              }),
            })
          );
        }
        if (selConf) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'conference',
                entity_id: selConf.id,
                content,
                conference_name: conferenceName,
                rep: repValue,
                attendee_name: attendeeLabel || null,
                company_name: companyLabel || null,
                skip_notification: true,
              }),
            })
          );
        }
      }

      if (crossPostPromises.length > 0) {
        await Promise.allSettled(crossPostPromises);
      }

      if (pinOnSubmit && onPin && user?.email && (entityType === 'attendee' || entityType === 'company')) {
        try {
          const pinConferenceName = conferenceName !== 'General Note' ? conferenceName : null;
          if (entityType === 'attendee') {
            onPin(newNote.id, pinConferenceName, null, null);
          } else if (entityType === 'company') {
            const selAtt = attendees.find(a => String(a.id) === selectedAttendeeId);
            const attName = selAtt ? `${selAtt.first_name} ${selAtt.last_name}` : null;
            const attId = selAtt ? selAtt.id : null;
            onPin(newNote.id, pinConferenceName, attName, attId);
          }
        } catch { /* non-fatal */ }
      }

      setNoteText('');
      setTaggedUserIds([]);
      setSelectedConference('');
      setSelectedCompanyId('');
      setSelectedAttendeeId('');
      setPinOnSubmit(false);
      setIsAdding(false);
      toast.success('Note saved.');
    } catch {
      toast.error('Failed to save note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this note? This cannot be undone.')) return;
    try {
      const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      setNotes(prev => prev.filter(n => n.id !== id));
      toast.success('Note deleted.');
    } catch {
      toast.error('Failed to delete note.');
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const handlePinClick = (noteId: number) => {
    if (!onPin) return;
    const note = notes.find(n => n.id === noteId);
    if (entityType === 'attendee') {
      if (note?.conference_name && note.conference_name !== 'General Note') {
        onPin(noteId, note.conference_name, null, null);
      } else {
        setPinConference('');
        setPinModalNoteId(noteId);
      }
    } else if (entityType === 'company') {
      setPinConference(note?.conference_name && note.conference_name !== 'General Note' ? note.conference_name : '');
      setPinAttendeeId('');
      setPinModalNoteId(noteId);
    } else {
      return;
    }
  };

  const handlePinSubmit = () => {
    if (!onPin || !pinModalNoteId) return;
    if (entityType === 'attendee' && !pinConference) {
      toast.error('Please select a conference.');
      return;
    }
    const selAttendee = attendees.find(a => String(a.id) === pinAttendeeId);
    const attendeeName = selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : null;
    const attendeeIdVal = selAttendee ? selAttendee.id : null;
    onPin(pinModalNoteId, pinConference || null, attendeeName, attendeeIdVal);
    setPinModalNoteId(null);
    setPinConference('');
    setPinAttendeeId('');
  };

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-brand-primary font-serif">Notes</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-sm text-brand-primary hover:text-brand-primary font-medium transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Add Note
          </button>
        )}
      </div>

      {isAdding && (
        <div className="mb-5 p-4 bg-blue-50 border border-brand-secondary rounded-xl">
          <div className="flex flex-wrap gap-3 mb-3">
            {/* Auto-detected entered by */}
            {user?.displayName && (
              <div className="w-full flex items-center gap-2 text-xs text-gray-500">
                <span className="font-semibold text-gray-600 uppercase tracking-wide">Entered By:</span>
                <span className="font-medium text-brand-primary">{user.displayName}</span>
              </div>
            )}

            {/* Tag User multiselect */}
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                Tag User
              </label>
              <RepMultiSelect
                options={userOptionsWithIds}
                selectedIds={taggedUserIds}
                onChange={setTaggedUserIds}
                triggerClass="input-field text-sm w-full flex items-center justify-between gap-2"
                placeholder="Tag a user to notify..."
              />
            </div>

            {conferences.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Conference
                </label>
                <select
                  value={selectedConference}
                  onChange={e => setSelectedConference(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="">Select Conference (if applicable)</option>
                  {conferences.map(conf => (
                    <option key={conf.id} value={conf.name}>{conf.name}</option>
                  ))}
                </select>
              </div>
            )}

            {entityType === 'conference' && companies.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Company
                </label>
                <select
                  value={selectedCompanyId}
                  onChange={e => { setSelectedCompanyId(e.target.value); setSelectedAttendeeId(''); }}
                  className="input-field text-sm w-full"
                >
                  <option value="">Select Company (if applicable)</option>
                  {companies.map(comp => (
                    <option key={comp.id} value={comp.id}>{comp.name}</option>
                  ))}
                </select>
              </div>
            )}

            {(entityType === 'conference' || entityType === 'company') && attendees.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Attendee
                </label>
                <select
                  value={selectedAttendeeId}
                  onChange={e => setSelectedAttendeeId(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="">Select Attendee (if applicable)</option>
                  {filteredAttendees.map(att => (
                    <option key={att.id} value={att.id}>{att.first_name} {att.last_name}{att.company_name ? ` (${att.company_name})` : ''}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <MentionTextarea
            value={noteText}
            onChange={setNoteText}
            onMentionAdd={handleMentionAdd}
            userOptions={userOptionsWithIds}
            className="input-field resize-none w-full text-sm"
            placeholder="Enter your note... (type @ to mention a user)"
            rows={5}
            autoFocus
          />

          {onPin && (entityType === 'attendee' || entityType === 'company') && (
            <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinOnSubmit}
                onChange={e => setPinOnSubmit(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 text-brand-highlight focus:ring-brand-highlight"
              />
              <svg className="w-4 h-4 text-brand-highlight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
              <span className="text-sm font-medium text-gray-700">Pin Note?</span>
            </label>
          )}
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="btn-primary text-sm"
            >
              {isSubmitting ? 'Saving...' : 'Submit'}
            </button>
            <button
              type="button"
              onClick={() => {
                setIsAdding(false);
                setNoteText('');
                setTaggedUserIds([]);
                setSelectedConference('');
                setSelectedCompanyId('');
                setSelectedAttendeeId('');
                setPinOnSubmit(false);
              }}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {notes.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-6">No notes yet. Click &quot;Add Note&quot; to get started.</p>
      ) : (
        <div className="space-y-3">
          {notes.map(note => {
            const expanded = expandedIds.has(note.id);
            const long = isLongNote(note.content);
            const repInitials = (() => {
              if (!note.rep) return null;
              if (note.rep.includes('@')) {
                const u = note.rep.split('@')[0];
                return ((u[0] || '') + (u[1] || '')).toUpperCase() || null;
              }
              return note.rep.split(/\s+/).filter(Boolean).map(p => p.charAt(0).toUpperCase()).join('') || null;
            })();

            // Resolve tagged users
            const taggedIds = note.tagged_users
              ? note.tagged_users.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n) && n > 0)
              : [];
            const taggedNames = taggedIds
              .map(id => userOptionsWithIds.find(u => u.id === id)?.value)
              .filter(Boolean) as string[];

            return (
              <div key={note.id} className="rounded-xl border border-gray-100 p-4 hover:border-gray-200 hover:shadow-sm transition-all">
                {/* Meta row */}
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <span className="text-xs text-gray-400 whitespace-nowrap">{formatDateTime(note.created_at)}</span>
                    {note.conference_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary text-xs font-medium border border-blue-100 whitespace-nowrap">
                        {note.conference_name}
                      </span>
                    )}
                    {note.attendee_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-xs font-medium border border-emerald-200 whitespace-nowrap">
                        {note.attendee_name}
                      </span>
                    )}
                    {note.company_name && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium border border-teal-200 whitespace-nowrap">
                        {note.company_name}
                      </span>
                    )}
                    {/* Tagged users pills */}
                    {taggedNames.map(name => (
                      <span
                        key={name}
                        className="inline-flex items-center justify-center px-2 py-0.5 rounded-full bg-violet-50 text-violet-700 text-xs font-medium border border-violet-200 whitespace-nowrap"
                        title={`@${name}`}
                      >
                        @{getRepInitials(name)}
                      </span>
                    ))}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {repInitials && (
                      <span
                        className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[10px] font-bold flex-shrink-0 ${getPreset(colorMaps.user?.[note.rep ?? '']).badgeClass}`}
                        title={note.rep || undefined}
                      >
                        {repInitials}
                      </span>
                    )}
                    {showPinnedIndicator && pinnedNoteIds.has(note.id) && (
                      <span className="text-brand-highlight flex-shrink-0" title="Pinned in Company or Attendee details">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                        </svg>
                      </span>
                    )}
                    {onPin && (entityType === 'attendee' || entityType === 'company') && (
                      <button
                        type="button"
                        onClick={() => handlePinClick(note.id)}
                        className={`transition-colors flex-shrink-0 ${pinnedNoteIds.has(note.id) ? 'text-brand-highlight' : 'text-gray-300 hover:text-brand-highlight'}`}
                        title={pinnedNoteIds.has(note.id) ? 'Already pinned' : 'Pin note'}
                        disabled={pinnedNoteIds.has(note.id)}
                      >
                        <svg className="w-4 h-4" fill={pinnedNoteIds.has(note.id) ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24" strokeWidth={pinnedNoteIds.has(note.id) ? 0 : 2}>
                          <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                {/* Note body */}
                <p className={`text-sm text-gray-800 whitespace-pre-wrap leading-relaxed break-words ${!expanded && long ? 'line-clamp-4' : ''}`}>
                  {note.content}
                </p>
                {long && (
                  <button
                    type="button"
                    onClick={() => toggleExpand(note.id)}
                    className="mt-2 text-xs text-brand-secondary hover:underline font-medium"
                  >
                    {expanded ? 'Show Less' : 'Show Full Note'}
                  </button>
                )}
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    onClick={() => handleDelete(note.id)}
                    className="text-gray-300 hover:text-red-500 transition-colors flex-shrink-0"
                    title="Delete note"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pin modal */}
      {pinModalNoteId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => { setPinModalNoteId(null); setPinConference(''); setPinAttendeeId(''); }}>
          <div className="bg-white rounded-xl shadow-2xl border border-brand-highlight p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-brand-primary font-serif mb-4">
              Pin Note
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Conference {entityType === 'attendee' ? '*' : '(optional)'}
                </label>
                <select
                  value={pinConference}
                  onChange={e => setPinConference(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="">{entityType === 'attendee' ? 'Select a conference...' : 'None (General Note)'}</option>
                  {conferences.map(conf => (
                    <option key={conf.id} value={conf.name}>{conf.name}</option>
                  ))}
                </select>
              </div>
              {entityType === 'company' && attendees.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                    Attendee (optional)
                  </label>
                  <select
                    value={pinAttendeeId}
                    onChange={e => setPinAttendeeId(e.target.value)}
                    className="input-field text-sm w-full"
                  >
                    <option value="">None</option>
                    {attendees.map(att => (
                      <option key={att.id} value={att.id}>{att.first_name} {att.last_name}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                type="button"
                onClick={handlePinSubmit}
                className="btn-primary text-sm flex-1"
              >
                Pin Note
              </button>
              <button
                type="button"
                onClick={() => { setPinModalNoteId(null); setPinConference(''); setPinAttendeeId(''); }}
                className="btn-secondary text-sm"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
