'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

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
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, zIndex: 10000, transform: pos.above ? 'translateY(-100%)' : 'translateY(0)' }}>
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

interface PopoverNote {
  id: number;
  content: string;
  created_at: string;
  conference_name?: string | null;
  rep?: string | null;
}

export function NotesPopover({ attendeeId, notesCount }: { attendeeId: number; notesCount: number }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<PopoverNote[]>([]);
  const [totalCount, setTotalCount] = useState(notesCount);
  const [loading, setLoading] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch(`/api/notes?entity_type=attendee&entity_id=${attendeeId}`)
      .then(r => r.json())
      .then((data: PopoverNote[]) => {
        setNotes(data);
        setTotalCount(data.length);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, attendeeId]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
        btnRef.current && !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const handleToggle = () => {
    if (!open && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const PADDING = 8;
      const cardWidth = Math.min(480, window.innerWidth - PADDING * 2);
      // Align card's left edge with button, but clamp so it never exits the viewport
      const left = Math.max(PADDING, Math.min(rect.left, window.innerWidth - cardWidth - PADDING));
      setPos({ top: rect.top, left, width: cardWidth });
    }
    setOpen(v => !v);
  };

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={handleToggle}
        className="flex items-center gap-1 text-gray-400 hover:text-brand-secondary transition-colors"
        title={`${totalCount} note${totalCount !== 1 ? 's' : ''}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-xs font-medium">{totalCount}</span>
      </button>

      {open && pos && (
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            transform: 'translateY(calc(-100% - 8px))',
            zIndex: 9999,
            width: pos.width,
          }}
        >
          <div className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <span className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
                Notes {totalCount > 0 && `(${totalCount})`}
              </span>
              <Link
                href={`/attendees/${attendeeId}`}
                className="text-xs text-brand-secondary hover:underline font-medium"
                onClick={() => setOpen(false)}
              >
                Open record →
              </Link>
            </div>
            <div className="overflow-y-auto max-h-64">
              {loading ? (
                <p className="text-sm text-gray-400 italic text-center py-6">Loading...</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-gray-400 italic text-center py-6">No notes yet.</p>
              ) : (
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
        </div>
      )}
    </>
  );
}
