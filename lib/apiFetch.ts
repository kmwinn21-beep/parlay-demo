'use client';

/**
 * Reading JSON from our own API, and noticing when what came back is not it.
 *
 * ── Why this exists ──────────────────────────────────────────────────────────
 *
 * Call sites across the app are written `r.ok ? r.json() : []`. That reads as
 * defensive, and it is the opposite: it converts every failure into a
 * plausible success. An empty list is a real answer, so "the request was
 * refused" and "there is nothing here" arrive as the same value and the UI
 * says the same thing about both.
 *
 * The host's bot protection makes that concrete. It answers with an HTML
 * interstitial — sometimes under a 200 — so a challenged request became an
 * empty list, got cached, and the Go To menu was empty for the rest of the
 * session while saying "No conferences found." Nothing looked broken.
 *
 * So: a reader that tells the three apart, and a way for the app to say out
 * loud that it is being challenged rather than quietly showing less.
 */

export type ResponseKind =
  /** Our API answered with JSON. */
  | 'ok'
  /** An interstitial — a bot check or a sign-in wall — not our API. */
  | 'challenged'
  /** Our API, but it said no. */
  | 'error';

/**
 * What a response is, from its envelope alone.
 *
 * Separate from the fetching so it can be run over every shape a challenge
 * takes without a network: a 403 carrying HTML, a 200 carrying HTML, and a
 * 200 whose JSON is not what the caller asked for.
 *
 * HTML is the tell. Our routes answer JSON on every path, errors included —
 * they are `NextResponse.json`, which sets application/json even for a 500 —
 * so an HTML body means something in front of the app answered instead of it.
 */
export function classifyResponse(res: { ok: boolean; status: number; contentType: string | null }): ResponseKind {
  const html = /text\/html/i.test(res.contentType ?? '');
  if (html) return 'challenged';
  // No content type at all, on a status the edge uses to turn traffic away.
  // Not 404 or 500: those are ours, and calling them a challenge would tell
  // the reader to reload at a page that will never load.
  if (!res.ok && !res.contentType && (res.status === 403 || res.status === 429)) return 'challenged';
  return res.ok ? 'ok' : 'error';
}

/* ─── Saying so ───────────────────────────────────────────────────────────── */

type Listener = () => void;
const listeners = new Set<Listener>();
let lastChallengeAt = 0;

/** Tell the app a challenge was seen, so it can say so once. */
export function noteChallenge(): void {
  lastChallengeAt = Date.now();
  listeners.forEach(l => { try { l(); } catch { /* a listener must not break a read */ } });
}

export function onChallenge(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** When the last challenge was seen, or 0. Exposed for the banner's own state. */
export function lastChallenge(): number { return lastChallengeAt; }

/* ─── Reading ─────────────────────────────────────────────────────────────── */

export interface JsonResult<T> {
  /** What came back, or null when nothing usable did. */
  data: T | null;
  /** Nothing usable came back — not the same as an empty list. */
  failed: boolean;
  kind: ResponseKind;
}

/**
 * Fetch JSON and report what happened, rather than standing in for it.
 *
 * `data` is null on anything other than a clean read, so a caller cannot
 * mistake a refusal for an empty result the way `r.ok ? r.json() : []` does.
 * A challenge is announced to whoever is listening on the way past.
 */
export async function fetchJson<T>(input: RequestInfo | URL, init?: RequestInit): Promise<JsonResult<T>> {
  let res: Response;
  try {
    res = await fetch(input, init);
  } catch {
    // Offline, DNS, a cancelled navigation. Ours to report, not to interpret.
    return { data: null, failed: true, kind: 'error' };
  }

  const kind = classifyResponse({
    ok: res.ok,
    status: res.status,
    contentType: res.headers.get('content-type'),
  });
  if (kind === 'challenged') noteChallenge();
  if (kind !== 'ok') return { data: null, failed: true, kind };

  try {
    return { data: (await res.json()) as T, failed: false, kind: 'ok' };
  } catch {
    // Said it was JSON and was not. Treated as a challenge rather than an
    // error: this is what an interstitial served with the wrong content type
    // looks like, and the reader's next step is the same either way.
    noteChallenge();
    return { data: null, failed: true, kind: 'challenged' };
  }
}

/**
 * The same read, for callers that want a list and a flag and nothing else.
 *
 * The empty array here is never cached as an answer by any caller using it —
 * `failed` is what they branch on. It exists so a list-rendering component
 * does not have to null-check on every line.
 */
export async function fetchList<T>(input: RequestInfo | URL, init?: RequestInit): Promise<{ items: T[]; failed: boolean }> {
  const { data, failed } = await fetchJson<T[]>(input, init);
  if (failed || !Array.isArray(data)) return { items: [], failed: true };
  return { items: data, failed: false };
}
