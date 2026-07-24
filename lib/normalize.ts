// Owner/rep-name normalization helpers, shared between
// app/api/conferences/[id]/attendees/upload/route.ts (multi-owner cells,
// e.g. "Jane Doe; John Smith") and app/api/admin/master-accounts/upload/route.ts
// (single-rep cells) so both features resolve uploaded rep names against the
// config_options('user')/users roster identically.

/** Strip accents/punctuation, lowercase, collapse whitespace. */
export function normalizeOwnerName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[,.'\u2019`-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalize to "first last" (middle names dropped) for name-index lookups. */
export function normalizeNameKey(value: string): string {
  const tokens = normalizeOwnerName(value).split(' ').filter(Boolean);
  if (tokens.length === 0) return '';
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

/** Normalize a "Last, First" formatted value to the same "first last" key shape. */
export function normalizeReversedNameKey(value: string): string {
  const v = value.trim();
  if (!v.includes(',')) return '';
  const parts = v.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length < 2) return '';
  const rejoined = `${parts.slice(1).join(' ')} ${parts[0]}`;
  return normalizeNameKey(rejoined);
}

/** Split a multi-owner cell (e.g. "Jane Doe; John Smith") into individual name tokens. */
export function splitOwnerTokens(raw: string): string[] {
  return raw
    .split(/\s*(?:;|\||\/|&|\band\b)\s*/i)
    .map(s => s.trim())
    .filter(Boolean);
}
