'use client';

import { useState, useEffect, useCallback } from 'react';
import { useConnectionStatus, usePendingCount } from '@/lib/offline/hooks';
import { replaySyncQueue } from '@/lib/offline/sync-engine';

type BannerState = 'hidden' | 'offline' | 'syncing' | 'synced';

export function OfflineBanner() {
  const isOnline = useConnectionStatus();
  const { pending, failed } = usePendingCount();
  const [state, setState] = useState<BannerState>('hidden');
  const [syncedCount, setSyncedCount] = useState(0);

  const runSync = useCallback(async () => {
    if (pending === 0 && failed === 0) {
      setState('hidden');
      return;
    }
    setState('syncing');
    try {
      const result = await replaySyncQueue();
      setSyncedCount(result.synced);
      setState('synced');
      setTimeout(() => setState('hidden'), 3000);
    } catch {
      setState('hidden');
    }
  }, [pending, failed]);

  useEffect(() => {
    if (!isOnline) {
      setState('offline');
    } else if (state === 'offline') {
      // Just came back online
      runSync();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOnline]);

  if (state === 'hidden') return null;

  const totalPending = pending + failed;

  return (
    <div
      className={`fixed bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-full shadow-lg text-sm font-medium transition-all
        ${state === 'offline' ? 'bg-gray-900 text-white' : ''}
        ${state === 'syncing' ? 'bg-brand-primary text-white' : ''}
        ${state === 'synced' ? 'bg-emerald-600 text-white' : ''}
      `}
    >
      {state === 'offline' && (
        <>
          <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
          <span>
            Offline
            {totalPending > 0 && ` — ${totalPending} change${totalPending !== 1 ? 's' : ''} pending`}
          </span>
        </>
      )}
      {state === 'syncing' && (
        <>
          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>Syncing changes…</span>
        </>
      )}
      {state === 'synced' && (
        <>
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span>{syncedCount > 0 ? `${syncedCount} change${syncedCount !== 1 ? 's' : ''} synced` : 'All synced'}</span>
        </>
      )}
    </div>
  );
}
