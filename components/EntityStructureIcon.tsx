/**
 * The parent/child marker that rides inside a company type pill.
 *
 * A company's place in a family is worth knowing wherever its type is shown —
 * on the company itself, and on the people who work there — so this lives on
 * its own rather than inside any one table.
 */
export function EntityStructureIcon({ structure }: { structure?: string | null }) {
  if (!structure) return null;
  if (structure === 'Parent') {
    return (
      <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
      </svg>
    );
  }
  if (structure === 'Child') {
    return (
      <svg className="w-3 h-3 inline-block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" />
      </svg>
    );
  }
  return null;
}
