'use client';
import { useEffect, useState } from 'react';

const DEFAULT = 'Relationships Matter';

let _cache: string | null = null;
let _pending: Promise<string> | undefined;

export function invalidateTagline() {
  _cache = null;
  _pending = undefined;
}

async function fetchTagline(): Promise<string> {
  try {
    const res = await fetch('/api/tagline', { cache: 'no-store' });
    if (!res.ok) return DEFAULT;
    const { tagline } = await res.json() as { tagline: string };
    return tagline || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useTagline(): string {
  const [tagline, setTagline] = useState<string>(_cache ?? DEFAULT);

  useEffect(() => {
    if (_cache !== null) { setTagline(_cache); return; }
    if (!_pending) {
      _pending = fetchTagline().then(t => { _cache = t; _pending = undefined; return t; });
    }
    _pending.then(t => setTagline(t));
  }, []);

  return tagline;
}
