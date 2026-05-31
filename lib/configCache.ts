'use client';

let cachedData: unknown = null;
let cachedAt = 0;
let inFlight: Promise<unknown> | null = null;
const CACHE_TTL = 60_000; // 60 seconds

export async function getConfig(): Promise<unknown> {
  if (cachedData !== null && Date.now() - cachedAt < CACHE_TTL) {
    return cachedData;
  }
  if (inFlight) return inFlight;

  inFlight = fetch('/api/config')
    .then(r => r.json())
    .then(data => {
      cachedData = data;
      cachedAt = Date.now();
      inFlight = null;
      return data;
    })
    .catch(err => {
      inFlight = null;
      throw err;
    });

  return inFlight;
}

export function invalidateConfigCache() {
  cachedData = null;
  cachedAt = 0;
  inFlight = null;
}
