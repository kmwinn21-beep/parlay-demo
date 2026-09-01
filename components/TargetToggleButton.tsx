'use client';

/**
 * Make someone a target for a conference, or stop.
 *
 * Targeting already happens in a dedicated tab and in the dashboard drawer,
 * which are the places to plan it. This is the one-click version for the places
 * where a rep is reading the room — the attendees table, a company's attendee
 * list — where the decision is made about a single person in passing and
 * walking to another tab to record it is the whole cost.
 *
 * Red when they are a target, grey when they aren't. It is a toggle in both
 * directions: the same click that adds them takes them off again, because the
 * common correction to a mis-tap is immediate.
 */
export function TargetToggleButton({ active, busy = false, onToggle, size = 'md', name }: {
  active: boolean;
  busy?: boolean;
  onToggle: () => void;
  /** `sm` sits in a row of pills; `md` in a table cell or a card's badge row. */
  size?: 'sm' | 'md';
  /** The attendee's name, for the tooltip and the accessible label. */
  name?: string;
}) {
  const box = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const icon = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const label = active
    ? `Remove ${name ?? 'this attendee'} as a target`
    : `Add ${name ?? 'this attendee'} as a target`;

  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); if (!busy) onToggle(); }}
      disabled={busy}
      aria-pressed={active}
      title={label}
      aria-label={label}
      className={`inline-flex items-center justify-center ${box} rounded-full flex-shrink-0 transition-colors disabled:opacity-60 ${
        active
          ? 'bg-red-100 hover:bg-red-200 text-red-500'
          : 'bg-gray-100 hover:bg-gray-200 text-gray-400 hover:text-gray-500'
      }`}
    >
      <svg className={icon} fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="4" />
        <line x1="12" y1="2" x2="12" y2="6" />
        <line x1="12" y1="18" x2="12" y2="22" />
        <line x1="2" y1="12" x2="6" y2="12" />
        <line x1="18" y1="12" x2="22" y2="12" />
      </svg>
    </button>
  );
}
