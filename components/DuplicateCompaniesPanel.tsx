'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import type { DuplicateGroup } from '@/lib/duplicateCompanies';

/**
 * "These two are the same company" — offered, never assumed.
 *
 * A conference list arrives with "Direct Supply", "Direct supply", "Direct
 * Supply Inc." and "Direct Supply, Inc." in it, and until the upload learned to
 * collapse them that made four records. This finds the ones already sitting in
 * the account and offers them for merging — one group at a time, through the
 * same modal the Merge button uses, which now says what it would move first.
 *
 * Each group says WHY it is a group: a shared name, or a shared domain, or
 * both. The evidence is the point. "T20 Holdings LLC" and "Twenty20 Group" look
 * like nothing to each other until the row says both use twenty20.com, and a
 * reader who cannot see that has only the system's word for it.
 *
 * ── Why it stays shut until asked ────────────────────────────────────────────
 *
 * The scan reads every company and groups them in JavaScript. That is cheap at
 * a thousand companies and not free at fifty thousand, and nobody loading the
 * Companies page has necessarily come to do this. So the panel renders a button
 * and does nothing until it is pressed.
 */
export function DuplicateCompaniesPanel({ onMerged }: { onMerged: () => void }) {
  const [groups, setGroups] = useState<DuplicateGroup[] | null>(null);
  const [redundant, setRedundant] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);

  const scan = useCallback(async () => {
    setScanning(true);
    try {
      const res = await fetch('/api/companies/duplicates', { cache: 'no-store' });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setGroups(data.groups ?? []);
      setRedundant(data.redundantRecords ?? 0);
    } catch {
      toast.error('Could not scan for duplicates.');
      setGroups(null);
    } finally {
      setScanning(false);
    }
  }, []);

  const dismiss = async (group: DuplicateGroup) => {
    // Optimistic: the row goes now, and comes back on the next scan if the
    // write failed. Nothing is destroyed either way.
    setGroups((prev) => prev?.filter((g) => g.dismissalKey !== group.dismissalKey) ?? prev);
    setRedundant((n) => Math.max(0, n - (group.members.length - 1)));
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
  };

  const handleMerge = async (masterId: number, duplicateIds: number[]) => {
    const res = await fetch('/api/companies/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ master_id: masterId, duplicate_ids: duplicateIds }),
    });
    if (!res.ok) { toast.error('Merge failed.'); return; }
    toast.success('Merged.');
    setMerging(null);
    await scan();
    onMerged();
  };

  if (groups === null) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif">Duplicate companies</h2>
          <p className="text-sm text-gray-500">
            Find companies that are the same company under a different spelling — Inc., LLC,
            a stray comma, a difference in case — one name being the start of another,
            or a different name entirely sharing a website or work email domain.
          </p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn-secondary text-sm disabled:opacity-50">
          {scanning ? 'Scanning…' : 'Scan for duplicates'}
        </button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif">Duplicate companies</h2>
          <p className="text-sm text-gray-500">No duplicates found.</p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn-secondary text-sm disabled:opacity-50">
          {scanning ? 'Scanning…' : 'Scan again'}
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-brand-primary font-serif">
            {groups.length} possible duplicate{groups.length === 1 ? '' : 's'}
          </h2>
          <p className="text-sm text-gray-500">
            {redundant} record{redundant === 1 ? '' : 's'} could be merged away. Nothing is
            merged until you choose to, and you pick which records go.
          </p>
        </div>
        <button onClick={scan} disabled={scanning} className="btn-secondary text-sm disabled:opacity-50">
          {scanning ? 'Scanning…' : 'Scan again'}
        </button>
      </div>

      <ul className="divide-y divide-gray-100">
        {groups.map((group) => (
          <li key={group.dismissalKey} className="flex flex-wrap items-start justify-between gap-3 py-3">
            <div className="min-w-0 flex-1">
              {/* Why these are together, before the names. A group the reader
                  cannot judge is a group they either accept blindly or skip. */}
              <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
                {group.matchedOn.includes('name') && (
                  <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">
                    same name
                  </span>
                )}
                {group.matchedOn.includes('similar-name') && (
                  <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">
                    similar name
                  </span>
                )}
                {group.matchedOn.includes('domain') && (
                  <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-brand-secondary">
                    same domain
                  </span>
                )}
                {group.sharedDomains.length > 0 && (
                  <span className="truncate">{group.sharedDomains.join(', ')}</span>
                )}
                {group.sharedStems.length > 0 && group.sharedDomains.length === 0 && (
                  <span className="truncate">shares “{group.sharedStems.join('”, “')}”</span>
                )}
              </p>
              <ul className="space-y-0.5">
                {group.members.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-baseline gap-2 text-sm">
                    <span className={m.id === group.suggestedMasterId
                      ? 'font-semibold text-gray-800'
                      : 'text-gray-600'}>
                      {m.name}
                    </span>
                    {m.id === group.suggestedMasterId && (
                      <span className="text-[11px] font-medium text-brand-secondary">suggested to keep</span>
                    )}
                    <span className="text-xs text-gray-400">
                      {m.attendee_count ?? 0} attendee{(m.attendee_count ?? 0) === 1 ? '' : 's'}
                      {(m.conference_count ?? 0) > 0 && ` · ${m.conference_count} conference${m.conference_count === 1 ? '' : 's'}`}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-shrink-0 items-center gap-2">
              <button onClick={() => setMerging(group)} className="btn-primary text-sm py-1.5">
                Review &amp; merge
              </button>
              <button
                onClick={() => dismiss(group)}
                title="These are different companies"
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1.5"
              >
                Not duplicates
              </button>
            </div>
          </li>
        ))}
      </ul>

      {merging && (
        <MergeModal
          isOpen
          onClose={() => setMerging(null)}
          onMerge={handleMerge}
          items={merging.members.map((m) => ({
            id: m.id,
            label: m.name,
            sublabel: `${m.attendee_count ?? 0} attendee${(m.attendee_count ?? 0) === 1 ? '' : 's'}`
              + ((m.conference_count ?? 0) > 0 ? ` · ${m.conference_count} conference${m.conference_count === 1 ? '' : 's'}` : ''),
          }))}
          title="Merge duplicate companies"
          description="Pick the record to keep. Everything attached to the others moves to it, and they are deleted."
          searchType="company"
          defaultMasterId={merging.suggestedMasterId}
        />
      )}
    </div>
  );
}
