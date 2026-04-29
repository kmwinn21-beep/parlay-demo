'use client';

import { useState, useEffect } from 'react';

const POLL_INTERVAL_MS = 10_000;

export function useUnreadChatCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/chat/conversations', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { unreadCount: number }[];
        if (!cancelled) {
          setCount(Array.isArray(data) ? data.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0) : 0);
        }
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
