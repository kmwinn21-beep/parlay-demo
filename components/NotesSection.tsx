'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';

export interface EntityNote {
  id: number;
  entity_type: string;
  entity_id: number;
  content: string;
  created_at: string;
  company_name?: string;
  conference_name?: string | null;
  rep?: string | null;
}

function formatDateTime(dt: string) {
  const d = new Date(dt);
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

// A note is "long" if it exceeds ~300 chars or 4 newlines
function isLongNote(content: string) {
  return content.length > 300 || content.split('\n').length > 4;
}

// Render note content with hyperlinked bracketed names
function NoteContent({ content }: { content: string }) {
  // Match patterns like [Name] or [Name / Company]
  const parts = content.split(/(\[[^\]]+\])/g);
  return (
    <>
      {parts.map((part, i) => {
        const bracketMatch = part.match(/^\[([^\]]+)\]$/);
        if (!bracketMatch) return <span key={i}>{part}</span>;
        const inner = bracketMatch[1];
        // Check if it's [Attendee Name / Company Name] format
        const slashParts = inner.split(' / ');
        if (slashParts.length === 2) {
          return (
            <span key={i} className="text-procare-bright-blue font-medium">
              [{slashParts[0]} / {slashParts[1]}]
            </span>
          );
        }
        // Single name in brackets
        return (
          <span key={i} className="text-procare-bright-blue font-medium">
            [{inner}]
          </span>
        );
      })}
    </>
  );
}

