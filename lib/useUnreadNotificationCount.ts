'use client';

import { useState, useEffect } from 'react';

const POLL_INTERVAL_MS = 60_000;

export function useUnreadNotificationCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/notifications?unread_only=1&limit=200', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as unknown[];
        if (!cancelled) setCount(Array.isArray(data) ? data.length : 0);
      } catch {
        // non-fatal
      }
    }

    fetchCount();
    const id = setInterval(fetchCount, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  return count;
}
