'use client';

import { useState, useEffect } from 'react';

let _cache: number | null = null;
let _pending: Promise<number> | null = null;

function fetchAvgCostPerUnit(): Promise<number> {
  if (_cache !== null) return Promise.resolve(_cache);
  if (_pending) return _pending;
  _pending = fetch('/api/admin/effectiveness', { credentials: 'include' })
    .then(r => (r.ok ? r.json() : {}))
    .then((data: Record<string, string>) => {
      const val = parseFloat(data['avg_cost_per_unit'] ?? '0') || 0;
      _cache = val;
      _pending = null;
      return val;
    })
    .catch(() => {
      _pending = null;
      return 0;
    });
  return _pending;
}

export function invalidateAvgCostPerUnit() {
  _cache = null;
}

export function useAvgCostPerUnit(): number {
  const [value, setValue] = useState<number>(_cache ?? 0);
  useEffect(() => {
    fetchAvgCostPerUnit().then(setValue);
  }, []);
  return value;
}

export function formatValuePill(wse: number | null | undefined, avgCostPerUnit: number): string | null {
  if (wse == null || avgCostPerUnit <= 0) return null;
  const total = Math.round(wse * avgCostPerUnit);
  return '$' + total.toLocaleString('en-US');
}
