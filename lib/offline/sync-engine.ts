import { getOfflineDB, type SyncOperation } from './idb';

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export async function replaySyncQueue(): Promise<SyncResult> {
  const db = await getOfflineDB();

  const pending: SyncOperation[] = await db.getAllFromIndex('sync_queue', 'by_status', 'pending');
  pending.sort((a, b) => a.timestamp - b.timestamp);

  let synced = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const op of pending) {
    try {
      await db.put('sync_queue', { ...op, status: 'syncing' });

      const res = await fetch(op.url, {
        method: op.method,
        headers: { 'Content-Type': 'application/json' },
        body: op.body || undefined,
      });

      if (res.ok || res.status === 409 || res.status === 422) {
        // 409/422 = conflict/validation — mark done so we don't retry indefinitely
        await db.put('sync_queue', { ...op, status: 'done' });
        if (res.ok) {
          synced++;
        } else {
          const msg = `${op.method} ${op.url} → ${res.status}`;
          errors.push(msg);
          failed++;
        }
      } else {
        const msg = `HTTP ${res.status}: ${op.method} ${op.url}`;
        await db.put('sync_queue', { ...op, status: 'failed', error: msg, retries: op.retries + 1 });
        failed++;
        errors.push(msg);
      }
    } catch (e) {
      // Network error — still offline; put back to pending and stop
      await db.put('sync_queue', { ...op, status: 'pending' });
      break;
    }
  }

  return { synced, failed, errors };
}

export async function retryFailedOperations(): Promise<SyncResult> {
  const db = await getOfflineDB();

  const failed: SyncOperation[] = await db.getAllFromIndex('sync_queue', 'by_status', 'failed');
  // Reset max-3-retries items back to pending so replaySyncQueue() will pick them up
  const retriable = failed.filter(op => op.retries < 3);
  await Promise.all(retriable.map(op => db.put('sync_queue', { ...op, status: 'pending' })));

  return replaySyncQueue();
}

export async function getPendingQueueSummary(): Promise<{ pending: number; failed: number }> {
  const db = await getOfflineDB();
  const [pending, failed] = await Promise.all([
    db.countFromIndex('sync_queue', 'by_status', 'pending'),
    db.countFromIndex('sync_queue', 'by_status', 'failed'),
  ]);
  return { pending, failed };
}
