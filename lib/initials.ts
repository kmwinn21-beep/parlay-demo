/** Derives "First + Last initial" from a display name (e.g. "Kevin Winn" -> "KW").
 * Server-safe counterpart to lib/useUserOptions.ts's getRepInitials (that file is
 * 'use client', so its export can't be imported from API routes). */
export function getInitials(name: string | null | undefined): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '??';
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Resolves a users row's display name, falling back through display_name -> first/last -> email. */
export function resolveUserDisplayName(row: Record<string, unknown>): string {
  if (row.display_name) return String(row.display_name);
  const full = [row.first_name, row.last_name].filter(Boolean).join(' ');
  if (full) return full;
  return row.email ? String(row.email) : 'Unknown User';
}
