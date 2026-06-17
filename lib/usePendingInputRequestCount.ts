import { useState, useEffect } from 'react';

export function usePendingInputRequestCount(): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetch('/api/calendar-intelligence/my-input-status')
        .then(r => r.ok ? r.json() : null)
        .then((data: { totalPending?: number } | null) => {
          if (!cancelled && data) setCount(data.totalPending ?? 0);
        })
        .catch(() => {});
    };
    load();
    const t = setInterval(load, 120_000);
    return () => { cancelled = true; clearInterval(t); };
  }, []);

  return count;
}
