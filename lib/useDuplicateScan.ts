'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import type { DuplicateGroup } from './duplicateCompanies';

/**
 * The duplicate scan's state, owned above the panel that shows it.
 *
 * It lives here because the button that starts the scan and the results it
 * produces are no longer in the same place: the button sits in the Companies
 * table's filter row, next to Filters, where somebody working the list will
 * actually come across it, and the results render above the table. Passing a
 * callback down one branch and the data down another is what a hook is for.
 */
export function useDuplicateScan() {
  /** Null until a scan has run — which is not the same as "none found". */
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [redundant, setRedundant] = useState(0);
  /** This account's own words for the two ends of a family. */
  const [childDesignation, setChildDesignation] = useState<string | null>(null);
  const [parentDesignation, setParentDesignation] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/companies/duplicates', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups ?? []);
      setRedundant(data.redundantRecords ?? 0);
      setChildDesignation(data.childDesignation ?? null);
      setParentDesignation(data.parentDesignation ?? null);
    } catch {
      toast.error('Could not scan for duplicates.');
      setGroups(null);
    } finally {
      setScanning(false);
    }
  }, []);

  /** Record that a group is not a duplicate, so it stops being offered. */
  const dismiss = useCallback(async (group: DuplicateGroup) => {
    // Optimistic: the row goes now, and comes back on the next scan if the
    // write failed. Nothing is destroyed either way.
    setGroups(prev => prev?.filter(g => g.dismissalKey !== group.dismissalKey) ?? prev);
    setRedundant(n => Math.max(0, n - (group.members.length - 1)));
    try {
      const res = await fetch('/api/companies/duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dismissal_key: group.dismissalKey }),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error('Could not save that. It will be offered again.');
    }
  }, []);

  return { groups, redundant, scanning, scan, dismiss, childDesignation, parentDesignation };
}

export type DuplicateScan = ReturnType<typeof useDuplicateScan>;
