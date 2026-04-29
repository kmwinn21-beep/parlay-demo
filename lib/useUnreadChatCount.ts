'use client';

import { useState, useEffect } from 'react';

const POLL_INTERVAL_MS = 10_000;

export function useUnreadChatCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const [dmRes, groupRes] = await Promise.all([
          fetch('/api/chat/conversations', { credentials: 'include' }),
          fetch('/api/chat/groups',         { credentials: 'include' }),
        ]);
        if (cancelled) return;
        let total = 0;
        if (dmRes.ok) {
          const dmData = await dmRes.json() as { unreadCount: number }[];
          total += Array.isArray(dmData) ? dmData.reduce((s, c) => s + (c.unreadCount ?? 0), 0) : 0;
        }
        if (groupRes.ok) {
          const groupData = await groupRes.json() as { unreadCount: number }[];
          total += Array.isArray(groupData) ? groupData.reduce((s, g) => s + (g.unreadCount ?? 0), 0) : 0;
        }
        if (!cancelled) setCount(total);
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
