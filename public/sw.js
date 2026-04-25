// Service Worker — Conference Hub PWA
// Uses Workbox from CDN for caching strategies.
// Mutation requests (POST/PATCH/PUT/DELETE) are intercepted when offline
// and stored in IndexedDB sync_queue for replay when connectivity returns.

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

const { registerRoute } = workbox.routing;
const { NetworkFirst, CacheFirst, StaleWhileRevalidate } = workbox.strategies;
const { ExpirationPlugin } = workbox.expiration;
const { CacheableResponsePlugin } = workbox.cacheableResponse;

workbox.setConfig({ debug: false });

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const API_CACHE = `api-${CACHE_VERSION}`;
const HTML_CACHE = `html-${CACHE_VERSION}`;

// ── Precache Next.js static assets ──────────────────────────────────────────
// CacheFirst: hashed filenames are immutable
registerRoute(
  ({ url }) => url.pathname.startsWith('/_next/static/'),
  new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  })
);

// ── API GET requests — NetworkFirst ─────────────────────────────────────────
registerRoute(
  ({ url, request }) => url.pathname.startsWith('/api/') && request.method === 'GET',
  new NetworkFirst({
    cacheName: API_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
    networkTimeoutSeconds: 10,
  })
);

// ── HTML / navigation — NetworkFirst ────────────────────────────────────────
registerRoute(
  ({ request }) => request.mode === 'navigate',
  new NetworkFirst({
    cacheName: HTML_CACHE,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 60 * 24 }),
    ],
    networkTimeoutSeconds: 10,
  })
);

// ── Mutation interception ────────────────────────────────────────────────────
// POST/PATCH/PUT/DELETE: try network first; if offline, enqueue to IndexedDB.

const MUTATING_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (!MUTATING_METHODS.has(request.method)) return;
  if (!request.url.includes('/api/')) return;

  event.respondWith(handleMutation(request));
});

async function handleMutation(request) {
  try {
    const response = await fetch(request.clone());
    return response;
  } catch {
    // Offline — enqueue the operation
    try {
      const body = await request.text();
      await enqueueOperation({
        method: request.method,
        url: request.url,
        body,
        timestamp: Date.now(),
        status: 'pending',
        retries: 0,
      });
    } catch (e) {
      console.error('[SW] Failed to enqueue mutation:', e);
    }
    return new Response(JSON.stringify({ queued: true, offline: true }), {
      status: 202,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

// ── IndexedDB helpers (inline in SW — no import support in sw.js) ────────────

const DB_NAME = 'conference-hub-offline';
const DB_VERSION = 1;
const SYNC_STORE = 'sync_queue';

function openSwDB() {
  return new Promise((resolve, reject) => {
    const req = self.indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
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
      if (!db.objectStoreNames.contains(SYNC_STORE)) {
        const sq = db.createObjectStore(SYNC_STORE, { keyPath: 'id', autoIncrement: true });
        sq.createIndex('by_status', 'status');
      }
      if (!db.objectStoreNames.contains('offline_meta')) {
        db.createObjectStore('offline_meta', { keyPath: 'conference_id' });
      }
    };
  });
}

async function enqueueOperation(op) {
  const db = await openSwDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(SYNC_STORE, 'readwrite');
    const req = tx.objectStore(SYNC_STORE).add(op);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// ── Lifecycle ────────────────────────────────────────────────────────────────

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
