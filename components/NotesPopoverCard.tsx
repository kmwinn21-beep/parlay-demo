'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { useUser } from '@/components/UserContext';

function formatNoteDate(dt: string) {
  const d = new Date(dt.endsWith('Z') || dt.includes('+') ? dt : dt + 'Z');
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function NoteRowTooltip({ rep, conferenceName }: { rep?: string | null; conferenceName?: string | null }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number; above: boolean } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const hasContent = rep || conferenceName;

  const handleMouseEnter = () => {
    if (!ref.current || !hasContent) return;
    const rect = ref.current.getBoundingClientRect();
    const w = Math.min(220, window.innerWidth - 16);
    const left = Math.max(8, Math.min(rect.left + rect.width / 2 - w / 2, window.innerWidth - w - 8));
    const above = rect.top > 140;
    setPos({ top: above ? rect.top - 8 : rect.bottom + 8, left, width: w, above });
  };

  if (!hasContent) return null;

  return (
    <div ref={ref} className="relative inline-block" onMouseEnter={handleMouseEnter} onMouseLeave={() => setPos(null)} onClick={handleMouseEnter}>
      <button type="button" className="text-gray-400 hover:text-brand-secondary transition-colors" title="Note Info">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      </button>
      {pos && (
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10001, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
          <div className="bg-gray-900 text-white text-xs rounded-lg shadow-xl px-3 py-2.5 space-y-2">
            {rep && (
              <div>
                <p className="font-semibold mb-1 text-gray-300 uppercase tracking-wide text-[10px]">Rep</p>
                <p className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{rep}</p>
              </div>
            )}
            {conferenceName && (
              <div>
                <p className="font-semibold mb-1 text-gray-300 uppercase tracking-wide text-[10px]">Conference</p>
                <p className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />{conferenceName}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export interface PopoverNote {
  id: number;
  content: string;
  created_at: string;
  conference_name?: string | null;
  rep?: string | null;
}

/**
 * The notes card itself — the list, the Add New Note form, and the link out to
 * the attendee's record. It positions itself against whatever opened it and
 * renders in a portal, so a row inside a sticky or scrolling container can't
 * clip it.
 *
 * Scoped to one conference when `conferenceName` is given: the card hangs off a
 * single row, so the attendee's notes from other conferences aren't what the
 * user clicked into.
 */
export function NotesPopoverCard({
  attendeeId, conferenceName, anchor, onClose, onCountChange,
}: {
  attendeeId: number;
  conferenceName?: string;
  /** Viewport rect of the control that opened the card. */
  anchor: DOMRect;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const [notes, setNotes] = useState<PopoverNote[]>([]);
  const [loading, setLoading] = useState(true);
  const cardRef = useRef<HTMLDivElement>(null);

  const [isAdding, setIsAdding] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedConference, setSelectedConference] = useState(conferenceName || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pinOnSubmit, setPinOnSubmit] = useState(false);
  const [userOptions, setUserOptions] = useState<string[]>([]);
  const [conferences, setConferences] = useState<{ id: number; name: string }[]>([]);
  const { user } = useUser();

  // Held in a ref: callers pass an inline arrow, so depending on its identity
  // would restart the fetch every time reporting a count re-rendered them.
  const countCb = useRef(onCountChange);
  useEffect(() => { countCb.current = onCountChange; });

  const report = useCallback((rows: PopoverNote[]) => {
    setNotes(rows);
    countCb.current?.(rows.length);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/notes?entity_type=attendee&entity_id=${attendeeId}`)
      .then(r => r.json())
      .then((data: PopoverNote[]) => {
        if (cancelled) return;
        const rows = conferenceName
          ? data.filter(n => (n.conference_name ?? '') === conferenceName)
          : data;
        report(rows);
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attendeeId, conferenceName, report]);

  // Only needed once the form is open, so it isn't fetched for a card that's
  // only being read.
  useEffect(() => {
    if (!isAdding) return;
    fetch('/api/config?category=user&form=follow_ups_page')
      .then(res => res.json())
      .then((data: { value: string }[]) => setUserOptions(data.map(d => d.value)))
      .catch(() => {});
    fetch(`/api/attendees/${attendeeId}`)
      .then(res => res.json())
      .then((data: { conferences?: { id: number; name: string }[] }) => {
        if (data.conferences) setConferences(data.conferences);
      })
      .catch(() => {});
  }, [isAdding, attendeeId]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (cardRef.current && !cardRef.current.contains(e.target as Node)) onClose();
    };
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    // A frame's grace, or the same click that opened the card closes it again.
    const id = setTimeout(() => document.addEventListener('mousedown', onDown), 0);
    document.addEventListener('keydown', onEsc);
    return () => {
      clearTimeout(id);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onEsc);
    };
  }, [onClose]);

  const handleSubmitNote = async () => {
    if (!noteText.trim()) { toast.error('Note cannot be empty.'); return; }
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: 'attendee',
          entity_id: attendeeId,
          content: noteText.trim(),
          conference_name: selectedConference || 'General Note',
          rep: selectedUser || null,
        }),
      });
      if (!res.ok) throw new Error();
      const newNote: PopoverNote = await res.json();
      report([newNote, ...notes]);

      if (pinOnSubmit && user?.email) {
        try {
          const pinConfName = selectedConference && selectedConference !== 'General Note' ? selectedConference : null;
          await fetch('/api/pinned-notes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              note_id: newNote.id,
              entity_type: 'attendee',
              entity_id: attendeeId,
              pinned_by: user.email,
              conference_name: pinConfName,
            }),
          });
        } catch { /* non-fatal */ }
      }

      setNoteText('');
      setSelectedUser('');
      setSelectedConference(conferenceName || '');
      setPinOnSubmit(false);
      setIsAdding(false);
      toast.success('Note saved.');
    } catch {
      toast.error('Failed to save note.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Above the control by default, the way a row at the bottom of a table wants
  // it; below when there isn't room up there.
  const PADDING = 8;
  const width = Math.min(480, window.innerWidth - PADDING * 2);
  const left = Math.max(PADDING, Math.min(anchor.left, window.innerWidth - width - PADDING));
  const above = anchor.top > 320;

  return createPortal(
    <div
      ref={cardRef}
      style={{
        position: 'fixed',
        top: above ? anchor.top : anchor.bottom + PADDING,
        left,
        width,
        transform: above ? 'translateY(calc(-100% - 8px))' : undefined,
        zIndex: 10000,
      }}
    >
      <div className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
          <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Notes {notes.length > 0 && `(${notes.length})`}
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setIsAdding(v => !v)}
              className="text-xs text-brand-secondary hover:text-brand-primary font-medium transition-colors flex items-center gap-1"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              Add New Note
            </button>
            <Link
              href={`/attendees/${attendeeId}`}
              className="text-xs text-brand-secondary hover:underline font-medium"
              onClick={onClose}
            >
              Open record →
            </Link>
          </div>
        </div>

        {isAdding && (
          <div className="px-4 py-3 bg-blue-50 border-b border-blue-200">
            <div className="flex flex-wrap gap-2 mb-2">
              {userOptions.length > 0 && (
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-0.5">Entered By</label>
                  <select
                    value={selectedUser}
                    onChange={e => setSelectedUser(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">Select user...</option>
                    {userOptions.map(u => <option key={u} value={u}>{u}</option>)}
                  </select>
                </div>
              )}
              {conferences.length > 0 && (
                <div className="flex-1 min-w-[140px]">
                  <label className="block text-[10px] font-semibold text-gray-600 uppercase tracking-wide mb-0.5">Conference</label>
                  <select
                    value={selectedConference}
                    onChange={e => setSelectedConference(e.target.value)}
                    className="w-full text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400"
                  >
                    <option value="">Select Conference (if applicable)</option>
                    {conferences.map(conf => <option key={conf.id} value={conf.name}>{conf.name}</option>)}
                  </select>
                </div>
              )}
            </div>
            <textarea
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              placeholder="Enter your note..."
              className="w-full text-xs border border-gray-300 rounded px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-blue-400 resize-none"
              rows={3}
              autoFocus
            />
            <label className="flex items-center gap-1.5 mt-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={pinOnSubmit}
                onChange={e => setPinOnSubmit(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-gray-300 text-brand-highlight focus:ring-brand-highlight"
              />
              <svg className="w-3.5 h-3.5 text-brand-highlight" fill="currentColor" viewBox="0 0 24 24">
                <path d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z" />
              </svg>
              <span className="text-xs font-medium text-gray-700">Pin Note?</span>
            </label>
            <div className="flex gap-2 mt-2">
              <button
                type="button"
                onClick={handleSubmitNote}
                disabled={isSubmitting}
                className="px-3 py-1 bg-brand-secondary text-white text-xs font-medium rounded hover:bg-brand-primary transition-colors disabled:opacity-50"
              >
                {isSubmitting ? 'Saving...' : 'Submit'}
              </button>
              <button
                type="button"
                onClick={() => { setIsAdding(false); setNoteText(''); setSelectedUser(''); setSelectedConference(conferenceName || ''); setPinOnSubmit(false); }}
                className="px-3 py-1 bg-white text-gray-600 text-xs font-medium rounded border border-gray-300 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="overflow-y-auto max-h-64">
          {loading ? (
            <p className="text-sm text-gray-400 italic text-center py-6">Loading...</p>
          ) : notes.length === 0 && !isAdding ? (
            <p className="text-sm text-gray-400 italic text-center py-6">
              {conferenceName ? `No notes for ${conferenceName} yet.` : 'No notes yet.'} Click &quot;Add New Note&quot; to get started.
            </p>
          ) : notes.length === 0 ? null : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap w-28">Date</th>
                  <th className="px-4 py-2 text-left font-semibold text-gray-500 uppercase tracking-wider">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {notes.map(note => (
                  <tr key={note.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap w-28">
                      <div className="flex items-center gap-1.5">
                        {formatNoteDate(note.created_at)}
                        <NoteRowTooltip rep={note.rep} conferenceName={note.conference_name} />
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-gray-800 leading-snug whitespace-pre-wrap break-words">{note.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
