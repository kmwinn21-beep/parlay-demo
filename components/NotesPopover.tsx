'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

function formatNoteDate(dt: string) {
  const d = new Date(dt);
  if (isNaN(d.getTime())) return dt;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function NotesPopover({ attendeeId, notesCount }: { attendeeId: number; notesCount: number }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState<{ id: number; content: string; created_at: string }[]>([]);
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
      .then((data: { id: number; content: string; created_at: string }[]) => {
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
        className="flex items-center gap-1 text-gray-400 hover:text-procare-bright-blue transition-colors"
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
                className="text-xs text-procare-bright-blue hover:underline font-medium"
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
                        <td className="px-4 py-2.5 text-gray-400 whitespace-nowrap w-28">{formatNoteDate(note.created_at)}</td>
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
