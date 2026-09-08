'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';
import { RepMultiSelect } from '@/components/RepMultiSelect';
import { MentionTextarea } from '@/components/MentionTextarea';
import { useUserOptions } from '@/lib/useUserOptions';
import { NoteCard } from '@/components/NoteCard';
import { announceNoteSaved } from '@/lib/suggestions/announce';
import { FadeCollapse } from '@/components/CollapseAnimation';
import type { NoteCopy } from '@/lib/notes/copies';

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
  lets_talk?: number;
  author_user_id?: number | null;
  comment_count?: number;
  note_type?: string | null;
  meeting_id?: number | null;
  insight_counts?: string | null;
  /** Status/sentiment chosen when the note came from a Log Interaction capture. */
  status?: string | null;
  /** The touchpoint this note was captured alongside, for notes logged from
   *  the Log Touchpoint modal. Shown as a pill so the note says where it came
   *  from. */
  touchpoint_type?: string | null;
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
  onMeetingNoteClick,
  fadeCollapse = false,
}: {
  entityType: 'attendee' | 'company' | 'conference' | 'social_event';
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
  /**
   * Show the first couple of notes and fade the rest behind a chevron. Opt-in,
   * because the pages that give notes a column of their own want the whole list.
   */
  fadeCollapse?: boolean;
  pinnedNoteIds?: Set<number>;
  showPinnedIndicator?: boolean;
  onMeetingNoteClick?: (meetingId: number) => void;
}) {
  const [notes, setNotes] = useState<EntityNote[]>(initialNotes);
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinOnSubmit, setPinOnSubmit] = useState(false);

  const [pinModalNoteId, setPinModalNoteId] = useState<number | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: number; copies: NoteCopy[] } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [pinConference, setPinConference] = useState('');
  const [pinAttendeeId, setPinAttendeeId] = useState('');
  const { user } = useUser();
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
    const conferenceName = selectedConference
      || (entityType === 'conference' || entityType === 'social_event' ? currentConferenceName : '')
      || 'General Note';
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
      announceNoteSaved(entityType, entityId);
    } catch {
      toast.error('Failed to save note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Delete, once the scope is known.
   *
   * `all` reaches the copies of this note stored against the other records it
   * was written to; the default reaches this row alone.
   */
  const runDelete = async (id: number, scope: 'one' | 'all') => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/notes/${id}${scope === 'all' ? '?scope=all' : ''}`, { method: 'DELETE' });
      if (!res.ok) throw new Error();
      const data = await res.json().catch(() => ({ deleted: 1 }));
      setNotes(prev => prev.filter(n => n.id !== id));
      setDeleteTarget(null);
      toast.success(scope === 'all' && Number(data.deleted) > 1
        ? `Note deleted from ${data.deleted} records.`
        : 'Note deleted.');
    } catch {
      toast.error('Failed to delete note.');
    } finally {
      setDeleting(false);
    }
  };

  /**
   * The same note can live on the attendee, the company and the conference —
   * /api/notes writes one row per record. Deleting one used to leave the others
   * standing, so the note came back the moment you looked at a different page.
   * Ask which is meant, but only when there is actually something to ask about.
   */
  const handleDelete = async (id: number) => {
    let copies: NoteCopy[] = [];
    try {
      const res = await fetch(`/api/notes/${id}/copies`);
      if (res.ok) copies = (await res.json()).copies ?? [];
    } catch {
      // Falls through to the plain confirmation — the behaviour that existed
      // before this dialog did. A lookup that failed is not a reason to block
      // the delete.
    }
    if (copies.length === 0) {
      if (!confirm('Delete this note? This cannot be undone.')) return;
      await runDelete(id, 'one');
      return;
    }
    setDeleteTarget({ id, copies });
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
      ) : (() => {
        const list = (
          <div className="space-y-3">
            {notes.map(note => (
              <div key={note.id} data-collapse-row>
                <NoteCard
                  note={note}
                  entityType={entityType}
                  conferences={conferences}
                  onDelete={handleDelete}
                  onPin={onPin ? handlePinClick : undefined}
                  pinnedNoteIds={pinnedNoteIds}
                  showPinnedIndicator={showPinnedIndicator}
                  onMeetingNoteClick={onMeetingNoteClick}
                />
              </div>
            ))}
          </div>
        );
        return fadeCollapse ? <FadeCollapse rows={2}>{list}</FadeCollapse> : list;
      })()}

      {/* Delete scope modal — only ever shown when copies actually exist. */}
      {deleteTarget !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { if (!deleting) setDeleteTarget(null); }}
        >
          <div
            className="bg-white rounded-xl shadow-2xl border border-brand-highlight p-6 w-full max-w-md mx-4"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-note-scope-title"
          >
            <h3 id="delete-note-scope-title" className="text-lg font-semibold text-brand-primary font-serif mb-2">
              Delete Note
            </h3>
            <p className="text-sm text-gray-600">
              This note is also saved on {deleteTarget.copies.length === 1 ? 'another record' : `${deleteTarget.copies.length} other records`}:
            </p>
            <ul className="mt-2 mb-4 space-y-1">
              {deleteTarget.copies.map(copy => (
                <li key={copy.id} className="text-sm text-gray-800 flex items-baseline gap-2">
                  <span className="text-xs uppercase tracking-wide text-gray-500 shrink-0">{copy.entityType}</span>
                  <span className="font-medium">{copy.label}</span>
                </li>
              ))}
            </ul>
            <p className="text-xs text-gray-500 mb-5">This cannot be undone.</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => runDelete(deleteTarget.id, 'all')}
                className="btn-primary text-sm w-full disabled:opacity-60"
              >
                Delete from all {deleteTarget.copies.length + 1} records
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => runDelete(deleteTarget.id, 'one')}
                className="btn-secondary text-sm w-full disabled:opacity-60"
              >
                Delete only from this record
              </button>
              <button
                type="button"
                disabled={deleting}
                onClick={() => setDeleteTarget(null)}
                className="text-sm text-gray-500 hover:text-gray-700 py-1 disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
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
