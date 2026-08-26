'use client';

/**
 * The "+" that adds a row to a collapsible section, sat at the right of the
 * header opposite the chevron.
 *
 * Deliberately its own button rather than part of the header's toggle: tapping
 * it should open the form, not collapse the section out from under it. It shows
 * in both states, so adding the first row doesn't mean expanding an empty
 * section first.
 */
export function SectionAddButton({ onClick, title }: { onClick: () => void; title: string }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={title}
      aria-label={title}
      className="flex-shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-xl border border-gray-200 text-brand-secondary hover:border-brand-secondary hover:bg-brand-secondary/5 transition-colors"
    >
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v14M5 12h14" />
      </svg>
    </button>
  );
}
