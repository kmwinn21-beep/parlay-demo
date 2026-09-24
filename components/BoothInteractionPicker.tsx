'use client';

import { useState } from 'react';
import { getPreset } from '@/lib/colors';
import { touchpointTag } from '@/lib/boothInteraction';
import { useTouchpointOptions } from '@/lib/useTouchpointOptions';

/** Rows shown before the rest fold behind the chevron. */
const VISIBLE_ROWS = 3;

/**
 * What happened, asked with the account's own touchpoint types.
 *
 * One component for all three places a badge can be scanned — floor notes, the
 * floating add button and the dashboard's action card. It was four hard-coded
 * buttons written out in each of them, which is three copies of a list that
 * was wrong for any account not working a booth.
 *
 * The options come from a shared hook rather than a prop. Two of the three
 * callers had no touchpoint list to hand, and a prop they each had to load is
 * a prop one of them eventually loads differently.
 */
export function BoothInteractionPicker({ onSelect, disabled }: {
  /**
   * The tag to store, or 'skip' for none, with the label that was on the
   * button. The label comes back because the caller's confirmation names it
   * and the caller does not otherwise hold the touchpoint list.
   */
  onSelect: (tag: string, label: string) => void;
  disabled?: boolean;
}) {
  const options = useTouchpointOptions();
  const [showAll, setShowAll] = useState(false);

  // Two per row, so three rows is six. The rest open on the chevron rather
  // than a scrollbar inside a card that is already inside a modal.
  // Counted off the collapsed slice, not the visible one. Measuring the
  // visible list makes hidden zero once expanded, and the toggle disappears
  // with it — expandable but not collapsible.
  const hidden = Math.max(0, options.length - VISIBLE_ROWS * 2);
  const visible = showAll ? options : options.slice(0, VISIBLE_ROWS * 2);

  return (
    <div className="pt-1">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Touchpoint Type</p>
      {options.length === 0 ? (
        <p className="text-xs text-gray-400 py-1">No touchpoint types configured.</p>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          {visible.map(opt => {
            const hex = getPreset(opt.color).hex;
            return (
              <button
                key={opt.id}
                type="button"
                disabled={disabled}
                onClick={() => onSelect(touchpointTag(opt.id), opt.value)}
                // Coloured on hover from the option's own colour, so the
                // buttons read as the same things they are on every other
                // surface that shows a touchpoint.
                className="px-2.5 py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-700 transition-colors disabled:opacity-50 text-center hover:bg-gray-50"
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = hex;
                  e.currentTarget.style.color = hex;
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '';
                  e.currentTarget.style.color = '';
                }}
              >
                {opt.value}
              </button>
            );
          })}
        </div>
      )}
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(v => !v)}
          aria-expanded={showAll}
          className="w-full mt-1.5 flex items-center justify-center gap-1 py-1 text-xs font-medium text-gray-400 hover:text-brand-secondary transition-colors"
        >
          {showAll ? 'Show fewer' : `${hidden} more`}
          <svg className={`w-4 h-4 transition-transform duration-200 ${showAll ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onSelect('skip', '')}
        className="w-full mt-1.5 text-xs text-gray-400 hover:text-gray-600 py-1.5 transition-colors disabled:opacity-50"
      >
        Skip
      </button>
    </div>
  );
}
