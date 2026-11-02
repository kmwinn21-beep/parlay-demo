/**
 * The address a public conference form is handed out at.
 *
 * One definition, because two places now offer the same link — the Forms tab,
 * where the link is generated, and a social event's action menu, where the
 * form that collects its RSVPs can be copied without going to find it. The
 * shape of the link is not obvious from either call site (the account id is
 * part of it: app/forms reads `aid` to know which tenant database to open),
 * and a second hand-written copy of it would be a link that works until one of
 * them is changed.
 *
 * Browser-only: the origin comes from `window`, so this is called from a
 * client component or an event handler, never during a server render.
 */
export function publicFormUrl(token: string | null | undefined, accountId: string | null | undefined): string {
  if (!token) return '';
  // 'master' is the single-account installation, which has no account row of
  // its own — the same fallback the forms tab has always used.
  return `${window.location.origin}/forms?token=${token}&aid=${accountId || 'master'}`;
}