export function NotesSection({
  entityType,
  entityId,
  initialNotes = [],
  parentEntityId,
  conferences = [],
  companies = [],
  attendees = [],
  // Context about the current entity for cross-posting
  currentAttendeeName,
  currentCompanyName,
  currentCompanyId,
  currentAttendeeId,
  currentConferenceName,
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
}) {
  const [notes, setNotes] = useState<EntityNote[]>(initialNotes);
  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  // Sync notes when initialNotes prop changes (e.g. after parent fetch completes)
  useEffect(() => {
    setNotes(initialNotes);
  }, [initialNotes]);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedConference, setSelectedConference] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [selectedAttendeeId, setSelectedAttendeeId] = useState('');

  useEffect(() => {
    fetch('/api/config?category=user')
      .then(res => res.json())
      .then((data: { value: string }[]) => {
        const users = data.map((d) => d.value);
        setUserOptions(users);
      })
      .catch(() => {});
  }, []);

  // Filter attendees by selected company when on conference notes
  const filteredAttendees = selectedCompanyId
    ? attendees.filter(a => String(a.company_id) === selectedCompanyId)
    : attendees;

  const handleSubmit = async () => {
    if (!noteText.trim()) { toast.error('Note cannot be empty.'); return; }
    setIsSubmitting(true);
    const content = noteText.trim();
    const conferenceName = selectedConference || (entityType === 'conference' ? currentConferenceName : '') || 'General Note';
    const repValue = selectedUser || null;

    try {
      // Resolve selected entities
      let selAttendee: (typeof attendees)[0] | undefined;
      let selCompany: (typeof companies)[0] | undefined;
      let selConf: (typeof conferences)[0] | undefined;
      let attendeeLabel = '';
      let companyLabel = '';

      if (entityType === 'conference') {
        selCompany = companies.find(c => String(c.id) === selectedCompanyId);
        selAttendee = filteredAttendees.find(a => String(a.id) === selectedAttendeeId);
        attendeeLabel = selAttendee ? `${selAttendee.first_name} ${selAttendee.last_name}` : '';
        companyLabel = selCompany ? selCompany.name : '';
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

      // Determine primary note content based on where it's being saved:
      // Conference page: [Attendee Name / Company] Note Body
      // Company page: [Attendee Name] Note Body
      // Attendee page: Note Body (plain)
      let primaryContent = content;
      if (entityType === 'conference' && selAttendee) {
        primaryContent = companyLabel
          ? `[${attendeeLabel} / ${companyLabel}] ${content}`
          : `[${attendeeLabel}] ${content}`;
      } else if (entityType === 'company' && selAttendee) {
        primaryContent = `[${attendeeLabel}] ${content}`;
      }
      // entityType === 'attendee': plain content (no prefix)

      // 1. Create the primary note with the correct content
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: entityType,
          entity_id: entityId,
          content: primaryContent,
          conference_name: conferenceName,
          rep: repValue,
        }),
      });
      if (!res.ok) throw new Error();
      const newNote: EntityNote = await res.json();
      setNotes(prev => [newNote, ...prev]);

      // 2. Cross-post based on entity type and selections
      // Rules for cross-posted notes:
      //   Conference notes: [Attendee Name / Company] Note Body
      //   Company notes: [Attendee Name] Note Body
      //   Attendee notes: Note Body (plain)
      const crossPostPromises: Promise<unknown>[] = [];

      if (entityType === 'company') {
        // Cross-post to conference: [Attendee / Company] format
        if (selConf) {
          const confContent = selAttendee
            ? (companyLabel ? `[${attendeeLabel} / ${companyLabel}] ${content}` : `[${attendeeLabel}] ${content}`)
            : content;
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'conference',
                entity_id: selConf.id,
                content: confContent,
                conference_name: conferenceName,
                rep: repValue,
              }),
            })
          );
        }

        // Cross-post to attendee: plain content
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
              }),
            })
          );
        }
      } else if (entityType === 'conference') {
        // Cross-post to company: [Attendee Name] format
        if (selCompany) {
          const companyContent = selAttendee ? `[${attendeeLabel}] ${content}` : content;
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'company',
                entity_id: selCompany.id,
                content: companyContent,
                conference_name: conferenceName,
                rep: repValue,
              }),
            })
          );
        }

        // Cross-post to attendee: plain content
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
              }),
            })
          );
        }
      } else if (entityType === 'attendee') {
        // Cross-post to company: [Attendee Name] format
        const companyId = currentCompanyId;
        if (companyId) {
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'company',
                entity_id: companyId,
                content: `[${attendeeLabel}] ${content}`,
                conference_name: conferenceName,
                rep: repValue,
              }),
            })
          );
        }

        // Cross-post to conference: [Attendee Name / Company] format
        if (selConf) {
          const confPrefix = companyLabel
            ? `[${attendeeLabel} / ${companyLabel}]`
            : `[${attendeeLabel}]`;
          crossPostPromises.push(
            fetch('/api/notes', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'conference',
                entity_id: selConf.id,
                content: `${confPrefix} ${content}`,
                conference_name: conferenceName,
                rep: repValue,
              }),
            })
          );
        }
      }

      // Execute all cross-posts (fire and forget, don't block the user)
      if (crossPostPromises.length > 0) {
        await Promise.allSettled(crossPostPromises);
      }

      setNoteText('');
      setSelectedUser('');
      setSelectedConference('');
      setSelectedCompanyId('');
      setSelectedAttendeeId('');
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

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-procare-dark-blue font-serif">Notes</h2>
        {!isAdding && (
          <button
            type="button"
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 text-sm text-procare-bright-blue hover:text-procare-dark-blue font-medium transition-colors"
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
        <div className="mb-5 p-4 bg-blue-50 border border-procare-bright-blue rounded-xl">
          <div className="flex flex-wrap gap-3 mb-3">
            {userOptions.length > 0 && (
              <div className="flex-1 min-w-[200px]">
                <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1">
                  Entered By
                </label>
                <select
                  value={selectedUser}
                  onChange={e => setSelectedUser(e.target.value)}
                  className="input-field text-sm w-full"
                >
                  <option value="">Select user...</option>
                  {userOptions.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
              </div>
            )}
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
            {/* Company dropdown for conference notes */}
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
            {/* Attendee dropdown for conference and company notes */}
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
            {/* Company dropdown for company notes - for attendee association */}
            {entityType === 'company' && conferences.length === 0 && companies.length === 0 && null}
          </div>
          <textarea
            value={noteText}
            onChange={e => setNoteText(e.target.value)}
            placeholder="Enter your note..."
            className="input-field resize-none w-full text-sm"
            rows={5}
            autoFocus
          />
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
              onClick={() => { setIsAdding(false); setNoteText(''); setSelectedUser(''); setSelectedConference(''); setSelectedCompanyId(''); setSelectedAttendeeId(''); }}
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200">
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-normal w-44">
                  Date / Time
                </th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-24">
                  Conference
                </th>
                <th className="px-2 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider whitespace-normal w-12">
                  Rep
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
                  Note
                </th>
                <th className="px-4 py-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {notes.map(note => {
                const expanded = expandedIds.has(note.id);
                const long = isLongNote(note.content);
                return (
                  <tr key={note.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-xs text-gray-500 whitespace-normal w-44">
                      {formatDateTime(note.created_at)}
                    </td>
                    <td className="px-2 py-3 text-xs text-gray-600 w-24 break-words">
                      {note.conference_name || '—'}
                    </td>
                    <td className="px-2 py-3 text-xs text-gray-600 whitespace-normal w-12 text-center" title={note.rep || undefined}>
                      {note.rep ? note.rep.split(' ').map(n => n.charAt(0).toUpperCase()).join('') : '—'}
                    </td>
                    <td className="px-4 py-3 text-gray-800">
                      {parentEntityId && note.entity_id !== parentEntityId && note.company_name && (
                        <span className="inline-block text-[10px] font-semibold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5 mb-1">
                          {note.company_name}
                        </span>
                      )}
                      <p className={`whitespace-pre-wrap leading-relaxed break-words ${!expanded && long ? 'line-clamp-4' : ''}`}>
                        <NoteContent content={note.content} />
                      </p>
                      {long && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(note.id)}
                          className="mt-1 text-xs text-procare-bright-blue hover:underline font-medium"
                        >
                          {expanded ? 'Show Less' : 'Show Full Note'}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => handleDelete(note.id)}
                        className="text-gray-300 hover:text-red-500 transition-colors"
                        title="Delete note"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
