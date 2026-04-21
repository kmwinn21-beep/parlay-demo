'use client';
import { useEffect, useState } from 'react';

const DEFAULT = 'Units';

let _cache: string | null = null;
let _pending: Promise<string> | undefined;

export function invalidateUnitTypeLabel() {
  _cache = null;
  _pending = undefined;
}

async function fetchUnitTypeLabel(): Promise<string> {
  try {
    const res = await fetch('/api/admin/unit-type', { cache: 'no-store' });
    if (!res.ok) return DEFAULT;
    const data = await res.json() as { value: string };
    return data.value || DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function useUnitTypeLabel(): string {
  const [label, setLabel] = useState<string>(_cache ?? DEFAULT);

  useEffect(() => {
    if (_cache !== null) { setLabel(_cache); return; }
    if (!_pending) {
      _pending = fetchUnitTypeLabel().then(l => { _cache = l; _pending = undefined; return l; });
    }
    _pending.then(l => setLabel(l));
  }, []);

  return label;
}
