/**
 * Where to send somebody who wants a company's site and has no link for it.
 *
 * A record with no website is the common case on a company added from a badge
 * scan or a spreadsheet — there is a name and nothing else. The name is enough
 * to go looking, and a search is a far better answer than a button that is not
 * there.
 *
 * URLSearchParams rather than encodeURIComponent: it encodes a space as `+`,
 * which is what a search URL looks like when a person copies one out of the
 * address bar. encodeURIComponent would give `%20` — the same page, but not
 * the same string, and the difference shows up in every screenshot.
 */
export function companySearchUrl(name: string): string | null {
  const q = String(name ?? '').trim();
  // Nothing to search for. The caller renders no button rather than sending
  // somebody to an empty results page.
  if (!q) return null;
  return `https://www.google.com/search?${new URLSearchParams({ q })}`;
}

/**
 * A stored website as a URL that will actually resolve.
 *
 * The column holds whatever was typed or imported, and "lifespace.com" with no
 * scheme is an ordinary thing to find in it. Left alone, the browser reads it
 * as a path relative to the current page.
 */
export function companyWebsiteUrl(website: string | null | undefined): string | null {
  const raw = String(website ?? '').trim();
  if (!raw) return null;
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
