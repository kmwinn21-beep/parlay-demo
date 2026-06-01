'use client';

import { useState, useEffect } from 'react';
import { startPolling, stopPolling } from '@/lib/pollingManager';

export function useNeedsAttentionCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function fetchCount() {
      try {
        const res = await fetch('/api/meetings/needs-attention', { credentials: 'include' });
        if (!res.ok || cancelled) return;
        const data = await res.json() as { pastScheduled?: unknown[]; overdueFollowups?: unknown[]; heldNoNotes?: unknown[] };
        if (!cancelled) {
          const total = (data.pastScheduled?.length ?? 0) + (data.overdueFollowups?.length ?? 0) + (data.heldNoNotes?.length ?? 0);
          setCount(total);
        }
      } catch {
        // non-fatal
      }
    }

    fetchCount();
    startPolling('needs-attention-count', fetchCount, 60_000, 60_000);
    return () => { cancelled = true; stopPolling('needs-attention-count'); };
  }, []);

  return count;
}
