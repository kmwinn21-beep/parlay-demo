'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ConferenceTimeline } from '@/components/ConferenceTimeline';

/**
 * One attendee's conference history, opened from the # Conf pill.
 *
 * The same timeline the attendee's own page carries, brought to the table so
 * the count can be read rather than only counted. Sort and the running count
 * come off: there is one record on screen and its heading already names them.
 *
 * A dialog on a desktop, a sheet rising from the bottom edge on a phone — the
 * shared `modal-sheet-mobile` animation, so it arrives the way every other
 * sheet in the app does.
 */
export function ConferenceTimelineDialog({ attendee, onClose }: {
  attendee: { id: number; first_name: string; last_name: string };
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  const lastInitial = attendee.last_name?.trim()?.[0];
  const who = `${attendee.first_name}${lastInitial ? ` ${lastInitial}.` : ''}`.trim();

  return createPortal(
    <div
      className="fixed inset-0 z-[200] bg-black/50 flex items-end sm:items-center justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        /* On a phone the sheet is a fixed 90vh — the same height the attendee
           and company drawers rise to. Sized to its contents it barely cleared
           the bottom edge for someone with two conferences, which read as a
           glitch rather than as a panel. On a desktop the dialog still takes
           only the room it needs. */
        className="modal-sheet-mobile bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl h-[90vh] sm:h-auto sm:max-h-[85vh] flex flex-col"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={`${who} - Conferences`}
      >
        <div className="px-5 pt-5 pb-3 border-b border-gray-100 flex items-start justify-between gap-3 flex-shrink-0">
          <h3 className="text-base font-semibold text-brand-primary font-serif">{who} - Conferences</h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* The list scrolls inside the sheet; nothing is collapsed, because the
            sheet is already sized to what it can show. */}
        <div className="px-5 py-4 overflow-y-auto flex-1">
          <ConferenceTimeline
            entityType="attendee"
            entityId={attendee.id}
            showSort={false}
            showCount={false}
            collapsible={false}
            chrome={false}
            /* The sheet's own heading names the section, so the timeline's
               would only repeat it. */
            title=""
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
