'use client';

import { useCallback, useRef, useState } from 'react';
import { NotesPopoverCard } from '@/components/NotesPopoverCard';

/**
 * A follow-up row's note count, and the notes card it opens. The card itself is
 * shared with the meetings table — this is only the trigger.
 */
export function FollowUpNotesPopover({
  attendeeId,
  notesCount,
  conferenceName,
}: {
  attendeeId: number;
  notesCount: number;
  conferenceName?: string;
}) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const [totalCount, setTotalCount] = useState(notesCount);
  const btnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setAnchor(null), []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setAnchor(a => (a ? null : btnRef.current!.getBoundingClientRect()))}
        className="flex items-center gap-1 text-gray-400 hover:text-brand-secondary transition-colors"
        title={`${totalCount} note${totalCount !== 1 ? 's' : ''}`}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h6m-6 4h10M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2z" />
        </svg>
        <span className="text-xs font-medium">{totalCount}</span>
      </button>

      {anchor && (
        <NotesPopoverCard
          attendeeId={attendeeId}
          conferenceName={conferenceName}
          anchor={anchor}
          onClose={close}
          onCountChange={setTotalCount}
        />
      )}
    </>
  );
}
