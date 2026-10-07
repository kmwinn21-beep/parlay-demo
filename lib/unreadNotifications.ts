'use client';

import { startPolling, stopPolling } from '@/lib/pollingManager';

/**
 * How many unread notifications there are — asked once, told to everyone.
 *
 * Two places wanted this number and each fetched it for itself: the bell in
 * the header, and the useUnreadNotificationCount hook behind the nav badge.
 * Same URL, same payload, and both on their own 30-second poll — so the number
 * cost two requests a minute for as long as the app was open, forever, and
 * three of them landed inside the same second on a page load.
 *
 * One poller lives here now and the readers subscribe. The request count is
 * halved whether anybody is looking at the page or not, which is the part that
 * matters: a steady background drip is what a bot check is watching for.
 *
 * The poll stops when the last subscriber goes, so a page with no notification
 * UI costs nothing.
 */

const URL_ = '/api/notifications?unread_only=1&limit=200';
const POLL_KEY = 'unread-notifications';
const POLL_MS = 30_000;

let count = 0;
let started = false;
const subscribers = new Set<(n: number) => void>();

async function refresh(): Promise<void> {
  try {
    const res = await fetch(URL_, { credentials: 'include' });
    if (!res.ok) return;
    const data = await res.json() as unknown;
    const next = Array.isArray(data) ? data.length : 0;
    // Told unconditionally rather than only on a change: a subscriber that
    // mounted after the last poll has never heard the number at all.
    count = next;
    subscribers.forEach(fn => fn(count));
  } catch {
    // Non-fatal. The badge keeps whatever it last knew rather than dropping
    // to zero, which would read as "all caught up".
  }
}

/** The number as it was last known, without waiting. */
export function unreadNotificationCount(): number {
  return count;
}

/**
 * Hear the number now and whenever it changes. Returns an unsubscribe.
 *
 * The first subscriber starts the poll; the last one to leave stops it.
 */
export function subscribeUnreadNotifications(fn: (n: number) => void): () => void {
  subscribers.add(fn);
  fn(count);
  if (!started) {
    started = true;
    refresh();
    startPolling(POLL_KEY, refresh, POLL_MS, POLL_MS);
  }
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0) {
      stopPolling(POLL_KEY);
      started = false;
    }
  };
}

/** Ask again now — after marking something read, where waiting 30s would lie. */
export function refreshUnreadNotifications(): Promise<void> {
  return refresh();
}
