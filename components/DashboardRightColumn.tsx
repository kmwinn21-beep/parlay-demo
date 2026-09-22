'use client';

import { useState } from 'react';
import { DashboardFeed } from '@/components/DashboardFeed';
import { PendingReviewSection } from '@/components/PendingReviewSection';

/**
 * The dashboard's right-hand column, shared between the Feed and the queue.
 *
 * The Feed used to be the whole column, taking its height from the two cards
 * to its left. Pending Review needs somewhere to live and nothing else on the
 * dashboard has room, so the column divides: the Feed keeps most of it and
 * gives up the rest.
 *
 * Expanding the Feed takes the space back and hides the queue rather than
 * scrolling it out of sight — the two are alternatives, not a stack. That is
 * also what keeps the column's total height fixed: it is still the height of
 * Floor Notes plus Targets, however it is divided.
 *
 * Below lg none of this applies. There is no column to divide, both cards
 * stack at their own heights, and the Feed's own mobile cap still governs it.
 */
export function DashboardRightColumn() {
  const [expanded, setExpanded] = useState(false);
  /**
   * How many suggestions the queue found, or null before it has looked.
   *
   * The Feed only needs to surrender space when something is waiting for it.
   * With an empty queue the column is the Feed, exactly as it was, and there
   * is no button offering to expand something already at full height.
   */
  const [pending, setPending] = useState<number | null>(null);
  const sharing = pending !== null && pending > 0 && !expanded;

  return (
    <div className="flex flex-col gap-6 lg:absolute lg:inset-0 lg:min-h-0">
      <DashboardFeed
        className={`max-h-[70vh] lg:max-h-none lg:min-h-0 lg:transition-[height] lg:duration-300 lg:ease-out ${
          sharing ? 'lg:h-[58%]' : 'lg:h-full'
        }`}
        footer={pending !== null && pending > 0 ? (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-expanded={expanded}
            className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:border-gray-300 hover:bg-gray-50 transition-colors"
          >
            {expanded ? 'Collapse Feed' : 'Expand Feed'}
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        ) : undefined}
      />

      {/* Kept mounted while the Feed is expanded, only not shown: unmounting
          would throw away the fetch and the open card, so collapsing again
          would reload and forget which company was being worked through. */}
      <div className={expanded ? 'hidden' : 'contents'}>
        <PendingReviewSection
          className="lg:min-h-0 lg:flex-1"
          onCount={setPending}
        />
      </div>
    </div>
  );
}
