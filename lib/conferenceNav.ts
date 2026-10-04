'use client';

import { fetchList } from '@/lib/apiFetch';

/**
 * The conference list behind the header's Go To menu, and the rules for when
 * it is re-read.
 *
 * Out of the Header component because the rules are a small state machine —
 * cached / in flight / recently failed — and none of it is visible in a
 * screenshot of the dropdown. It is also the file where a bug hid in plain
 * sight for a long time, which is reason enough for it to be testable.
 *
 * ── What went wrong ──────────────────────────────────────────────────────────
 *
 * The loader read `r.ok ? r.json() : []` and cached whatever came out. A bot
 * challenge — which answers with an HTML page, sometimes under a 200 — was
 * therefore stored as "this account has no conferences", and nothing ever
 * retried it, so the menu stayed empty for the rest of the session. The
 * dropdown said "No conferences found.", which is what an account with none
 * would say, so the failure was invisible.
 *
 * Three things follow from that, and they are what this file exists to keep
 * true: a failure is never cached, a failure is distinguishable from an empty
 * list, and a failure is retried — but not on every navigation, because
 * retrying hardest at the moment something is rate-limiting us is how a
 * stumble becomes a stampede.
 */

export interface ConferenceOption {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  internal_attendees?: string | null;
}

export interface ConferenceLoad {
  conferences: ConferenceOption[];
  /** The response was not a list. Not the same as a list with nothing in it. */
  failed: boolean;
}

/** How long to leave it before a route change retries a failed load. */
export const CONFS_RETRY_AFTER_MS = 10_000;

let _cache: ConferenceOption[] | null = null;
let _inFlight: Promise<ConferenceLoad> | null = null;
let _failedAt: number | null = null;

/**
 * Forget everything, including that the last attempt failed.
 *
 * The explicit ask: opening the menu, pressing Try again, or having just
 * created or deleted a conference. None of those should be answered out of a
 * cache, and none should be held off by the pause below.
 */
export function invalidateConferenceNav(): void {
  _cache = null;
  _inFlight = null;
  _failedAt = null;
}

/** Test seam: the clock, so the pause can be exercised without waiting. */
let _now: () => number = () => Date.now();
export function __setConferenceNavClock(now: () => number): void { _now = now; }

export function loadConferenceNav(): Promise<ConferenceLoad> {
  if (_cache) return Promise.resolve({ conferences: _cache, failed: false });
  if (_inFlight) return _inFlight;
  // Recently failed: report the failure again rather than asking again. The
  // menu's own retry clears this first, so a reader is never told to wait.
  if (_failedAt != null && _now() - _failedAt < CONFS_RETRY_AFTER_MS) {
    return Promise.resolve({ conferences: [], failed: true });
  }

  _inFlight = fetchList<ConferenceOption>('/api/conferences?nav=1')
    .then(({ items, failed }): ConferenceLoad => {
      if (failed) throw new Error('conferences: not a list');
      _cache = items;
      _inFlight = null;
      _failedAt = null;
      return { conferences: _cache, failed: false };
    })
    .catch((): ConferenceLoad => {
      _inFlight = null;
      _failedAt = _now();
      return { conferences: [], failed: true };
    });

  return _inFlight;
}
