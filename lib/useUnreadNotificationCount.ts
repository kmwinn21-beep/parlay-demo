'use client';

import { useState, useEffect } from 'react';
import { startPolling, stopPolling } from '@/lib/pollingManager';

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
    startPolling('notification-count', fetchCount, 30_000, 30_000);
    return () => { cancelled = true; stopPolling('notification-count'); };
  }, []);

  return count;
}
