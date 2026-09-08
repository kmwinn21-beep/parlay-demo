'use client';

/**
 * The conference activity feed — a full-height column on the Dashboard.
 *
 * Team-wide. Everyone on the account sees the same stream, and notification
 * preferences are not consulted: this is a shared view of what the team is
 * doing, not a per-person delivery.
 *
 * Data comes from GET /api/feed; the shapes and the colour mapping live in
 * lib/feed/types.ts so this file only decides how they look.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { startPolling, stopPolling } from '@/lib/pollingManager';
import {
  matchesFilter, rendersBody,
  type FeedColour, type FeedFilter, type FeedItem, type FeedKind, type FeedScope,
} from '@/lib/feed/types';

/* ─── Colour ─── */

/**
 * Five colours, for the spine dot.
 *
 * `notes` is navy rather than a hue of its own because notes are the most
 * common item by a distance, and a bright colour repeated forty times down a
 * column stops meaning anything.
 */
const DOT_CLASS: Record<FeedColour, string> = {
  meetings: 'bg-blue-500',
  touchpoints: 'bg-purple-500',
  notes: 'bg-brand-primary',
  relationships: 'bg-orange-400',
  people: 'bg-teal-500',
};

const CHIPS: Array<{ key: FeedFilter; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'meetings', label: 'Meetings' },
  { key: 'touchpoints', label: 'Touchpoints' },
  { key: 'notes', label: 'Notes' },
  { key: 'people', label: 'People' },
];

/**
 * The conference dot's colour, hashed from the name.
 *
 * Same derivation as the rep avatars in admin/SalesRepsTab, so two shows that
 * are both in progress stay distinguishable while scrolling without anybody
 * assigning them colours.
 */
const CONFERENCE_PALETTE = ['#0B3C62', '#2E7D8F', '#B8562F', '#5B4B8A', '#2F7A4F', '#8A6D1F', '#7A2F4F'];
function conferenceColour(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return CONFERENCE_PALETTE[Math.abs(hash) % CONFERENCE_PALETTE.length];
}

