'use client';

import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { MergeModal } from './MergeModal';
import { bucketFor, groupMatchesQuery, isChildCompany } from '@/lib/duplicateCompanies';
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
 *
 * ── Families are not duplicates ──────────────────────────────────────────────
 *
 * "12 Oaks" and "12 Oaks Senior Living" may be one company recorded twice, or a
 * parent and its child kept apart on purpose. A row says which of its members
 * are already somebody's child and whose, and when a parent and its own child
 * are BOTH in the group it says so above the names — that one is not a close
 * call to read carefully, it is a relationship the account already stated.
 *
 * The pills say it in the account's OWN words. An account that calls the two
 * ends of a family "Portfolio" and "Community" reads "Community of 12 Oaks"
 * here, not "child company" — the wording is configured in one place and every
 * screen that names the relationship should use it. resolveEntityDesignation
 * owns the rule; this just shows the answer.
 *
 * ── Searching ────────────────────────────────────────────────────────────────
 *
 * Three hundred groups behind three closed doors is not something to browse.
 * The search box answers the question people arrive with — "what about THIS
 * company", "what is on that domain" — and while a query is live the sections
 * open themselves, because a closed section with matches in it is a search that
 * appears to have found nothing. Clearing the box hands the sections back
 * exactly as they were.
 *
 * ── On a phone ───────────────────────────────────────────────────────────────
 *
 * The row was one flex line with everything in it, which at 390px wrapped the
 * tags to a word per line and shouldered the buttons in beside them. It stacks
 * now: evidence, then the companies, then the actions across the bottom. The
 * tags refuse to break mid-phrase, and each company's counts drop under its
 * name rather than wrapping through it — inline again from sm, where a row per
 * company is what keeps a long section readable.
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
  scan: { groups, redundant, scanning, scan, dismiss, childDesignation, parentDesignation },
  onMerged,
}: {
  scan: DuplicateScan;
  onMerged: () => void;
}) {
  const [merging, setMerging] = useState<DuplicateGroup | null>(null);
  const [open, setOpen] = useState<Set<Bucket>>(new Set());
  const [query, setQuery] = useState('');

  const buckets = useMemo(() => {
    const out: Record<Bucket, DuplicateGroup[]> = { both: [], name: [], domain: [] };
    for (const group of groups ?? []) {
      if (!groupMatchesQuery(group, query)) continue;
      out[bucketFor(group)].push(group);
    }
    return out;
  }, [groups, query]);

  // Fall back to the canonical words only when the account has configured
  // none — resolveEntityDesignation already does that server-side, so this is
  // for the moment before the first scan answers.
  const childLabel = childDesignation || 'Child';
  const parentLabel = parentDesignation || 'Parent';

  const searching = query.trim().length > 0;
  const matched = buckets.both.length + buckets.name.length + buckets.domain.length;

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
    <li key={group.dismissalKey} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        {/* Why these are together, before the names. A group the reader cannot
            judge is a group they either accept blindly or skip. The tags never
            break mid-phrase — "similar name" over two lines reads as two tags. */}
        <div className="mb-1 flex flex-wrap items-center gap-1.5 text-[11px]">
          {group.matchedOn.includes('name') && (
            <span className="whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 font-medium text-gray-600">same name</span>
          )}
          {group.matchedOn.includes('similar-name') && (
            <span className="whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700">similar name</span>
          )}
          {group.matchedOn.includes('domain') && (
            <span className="whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 font-medium text-brand-secondary">similar domain</span>
          )}
          {/* The evidence itself. `w-full` drops it to its own line on a phone,
              where sharing one with the tags is what made the row unreadable;
              from sm it sits beside them, where putting it below cost 28% more
              height on every one of a hundred-odd rows. Measured both ways. */}
          {(group.sharedDomains.length > 0 || group.sharedStems.length > 0) && (
            <span className="w-full min-w-0 truncate text-gray-500 sm:w-auto">
              {group.sharedDomains.length > 0
                ? group.sharedDomains.join(', ')
                : `shares “${group.sharedStems.join('”, “')}”`}
            </span>
          )}
        </div>
        {group.familyLinks.length > 0 && (
          <p className="mb-1.5 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] leading-snug text-amber-800">
            <strong>Already a family.</strong>{' '}
            {group.familyLinks.map(l => `${l.childName} is a child of ${l.parentName}`).join('; ')}.
            Merging would collapse that.
          </p>
        )}
        <ul className="space-y-1 sm:space-y-0.5">
          {group.members.map((m) => (
            <li key={m.id} className="text-sm leading-snug">
              <span className={m.id === group.suggestedMasterId ? 'font-semibold text-gray-800' : 'text-gray-600'}>
                {m.name}
              </span>
              {m.id === group.suggestedMasterId && (
                <span className="ml-2 whitespace-nowrap text-[11px] font-medium text-brand-secondary">
                  suggested to keep
                </span>
              )}
              {isChildCompany(m, childDesignation) && (
                <>
                  <span
                    className="ml-2 whitespace-nowrap rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700"
                    title={m.parent_company_name
                      ? `${childLabel} of ${m.parent_company_name}`
                      : childLabel}
                  >
                    {childLabel}
                  </span>
                  {/* Whose, beside the pill rather than inside it — the pill is
                      the account's word for the relationship, not a sentence. */}
                  {m.parent_company_name && (
                    <span className="ml-1 whitespace-nowrap text-[11px] text-gray-500">
                      of {m.parent_company_name}
                    </span>
                  )}
                </>
              )}
              {!isChildCompany(m, childDesignation) && (m.child_count ?? 0) > 0 && (
                <>
                  <span className="ml-2 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-[11px] font-medium text-gray-600">
                    {parentLabel}
                  </span>
                  <span className="ml-1 whitespace-nowrap text-[11px] text-gray-500">
                    of {m.child_count}
                  </span>
                </>
              )}
              {/* Under the name on a phone, beside it from sm — a row per
                  company is what keeps a 120-group section readable. */}
              <span className="block text-xs text-gray-400 sm:ml-2 sm:inline">
                {m.attendee_count ?? 0} attendee{(m.attendee_count ?? 0) === 1 ? '' : 's'}
                {(m.conference_count ?? 0) > 0 && ` · ${m.conference_count} conference${m.conference_count === 1 ? '' : 's'}`}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        <button onClick={() => setMerging(group)} className="btn-primary flex-1 whitespace-nowrap py-1.5 text-sm sm:flex-none">
          Review &amp; merge
        </button>
        <button
          onClick={() => dismiss(group)}
          title="These are different companies"
          className="whitespace-nowrap px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700"
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
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <div className="relative min-w-[200px] flex-1 sm:flex-none">
            <svg className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                 fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search company or domain…"
              aria-label="Search duplicate groups by company or domain"
              className="input-field w-full py-1.5 pl-9 pr-8 text-sm"
            />
            {searching && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button onClick={scan} disabled={scanning}
                  className="btn-secondary flex-shrink-0 text-sm disabled:opacity-50">
            {scanning ? 'Scanning…' : 'Scan again'}
          </button>
        </div>
      </div>

      {searching && matched === 0 && (
        <p className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-6 text-center text-sm text-gray-500">
          No duplicate groups mention “{query.trim()}”.
        </p>
      )}

      <div className="space-y-2">
        {(['both', 'name', 'domain'] as Bucket[]).map((bucket) => {
          const inBucket = buckets[bucket];
          if (inBucket.length === 0) return null;
          const isOpen = searching || open.has(bucket);
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
                    {searching && <span className="font-normal text-gray-500"> matching</span>}
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
            // The warning has to follow into the sheet. Seeing "child of X" in
            // the list and not while choosing is where the mistake gets made.
            note: isChildCompany(m, childDesignation)
              ? (m.parent_company_name ? `${childLabel} of ${m.parent_company_name}` : childLabel)
              : (m.child_count ?? 0) > 0 ? `${parentLabel} of ${m.child_count}` : undefined,
          }))}
          warning={merging.familyLinks.length > 0
            ? `${merging.familyLinks.map(l => `${l.childName} is a child of ${l.parentName}`).join('; ')}. Merging would collapse that.`
            : undefined}
          title="Merge duplicate companies"
          description="Pick the record to keep. Everything attached to the others moves to it, and they are deleted."
          searchType="company"
          defaultMasterId={merging.suggestedMasterId}
        />
      )}
    </div>
  );
}
