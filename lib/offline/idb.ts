import { openDB, type IDBPDatabase } from 'idb';

export const DB_NAME = 'conference-hub-offline';
export const DB_VERSION = 1;

export interface SyncOperation {
  id?: number;
  timestamp: number;
  method: 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  url: string;
  body: string;
  status: 'pending' | 'syncing' | 'done' | 'failed';
  retries: number;
  error?: string;
}

export interface OfflineMeta {
  conference_id: number;
  synced_at: string;
  version: number;
}

export type OfflineDBInstance = IDBPDatabase<Record<string, unknown>>;

let _db: OfflineDBInstance | null = null;

export async function getOfflineDB(): Promise<OfflineDBInstance> {
  if (_db) return _db;
  _db = await openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('conferences')) {
        db.createObjectStore('conferences', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('attendees')) {
        const s = db.createObjectStore('attendees', { keyPath: 'id' });
        s.createIndex('by_conference', 'conference_id');
      }
      if (!db.objectStoreNames.contains('companies')) {
        db.createObjectStore('companies', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('follow_ups')) {
        const s = db.createObjectStore('follow_ups', { keyPath: 'id' });
        s.createIndex('by_conference', 'conference_id');
      }
      if (!db.objectStoreNames.contains('meetings')) {
        const s = db.createObjectStore('meetings', { keyPath: 'id' });
        s.createIndex('by_conference', 'conference_id');
      }
      if (!db.objectStoreNames.contains('entity_notes')) {
        const s = db.createObjectStore('entity_notes', { keyPath: 'id' });
        s.createIndex('by_attendee', 'attendee_id');
      }
      if (!db.objectStoreNames.contains('config_options')) {
        db.createObjectStore('config_options', { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('conference_targets')) {
        db.createObjectStore('conference_targets', { keyPath: ['attendee_id', 'conference_id'] });
      }
      if (!db.objectStoreNames.contains('sync_queue')) {
        const sq = db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
        sq.createIndex('by_status', 'status');
      }
      if (!db.objectStoreNames.contains('offline_meta')) {
        db.createObjectStore('offline_meta', { keyPath: 'conference_id' });
      }
    },
  });
  return _db;
}

export async function enqueueSyncOperation(
  op: Omit<SyncOperation, 'id'>
): Promise<void> {
  const db = await getOfflineDB();
  await db.add('sync_queue', op);
}

export async function getPendingSyncCount(): Promise<number> {
  const db = await getOfflineDB();
  return db.countFromIndex('sync_queue', 'by_status', 'pending');
}

export async function getFailedSyncCount(): Promise<number> {
  const db = await getOfflineDB();
  return db.countFromIndex('sync_queue', 'by_status', 'failed');
}

export async function storeOfflineBundle(
  conferenceId: number,
  bundle: {
    conference: Record<string, unknown>;
    attendees: Record<string, unknown>[];
    companies: Record<string, unknown>[];
    follow_ups: Record<string, unknown>[];
    meetings: Record<string, unknown>[];
    config_options: Record<string, unknown>[];
    targets: Record<string, unknown>[];
    synced_at: string;
  }
): Promise<void> {
  const db = await getOfflineDB();

  const tx = db.transaction(
    ['conferences', 'attendees', 'companies', 'follow_ups', 'meetings',
      'entity_notes', 'config_options', 'conference_targets', 'offline_meta'],
    'readwrite'
  );

  await tx.objectStore('conferences').put(bundle.conference);

  // Clear and refill conference-scoped stores
  const attendeeStore = tx.objectStore('attendees');
  const attendeeIdx = attendeeStore.index('by_conference');
  const existingAttendeeKeys = await attendeeIdx.getAllKeys(conferenceId);
  await Promise.all(existingAttendeeKeys.map(k => attendeeStore.delete(k)));
  await Promise.all(bundle.attendees.map(a => attendeeStore.put(a)));

  await Promise.all(bundle.companies.map(c => tx.objectStore('companies').put(c)));

  const fuStore = tx.objectStore('follow_ups');
  const fuIdx = fuStore.index('by_conference');
  const existingFuKeys = await fuIdx.getAllKeys(conferenceId);
  await Promise.all(existingFuKeys.map(k => fuStore.delete(k)));
  await Promise.all(bundle.follow_ups.map(f => fuStore.put(f)));

  const meetStore = tx.objectStore('meetings');
  const meetIdx = meetStore.index('by_conference');
  const existingMeetKeys = await meetIdx.getAllKeys(conferenceId);
  await Promise.all(existingMeetKeys.map(k => meetStore.delete(k)));
  await Promise.all(bundle.meetings.map(m => meetStore.put(m)));

  await Promise.all(bundle.config_options.map(c => tx.objectStore('config_options').put(c)));

  // conference_targets keyed by [attendee_id, conference_id]
  const targetStore = tx.objectStore('conference_targets');
  await Promise.all(bundle.targets.map(t => targetStore.put(t)));

  await tx.objectStore('offline_meta').put({
    conference_id: conferenceId,
    synced_at: bundle.synced_at,
    version: DB_VERSION,
  });

  await tx.done;
}

export async function getOfflineMeta(conferenceId: number): Promise<OfflineMeta | undefined> {
  const db = await getOfflineDB();
  return db.get('offline_meta', conferenceId);
}
