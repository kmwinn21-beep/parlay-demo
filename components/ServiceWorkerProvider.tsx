'use client';

import { useEffect } from 'react';
import { replaySyncQueue } from '@/lib/offline/sync-engine';

export function ServiceWorkerProvider() {
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .catch((err) => console.warn('[SW] Registration failed:', err));

    const handleOnline = async () => {
      try {
        const result = await replaySyncQueue();
        if (result.synced > 0) {
          console.info(`[Sync] ${result.synced} change(s) synced successfully.`);
        }
        if (result.failed > 0) {
          console.warn(`[Sync] ${result.failed} change(s) failed to sync.`);
        }
      } catch (err) {
        console.warn('[Sync] Queue replay error:', err);
      }
    };

    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  return null;
}
