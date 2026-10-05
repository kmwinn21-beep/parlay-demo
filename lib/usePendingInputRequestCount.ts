'use client';

import { useState, useEffect } from 'react';
import { startPolling, stopPolling } from '@/lib/pollingManager';

/**
 * How many calendar input requests are waiting on this user.
 *
 * Polled through the shared manager rather than a bare setInterval, so it
 * stops when the window loses focus and slows down when the tab is hidden.
 *
 * It used to use its own timer, which nothing ever stopped. The sidebar is
 * mounted on every page of the app, so every open tab on every device called
 * this every two minutes forever — 720 times a day each, through the night,
 * with nobody there. In a four-hour overnight window the production logs show
 * 120 calls to this one endpoint and three page views in total: a perfect
 * metronome from one address with no human activity around it, which is the
 * shape of traffic the host's bot protection exists to challenge. Hence the
 * "verifying your browser" screens.
 *
 * Two minutes is kept for the foreground. The number was never the problem —
 * not stopping was.
 */
export function usePendingInputRequestCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/calendar-intelligence/my-input-status')
        .then(r => r.ok ? r.json() : null)
        .then((data: { totalPending?: number } | null) => {
          if (!cancelled && data) setCount(data.totalPending ?? 0);
        })
        .catch(() => {});
    };
    load();
    // Hidden tabs fall back to five minutes. A badge counting requests that
    // arrive over hours does not need to be fresher than that on a tab
    // somebody is not looking at.
    startPolling('pending-input-count', load, 120_000, 300_000);
    return () => { cancelled = true; stopPolling('pending-input-count'); };
  }, []);

  return count;
}
