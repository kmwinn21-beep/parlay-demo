'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { NotesSection, type EntityNote } from './NotesSection';

/**
 * Notes for one social event, in the same right-edge drawer shape the rest of
 * the app uses: a resizable panel on desktop (300px by default) and a
 * bottom-up sheet below sm. The body is the shared NotesSection, so @mentions
 * and per-note comment threads come along with it.
 */
export function SocialEventNotesDrawer({
  eventId, eventName, conferenceName, onClose, onCountChange,
}: {
  eventId: number;
  eventName: string;
  conferenceName: string;
  onClose: () => void;
  onCountChange?: (eventId: number, count: number) => void;
}) {
  const [mounted, setMounted] = useState(false);
  const [notes, setNotes] = useState<EntityNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(300);
  const widthRef = useRef(300);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/notes?entity_type=social_event&entity_id=${eventId}`)
      .then(res => (res.ok ? res.json() : []))
      .then((data: EntityNote[]) => {
        if (cancelled) return;
        const rows = Array.isArray(data) ? data : [];
        setNotes(rows);
        onCountChange?.(eventId, rows.length);
      })
      .catch(() => { if (!cancelled) toast.error('Failed to load notes.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // onCountChange is a parent callback; refetching on its identity would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
  }, [onClose]);

  // Desktop drag-to-resize from the drawer's left edge.
  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    const onMove = (ev: MouseEvent) => {
      const next = Math.min(720, Math.max(280, startWidth + (startX - ev.clientX)));
      widthRef.current = next;
      setWidth(next);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex flex-col justify-end sm:flex-row sm:justify-end bg-black/40" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={typeof window !== 'undefined' && window.innerWidth >= 640 ? { width } : undefined}
        className="drawer-mobile-responsive relative bg-white w-full h-[90vh] rounded-t-2xl flex flex-col shadow-2xl sm:h-full sm:rounded-none sm:rounded-l-2xl"
      >
        {/* Resize handle — desktop only; the mobile sheet is full width. */}
        <div
          onMouseDown={startResize}
          className="hidden sm:block absolute left-0 top-0 h-full w-1 cursor-col-resize hover:bg-brand-secondary/30 transition-colors"
          title="Drag to resize"
        />

        <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Event Notes</p>
            <h3 className="text-sm font-semibold text-brand-primary truncate">{eventName}</h3>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors flex-shrink-0 p-1" title="Close">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-4 py-3">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <span className="animate-spin w-5 h-5 border-2 border-brand-secondary border-t-transparent rounded-full inline-block" />
            </div>
          ) : (
            <NotesSection
              entityType="social_event"
              entityId={eventId}
              initialNotes={notes}
              currentConferenceName={conferenceName}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
