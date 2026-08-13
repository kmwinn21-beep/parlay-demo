'use client';

/**
 * Shared chrome for inline table-cell editing, so the Companies and Attendees
 * tables edit the same way. Modeled on the SF Owner rep picker: the field sits
 * inside its column at RepMultiSelect's trigger size with a small cancel button
 * beside it, rather than opening as a wide overlay across neighbouring columns.
 */

/**
 * Matches RepMultiSelect's default trigger styling. The min-width keeps the
 * selected value readable in narrow columns like Type and Seniority — without
 * it a native select in a ~90px cell renders "Operator" as "Ope". The cell
 * grows to fit, which is ordinary table behaviour and far less disruptive than
 * the absolutely-positioned overlay this replaced.
 */
export const INLINE_EDIT_FIELD_CLASS =
  'w-full min-w-[7.5rem] border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-secondary bg-white';

/**
 * Cancel affordance for an inline editor.
 *
 * These fields save on blur, and clicking a button blurs the field first — so
 * without intervention the cancel click would commit the very edit it is meant
 * to discard. preventDefault on mousedown keeps focus on the field so onClick
 * runs first; the same blur-race guard MentionTextarea uses for its suggestions.
 */
export function InlineEditCancelButton({ onCancel }: { onCancel: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={e => e.preventDefault()}
      onClick={onCancel}
      className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 rounded transition-colors"
      title="Cancel"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  );
}

/** Row wrapper: editor sized to the cell, cancel button pinned beside it. */
export function InlineEditRow({ onCancel, children }: { onCancel: () => void; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1">
      <div className="flex-1 min-w-0">{children}</div>
      <InlineEditCancelButton onCancel={onCancel} />
    </div>
  );
}

/** Placeholder shown in an empty cell, matching the SF Owner "+ Rep" affordance. */
export function InlineEditPlaceholder({ label }: { label: string }) {
  return (
    <span className="text-[10px] text-gray-300 hover:text-gray-400 transition-colors">+ {label}</span>
  );
}
