'use client';

import { useState, useEffect, useCallback } from 'react';
import { getPendingQueueSummary } from './sync-engine';
import { getOfflineMeta, type OfflineMeta } from './idb';

export function useConnectionStatus(): boolean {
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return isOnline;
}

export function usePendingCount(): { pending: number; failed: number } {
  const [counts, setCounts] = useState({ pending: 0, failed: 0 });

  const refresh = useCallback(async () => {
    try {
      const result = await getPendingQueueSummary();
      setCounts(result);
    } catch {
      // IndexedDB unavailable (SSR or private browsing)
    }
  }, []);

  useEffect(() => {
    refresh();
    // Poll every 5s to reflect optimistic writes
    const id = setInterval(refresh, 5000);
    return () => clearInterval(id);
  }, [refresh]);

  return counts;
}

export function useOfflineMeta(conferenceId: number): OfflineMeta | null {
  const [meta, setMeta] = useState<OfflineMeta | null>(null);

  useEffect(() => {
    getOfflineMeta(conferenceId)
      .then(m => setMeta(m ?? null))
      .catch(() => setMeta(null));
  }, [conferenceId]);

  return meta;
}
