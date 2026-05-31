'use client';

import { useState, useEffect } from 'react';
import { startPolling, stopPolling } from '@/lib/pollingManager';

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
    startPolling('chat-unread', fetchCount, 15_000, 30_000);
    return () => { cancelled = true; stopPolling('chat-unread'); };
  }, []);

  return count;
}
