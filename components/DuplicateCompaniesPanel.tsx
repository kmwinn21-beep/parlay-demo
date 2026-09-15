'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { bucketFor } from '@/lib/duplicateCompanies';
import type { DuplicateGroup } from '@/lib/duplicateCompanies';
import type { DuplicateScan } from '@/lib/useDuplicateScan';

/**
 * "These two are the same company" — offered, never assumed.
 *
 * A conference list arrives with "Direct Supply", "Direct supply", "Direct
 * Supply Inc." and "Direct Supply, Inc." in it, and until the upload learned to
 * collapse them that made four records. This shows the ones already sitting in
 * the account and offers them for merging — through the same modal the Merge
 * button uses, which says what it would move first and lets a group be taken
 * apart before it goes.
 *
 * ── Sorted by what found them ────────────────────────────────────────────────
 *
 * A scan of a real account returns hundreds of groups, and they are not equally
 * good. A shared name is near-certain; a shared stem is a guess; a shared
 * domain is strong but occasionally chains two companies through a third. Piled
 * into one list, the weak ones are read with the same eye as the strong ones —
 * or the whole list is skipped.
 *
 * So they are split by the evidence and every section starts closed. Opening
 * one is a decision to work that kind of match, which is how somebody actually
 * goes about this: the certain ones first, the guesses when there is time.
 *
 * The per-group tags stay inside, because "same name" and "similar name" are
 * not the same claim even though they share a section.
 */

type Bucket = 'name' | 'domain' | 'both';

const BUCKET_LABELS: Record<Bucket, { title: string; blurb: string }> = {
  name: {
    title: 'Matched by name',
    blurb: 'The same name under a different spelling, or one name being the start of another.',
  },
  domain: {
    title: 'Matched by domain',
    blurb: 'Different names, sharing a website or work email domain.',
  },
  both: {
    title: 'Matched by name and domain',
    blurb: 'Both kinds of evidence point the same way — the strongest of the three.',
  },
};

export function DuplicateCompaniesPanel({
  scan: { groups, redundant, scanning, scan, dismiss },
  onMerged,
}: {
  scan: DuplicateScan;
  onMerged: () => void;
}) {
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [open, setOpen] = useState<Set<Bucket>>(new Set());

  const buckets = useMemo(() => {
    const out: Record<Bucket, DuplicateGroup[]> = { both: [], name: [], domain: [] };
    for (const group of groups ?? []) out[bucketFor(group)].push(group);
    return out;
  }, [groups]);

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

  // Nothing has been asked for yet. The button lives in the table's filter row,
  // so there is nothing to show here until it has been pressed.
  if (groups === null) return null;

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

  const renderGroup = (group: DuplicateGroup) => (
    <li key={group.dismissalKey} className="flex flex-wrap items-start justify-between gap-3 py-3">
      <div className="min-w-0 flex-1">
        {/* Why these are together, before the names. A group the reader cannot
            judge is a group they either accept blindly or skip. */}
        <p className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px] text-gray-500">
          {group.matchedOn.includes('name') && (
            <span className="rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">same name</span>
          )}
          {group.matchedOn.includes('similar-name') && (
            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">similar name</span>
          )}
          {group.matchedOn.includes('domain') && (
            <span className="rounded bg-blue-50 px-1.5 py-0.5 font-medium text-brand-secondary">similar domain</span>
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
              <span className={m.id === group.suggestedMasterId ? 'font-semibold text-gray-800' : 'text-gray-600'}>
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
          className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
        >
          Not duplicates
        </button>
      </div>
    </li>
  );

  return (
    <div className="card">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
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

      <div className="space-y-2">
        {(['both', 'name', 'domain'] as Bucket[]).map((bucket) => {
          const inBucket = buckets[bucket];
          if (inBucket.length === 0) return null;
          const isOpen = open.has(bucket);
          const { title, blurb } = BUCKET_LABELS[bucket];
          return (
            <div key={bucket} className="rounded-lg border border-gray-200">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen((prev) => {
                  const next = new Set(prev);
                  if (next.has(bucket)) next.delete(bucket); else next.add(bucket);
                  return next;
                })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50"
              >
                <svg
                  className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-gray-800">
                    {title} · {inBucket.length}
                  </span>
                  <span className="block text-xs text-gray-500">{blurb}</span>
                </span>
              </button>
              {isOpen && (
                <ul className="divide-y divide-gray-100 border-t border-gray-100 px-4">
                  {inBucket.map(renderGroup)}
                </ul>
              )}
            </div>
          );
        })}
      </div>

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
