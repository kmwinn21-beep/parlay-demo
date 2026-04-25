'use client';

import { useState, useEffect } from 'react';
import { storeOfflineBundle, getOfflineMeta } from '@/lib/offline/idb';

type SyncState = 'idle' | 'downloading' | 'ready' | 'error';

export function useConferenceOfflineSync(conferenceId: number) {
  const [state, setState] = useState<SyncState>('idle');
  const [progress, setProgress] = useState(0);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    getOfflineMeta(conferenceId)
      .then(meta => {
        if (meta) { setState('ready'); setSyncedAt(meta.synced_at); }
      })
      .catch(() => {});
  }, [conferenceId]);

  const handleDownload = async () => {
    setState('downloading');
    setProgress(0);
    setErrorMsg(null);
    try {
      const progressInterval = setInterval(() => {
        setProgress(p => (p < 80 ? p + 10 : p));
      }, 200);
      const res = await fetch(`/api/conferences/${conferenceId}/offline-bundle`);
      clearInterval(progressInterval);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      setProgress(85);
      const bundle = await res.json();
      setProgress(90);
      await storeOfflineBundle(conferenceId, bundle);
      setProgress(100);
      setState('ready');
      setSyncedAt(bundle.synced_at);
    } catch (e) {
      setState('error');
      setErrorMsg(e instanceof Error ? e.message : 'Download failed');
      setProgress(0);
    }
  };

  return { state, progress, syncedAt, errorMsg, handleDownload };
}

function formatSyncedAt(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
  } catch { return iso; }
}

export function ConferenceOfflineSync({ conferenceId, className }: { conferenceId: number; className?: string }) {
  const { state, progress, syncedAt, errorMsg, handleDownload } = useConferenceOfflineSync(conferenceId);

  return (
    <div className={className}>
      {state === 'ready' && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 py-1 px-2 text-sm font-medium text-emerald-700 hover:text-emerald-800 transition-colors whitespace-nowrap rounded-lg hover:bg-emerald-50"
          title={syncedAt ? `Last synced: ${formatSyncedAt(syncedAt)}` : undefined}
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Available Offline
        </button>
      )}

      {state === 'downloading' && (
        <div className="flex items-center gap-1.5 py-1 px-2 text-sm font-medium text-brand-primary whitespace-nowrap">
          <svg className="w-4 h-4 animate-spin flex-shrink-0" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          <span>Downloading…</span>
          <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div className="h-1.5 bg-brand-primary rounded-full transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {state === 'error' && (
        <button
          onClick={handleDownload}
          title={errorMsg ?? undefined}
          className="flex items-center gap-1.5 py-1 px-2 text-sm font-medium text-red-600 hover:text-red-700 transition-colors whitespace-nowrap rounded-lg hover:bg-red-50"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Retry Offline Sync
        </button>
      )}

      {state === 'idle' && (
        <button
          onClick={handleDownload}
          className="flex items-center gap-1.5 py-1 px-2 text-sm font-medium text-gray-500 hover:text-brand-primary transition-colors whitespace-nowrap rounded-lg hover:bg-gray-50"
        >
          <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Make Available Offline
        </button>
      )}
    </div>
  );
}