const AVATAR_PALETTE = ['#0B3C62', '#2E7D8F', '#B8562F', '#5B4B8A', '#2F7A4F', '#8A6D1F', '#7A2F4F', '#3E5C76'];
function avatarColour(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/* ─── Time ─── */

/** SQLite stores `YYYY-MM-DD HH:MM:SS` in UTC with no zone marker. */
function toDate(raw: string): Date {
  return new Date(raw.replace(' ', 'T') + 'Z');
}

/** 12m, 3h, 2d — a feed wants elapsed time, not a clock reading. */
function relativeTime(raw: string, nowMs: number): string {
  const then = toDate(raw).getTime();
  if (isNaN(then)) return '';
  const mins = Math.max(0, Math.round((nowMs - then) / 60000));
  if (mins < 1) return 'now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.round(days / 7)}w`;
}

/**
 * A stored `YYYY-MM-DD` as `mm/dd/yyyy`.
 *
 * Split rather than parsed: `new Date('2026-09-10')` is midnight UTC, and
 * formatting that in a timezone behind UTC prints the 9th. These are calendar
 * dates with no time in them, so they are treated as text.
 */
function formatDateOnly(raw: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : raw;
}

/** A stored `HH:MM` as `h:MM AM/PM`. */
function formatTimeOnly(raw: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(raw.trim());
  if (!m) return raw;
  const h24 = Number(m[1]);
  const suffix = h24 < 12 ? 'AM' : 'PM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/**
 * The subtitle values a card shows, formatted for the kinds that carry dates.
 *
 * Only these two kinds put a raw date or time in a detail slot; everything else
 * carries a title or a company name and is passed through untouched.
 */
function formatDetail(kind: FeedKind, slot: 1 | 2, value: string): string {
  if (kind === 'meeting_scheduled') return slot === 1 ? formatDateOnly(value) : formatTimeOnly(value);
  if (kind === 'social_event_created' && slot === 1) return value;
  return value;
}

function dayKey(raw: string): string {
  const d = toDate(raw);
  return isNaN(d.getTime()) ? 'unknown' : d.toISOString().slice(0, 10);
}

function dayLabel(key: string, nowMs: number): string {
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const yesterday = new Date(nowMs - 86_400_000).toISOString().slice(0, 10);
  if (key === today) return 'Today';
  if (key === yesterday) return 'Yesterday';
  const d = new Date(key + 'T00:00:00Z');
  if (isNaN(d.getTime())) return key;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

/* ─── The action line ─── */

/**
 * Row 2 — what happened, with the subject in the strong weight.
 *
 * The verb is derived here rather than stored, so the query stays a query. The
 * subject is returned separately so the caller can weight it.
 */
function actionPrefix(item: FeedItem): string {
  switch (item.kind) {
    case 'meeting_held': return 'Meeting held with';
    case 'meeting_scheduled': return 'Scheduled a meeting with';
    case 'touchpoint': return 'Touchpoint with';
    case 'note': return 'Note on';
    case 'note_pinned': return 'Pinned a note on';
    case 'vendor_relationship': return 'Logged';
    case 'attendee_added': return 'Added';
    case 'social_event_created': return 'Created';
    case 'rsvp': return 'RSVP from';
  }
}

/** The tail after the subject, where the sentence needs one. */
function actionSuffix(item: FeedItem): string | null {
  if (item.kind === 'vendor_relationship' && item.detail2) {
    // The type is kept as stored. Lowercasing it turned "SaaS" into "saas" —
    // these are acronyms an admin typed, not words to normalise.
    return item.detail1 ? `as a ${item.detail1} vendor of ${item.detail2}` : `as a vendor of ${item.detail2}`;
  }
  if (item.kind === 'attendee_added' && item.conference) return 'to the attendee list';
  if (item.kind === 'rsvp' && item.detail1) return `for ${item.detail1}`;
  return null;
}

/* ─── Card ─── */

function FeedCard({ item, nowMs }: { item: FeedItem; nowMs: number }) {
  const suffix = actionSuffix(item);
  const showsBody = rendersBody(item.kind);

  const inner = (
    <div
      className={`rounded-xl border border-gray-200 bg-white p-3 hover:border-gray-300 transition-colors ${
        // Pinning is an attribute of a note, not a kind of event — an amber rule
        // rather than a sixth colour on the spine.
        item.pinned ? 'border-l-4 border-l-amber-400' : ''
      }`}
    >
      {/* Row 1 — actor, conference, time. The conference pill sits HERE, with
          the actor, because it identifies the card; the pills at the bottom
          describe the event. */}
      <div className="flex items-center gap-2 min-w-0">
        <span
          className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-white text-[9px] font-semibold"
          style={{ backgroundColor: item.actor.system ? '#9CA3AF' : avatarColour(item.actor.avatarSeed) }}
          title={item.actor.name}
        >
          {/* Initials from the SEED, not the display name: a meeting booked by
              two reps reads "Kevin Winn +1", whose last word is "+1" — that
              produced "K+" on the avatar. The seed is the lead rep's own name,
              which is also what colours it. */}
          {item.actor.system ? '◆' : initials(item.actor.avatarSeed)}
        </span>
        {/* The name gets the space first. The column is ~290px, and a pill that
            refused to shrink was truncating "Marcus Silva" to "Marcus Sil…" —
            who did it matters more than which show, and the show still reads
            from its colour dot when its label is clipped. */}
        <span className="text-xs font-semibold text-gray-800 whitespace-nowrap flex-shrink-0">{item.actor.name}</span>
        {item.conference && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-gray-100 text-[10px] font-medium text-gray-600 min-w-0 flex-shrink">
            <span
              className="w-1.5 h-1.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: conferenceColour(item.conference.name) }}
            />
            <span className="truncate">{item.conference.name}</span>
          </span>
        )}
        <span className="ml-auto text-[10px] text-gray-400 flex-shrink-0">
          {relativeTime(item.occurredAt, nowMs)}
        </span>
      </div>

      {/* Row 2 — the action, subject in the strong weight. */}
      <p className="text-xs text-gray-700 mt-1.5 leading-snug">
        {actionPrefix(item)}{' '}
        <span className="font-semibold text-brand-primary">{item.subject}</span>
        {suffix ? <span> {suffix}</span> : null}
      </p>

      {showsBody ? (
        // Rows 3-4 replaced by the note itself. A note card that does not show
        // its text is a card saying a note exists.
        item.body ? (
          <p className="text-xs text-gray-500 mt-1 leading-snug line-clamp-2">{item.body}</p>
        ) : null
      ) : (
        <>
          {(item.detail1 || item.detail2) && (
            <p className="text-[11px] text-gray-400 mt-0.5 truncate">
              {[
                item.detail1 ? formatDetail(item.kind, 1, item.detail1) : null,
                item.detail2 ? formatDetail(item.kind, 2, item.detail2) : null,
              ].filter(Boolean).join(' · ')}
            </p>
          )}
          {item.pills.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 mt-1.5">
              {item.pills.map(p => (
                <span
                  key={p}
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-medium ${
                    p.toLowerCase() === 'competitor'
                      ? 'bg-red-50 text-red-600'
                      : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {/* A social event carries its date as a pill. */}
                  {/^\d{4}-\d{2}-\d{2}$/.test(p) ? formatDateOnly(p) : p}
                </span>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  return (
    <div className="relative pl-5">
      {/* The spine dot. Positioned against the card rather than the row so it
          lines up with the actor, whatever height the card ends up. */}
      <span
        className={`absolute left-0 top-4 w-2 h-2 rounded-full ${DOT_CLASS[item.colour]}`}
        aria-hidden
      />
      {item.href ? <Link href={item.href} className="block">{inner}</Link> : inner}
    </div>
  );
}

/* ─── Filter chips ─── */

/**
 * The five type filters on one row, scrolling under a chevron pair.
 *
 * The feed column is about 290px and the chips need roughly 360, so they
 * wrapped to a second line — a second line of chrome above a stream whose whole
 * value is vertical space. This scrolls them instead, matching the Admin
 * Settings tab bar rather than inventing a control.
 *
 * The chevrons appear only when there is something to scroll to, and dim rather
 * than vanish at each end, so the rail does not change width as you page along
 * it. On a wide screen they are absent entirely.
 */
function ChipRail({ filter, onSelect }: {
  filter: FeedFilter;
  onSelect: (f: FeedFilter) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const [overflows, setOverflows] = useState(false);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const measure = useCallback(() => {
    const el = railRef.current;
    if (!el) return;
    const scrollable = el.scrollWidth - el.clientWidth;
    setOverflows(scrollable > 1);
    setAtStart(el.scrollLeft <= 1);
    setAtEnd(el.scrollLeft >= scrollable - 1);
  }, []);

  useEffect(() => {
    measure();
    const el = railRef.current;
    if (!el) return;
    // The column is a grid cell whose width changes with the viewport, so this
    // watches the element rather than the window.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure]);

  const nudge = (dir: -1 | 1) => {
    railRef.current?.scrollBy({ left: dir * 110, behavior: 'smooth' });
  };

  const chevron = (dir: -1 | 1, disabled: boolean) => (
    <button
      type="button"
      onClick={() => nudge(dir)}
      disabled={disabled}
      aria-label={dir === -1 ? 'Scroll filters left' : 'Scroll filters right'}
      className={`flex-shrink-0 p-0.5 rounded transition-colors ${
        disabled ? 'text-gray-200' : 'text-gray-400 hover:text-gray-700'
      }`}
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d={dir === -1 ? 'M15 19l-7-7 7-7' : 'M9 5l7 7-7 7'} />
      </svg>
    </button>
  );

  return (
    <div className="flex items-center gap-0.5 mt-3 flex-shrink-0">
      {overflows && chevron(-1, atStart)}
      <div
        ref={railRef}
        onScroll={measure}
        className="flex-1 min-w-0 overflow-x-auto scrollbar-hide"
      >
        <div className="flex items-center gap-1.5 w-max">
          {CHIPS.map(chip => (
            <button
              key={chip.key}
              type="button"
              onClick={() => onSelect(chip.key)}
              className={`px-2.5 py-1 rounded-full text-[11px] font-medium whitespace-nowrap transition-colors ${
                filter === chip.key
                  ? 'bg-brand-primary text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
      </div>
      {overflows && chevron(1, atEnd)}
    </div>
  );
}

/* ─── The panel ─── */

interface FeedResponse {
  items: FeedItem[];
  hasMore: boolean;
  inProgressCount: number;
}

const PAGE = 30;
/**
 * 45s while the tab is in front, 120s behind it.
 *
 * Slower than the notification bell's 30s on purpose: the bell is addressed to
 * you and the feed is ambient. pollingManager stops it entirely when the window
 * loses focus, so a backgrounded dashboard costs nothing.
 */
const POLL_FG_MS = 45_000;
const POLL_BG_MS = 120_000;

/** Where "new since you last looked" is remembered. Per browser, by design. */
const SEEN_KEY = 'parlay.feed.lastSeenAt';

export function DashboardFeed({ className = '' }: { className?: string }) {
  const [scope, setScope] = useState<FeedScope>('in_progress');
  const [filter, setFilter] = useState<FeedFilter>('all');
  const [data, setData] = useState<FeedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  /**
   * Distinct from `loading`: a manual refresh spins the icon and leaves the
   * stream on screen, where the first load replaces it with a skeleton. Losing
   * what you were reading because you pressed refresh is the wrong trade.
   */
  const [refreshing, setRefreshing] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;

  useEffect(() => {
    try { setLastSeen(window.localStorage.getItem(SEEN_KEY)); } catch { /* private mode */ }
  }, []);

  const load = useCallback(async (opts: { silent?: boolean; spin?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    if (opts.spin) setRefreshing(true);
    try {
      const res = await fetch(`/api/feed?scope=${scopeRef.current}&limit=${PAGE}`, { cache: 'no-store' });
      if (!res.ok) throw new Error();
      setData(await res.json() as FeedResponse);
      setNowMs(Date.now());
    } catch {
      // A feed is furniture. Keep whatever is on screen rather than blanking it
      // because one poll failed.
      if (!opts.silent) setData(d => d ?? { items: [], hasMore: false, inProgressCount: 0 });
    } finally {
      if (!opts.silent) setLoading(false);
      // A spin too fast to see reads as a button that did nothing, so it is
      // held briefly rather than cut the instant the response lands.
      if (opts.spin) setTimeout(() => setRefreshing(false), 400);
    }
  }, []);

  useEffect(() => { load(); }, [scope, load]);

  // Poll only while something is running. An account between shows polls
  // nothing at all — there is no source of new items to discover.
  const shouldPoll = (data?.inProgressCount ?? 0) > 0;
  useEffect(() => {
    if (!shouldPoll) { stopPolling('dashboard-feed'); return; }
    startPolling('dashboard-feed', () => { void load({ silent: true }); }, POLL_FG_MS, POLL_BG_MS);
    return () => stopPolling('dashboard-feed');
  }, [shouldPoll, load]);

  const items = useMemo(
    () => (data?.items ?? []).filter(i => matchesFilter(i.kind as FeedKind, filter)),
    [data, filter],
  );

  const newCount = useMemo(() => {
    if (!lastSeen) return 0;
    return (data?.items ?? []).filter(i => i.occurredAt > lastSeen).length;
  }, [data, lastSeen]);

  /** Mark everything currently loaded as seen. */
  const markSeen = () => {
    const newest = data?.items[0]?.occurredAt;
    if (!newest) return;
    try { window.localStorage.setItem(SEEN_KEY, newest); } catch { /* private mode */ }
    setLastSeen(newest);
  };

  const loadMore = async () => {
    const oldest = data?.items[data.items.length - 1]?.occurredAt;
    if (!oldest) return;
    setLoadingMore(true);
    try {
      const res = await fetch(
        `/api/feed?scope=${scope}&limit=${PAGE}&before=${encodeURIComponent(oldest)}`,
        { cache: 'no-store' },
      );
      if (!res.ok) throw new Error();
      const next = await res.json() as FeedResponse;
      setData(d => (d ? { ...next, items: [...d.items, ...next.items] } : next));
    } catch {
      /* the button stays; pressing it again retries */
    } finally {
      setLoadingMore(false);
    }
  };

  // Group into days as we go, rather than building a nested structure: the list
  // is already in order, so a header is just the first item of a new day.
  const rows: Array<{ type: 'day'; key: string } | { type: 'item'; item: FeedItem }> = [];
  let seenDay: string | null = null;
  for (const item of items) {
    const key = dayKey(item.occurredAt);
    if (key !== seenDay) { rows.push({ type: 'day', key }); seenDay = key; }
    rows.push({ type: 'item', item });
  }

  return (
    <div className={`card flex flex-col min-h-0 ${className}`}>
      {/* Header */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="relative flex w-2 h-2 flex-shrink-0" aria-hidden>
          {shouldPoll && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60" />
          )}
          <span className={`relative inline-flex rounded-full h-2 w-2 ${shouldPoll ? 'bg-green-500' : 'bg-gray-300'}`} />
        </span>
        <h2 className="text-base font-semibold text-brand-primary font-serif">Feed</h2>
        {newCount > 0 && (
          <button
            type="button"
            onClick={markSeen}
            title="Mark as seen"
            className="px-1.5 py-0.5 rounded-full bg-brand-secondary/10 text-brand-secondary text-[10px] font-semibold"
          >
            {newCount} new
          </button>
        )}

        <div className="ml-auto inline-flex items-center gap-1 bg-gray-100 rounded-lg p-1 flex-shrink-0">
          {([['in_progress', 'In progress'], ['all', 'All']] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setScope(key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                scope === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Refresh. The stream polls itself, but only while a conference is
            running — between shows this is the only way to pull new items, and
            during one it answers "is this actually live?" without waiting 45s. */}
        <button
          type="button"
          onClick={() => { void load({ silent: true, spin: true }); }}
          disabled={refreshing}
          title="Refresh the feed"
          aria-label="Refresh the feed"
          className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:hover:bg-transparent transition-colors"
        >
          <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Type filters — one row, client-side over what is already loaded.
          Five chips do not fit a ~290px column, and wrapping them cost a second
          line of chrome above a stream that wants the height. Scrolls instead,
          with the same chevron pair the Admin Settings tab bar uses. */}
      <ChipRail filter={filter} onSelect={setFilter} />

      {/* The stream. Ordinary vertical scroll — the wheel behaves the way a
          list is expected to, and variable-height cards make paging erratic. */}
      <div className="mt-3 flex-1 min-h-0 overflow-y-auto -mr-1 pr-1">
        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
          </div>
        ) : rows.length === 0 ? (
          <FeedEmptyState
            scope={scope}
            filter={filter}
            inProgressCount={data?.inProgressCount ?? 0}
            loadedCount={data?.items.length ?? 0}
            onSwitchToAll={() => setScope('all')}
            onClearFilter={() => setFilter('all')}
          />
        ) : (
          <div className="relative">
            {/* The spine, behind the dots. */}
            <span className="absolute left-[3px] top-2 bottom-2 w-px bg-gray-200" aria-hidden />
            <div className="space-y-2">
              {rows.map(row => row.type === 'day' ? (
                // Sticky, so a day stays named while you scroll through it.
                <div
                  key={`day-${row.key}`}
                  className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm py-1 pl-5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide"
                >
                  {dayLabel(row.key, nowMs)}
                </div>
              ) : (
                <FeedCard key={row.item.id} item={row.item} nowMs={nowMs} />
              ))}
            </div>

            {data?.hasMore && (
              <div className="pl-5 pt-3 pb-1">
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loadingMore}
                  className="w-full py-2 rounded-lg border border-gray-200 text-xs font-medium text-gray-500 hover:bg-gray-50 transition-colors"
                >
                  {loadingMore ? 'Loading…' : 'Show earlier activity'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Three different nothings, which read very differently.
 *
 * Between shows, In progress is the DEFAULT view and is empty for weeks at a
 * time. It must not read as broken, so it names the reason and points at the
 * control that fixes it.
 */
function FeedEmptyState({ scope, filter, inProgressCount, loadedCount, onSwitchToAll, onClearFilter }: {
  scope: FeedScope;
  filter: FeedFilter;
  inProgressCount: number;
  loadedCount: number;
  onSwitchToAll: () => void;
  onClearFilter: () => void;
}) {
  // A filter is hiding things that are actually loaded — say which one, because
  // the chip is the thing to press and it is easy to forget it is set.
  if (filter !== 'all' && loadedCount > 0) {
    const label = CHIPS.find(c => c.key === filter)?.label ?? filter;
    return (
      <div className="text-center py-10 px-4">
        <p className="text-sm text-gray-500">No {label.toLowerCase()} in this view.</p>
        <button type="button" onClick={onClearFilter} className="text-xs text-brand-secondary font-medium hover:underline mt-1">
          Clear the filter
        </button>
      </div>
    );
  }

  if (scope === 'in_progress' && inProgressCount === 0) {
    return (
      <div className="text-center py-10 px-4">
        <p className="text-sm text-gray-500">No conferences in progress. Switch to All to see recent activity.</p>
        <button type="button" onClick={onSwitchToAll} className="text-xs text-brand-secondary font-medium hover:underline mt-2">
          Switch to All
        </button>
      </div>
    );
  }

  if (scope === 'in_progress') {
    return (
      <div className="text-center py-10 px-4">
        <p className="text-sm text-gray-500">Nothing logged at the conference yet.</p>
      </div>
    );
  }

  // All, and genuinely nothing in 90 days. No toggle to point at.
  return (
    <div className="text-center py-10 px-4">
      <p className="text-sm text-gray-500">No activity in the last 90 days.</p>
    </div>
  );
}
