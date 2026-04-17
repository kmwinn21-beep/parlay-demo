'use client';
import { useEffect, useState } from 'react';

const DEFAULT = process.env.NEXT_PUBLIC_APP_NAME ?? 'Conference Hub';

let _cache: string | null = null;
let _pending: Promise<string> | undefined;

export function invalidateAppName() {
  _cache = null;
  _pending = undefined;
}

async function fetchAppName(): Promise<string> {
  try {
    const res = await fetch('/api/app-name', { cache: 'no-store' });
    if (!res.ok) return DEFAULT;
    const { name } = await res.json() as { name: string };
    return name || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useAppName(): string {
  const [name, setName] = useState<string>(_cache ?? DEFAULT);

  useEffect(() => {
    if (_cache !== null) { setName(_cache); return; }
    if (!_pending) {
      _pending = fetchAppName().then(n => { _cache = n; _pending = undefined; return n; });
    }
    _pending.then(n => setName(n));
  }, []);

  return name;
}
