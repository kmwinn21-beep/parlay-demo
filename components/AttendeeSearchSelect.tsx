'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { AttendeeCardRow } from '@/components/MobileAttendeeCard';
import { useMobileDock, useDockRect } from '@/lib/mobileSearchDock';

/** Rows come back from /api/attendees, which carries more than the card needs. */
export interface AttendeeSearchRow extends AttendeeCardRow {
  email?: string | null;
}

/** How long to wait after a keystroke before asking the server. */
const DEBOUNCE_MS = 250;
/** Enough to scroll, few enough that the menu stays a menu. */
const RESULT_LIMIT = 25;

/**
 * Search every attendee on file, not just the ones already on the record being
 * edited. "Other (not in list)" sits above the results, the way the company
 * pickers do it, so adding someone new is one click rather than a mode switch
 * you have to find.
 *
 * Results are fetched as you type rather than loaded up front — the databases
 * this runs against hold thousands of contacts.
 */
export function AttendeeSearchSelect({
  onPick, onSelectOther, excludeIds, excludeLabel = 'Already added', placeholder = 'Search all attendees…', autoFocus,
}: {
  onPick: (attendee: AttendeeSearchRow) => void;
  /** Adds an "Other (not in list)" entry above the results when provided. */
  onSelectOther?: () => void;
  /** People who can't be picked — shown, but flagged and inert, so it's clear
   *  they exist rather than looking like the search missed them. */
  excludeIds?: Set<number>;
  excludeLabel?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState<AttendeeSearchRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  // On a phone the menu docks under the header instead of anchoring to the
  // field — see lib/mobileSearchDock. The field here is the search box itself,
  // so a docked panel carries its own copy of it and the original is hidden
  // behind the scrim.
  const dock = useMobileDock();
  const dockRect = useDockRect(open && dock);

  useEffect(() => { setMounted(true); }, []);

  // Portalled, so a card with overflow-hidden can't clip the results.
  const position = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    // An open phone keyboard shrinks the visual viewport without changing
    // innerHeight, so measuring against innerHeight offers space the person
    // cannot see and puts the menu behind the keyboard.
    const vv = window.visualViewport;
    const vTop = vv ? vv.offsetTop : 0;
    const vBottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
    const below = vBottom - r.bottom - 8;
    const above = r.top - vTop - 8;
    const flip = below < 160 && above > below;
    const maxHeight = Math.max(120, Math.min(320, flip ? above : below));
    // Flipped, the menu hangs from the input's top edge rather than sitting at
    // the top of the space above it. Anchoring by `top` left a menu shorter
    // than the space available floating well clear of the box it belongs to.
    // `bottom` is measured from the layout viewport, which the keyboard does
    // not shrink — so it uses innerHeight even though the space available above
    // was measured against the visual viewport.
    setPos(flip
      ? { bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, maxHeight }
      : { top: r.bottom + 4, left: r.left, width: r.width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open || dock) { setPos(null); return; }
    position();
    const onScroll = () => position();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    // iOS reports the keyboard opening and closing here and nowhere else —
    // no window resize, no scroll — so without these the menu keeps the
    // position it had when the keyboard appeared.
    const vv = window.visualViewport;
    vv?.addEventListener('resize', onScroll);
    vv?.addEventListener('scroll', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
      vv?.removeEventListener('resize', onScroll);
      vv?.removeEventListener('scroll', onScroll);
    };
  }, [open, dock, position]);

  // The menu's height changes as results arrive, and a flipped menu is
  // measured from its bottom edge — so re-place it when the contents change.
  useEffect(() => { if (open && !dock) position(); }, [open, dock, rows, loading, position]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!wrapRef.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  useEffect(() => {
    const term = search.trim();
    // An empty box shows the first page rather than nothing — with "Other"
    // above it, that's a usable starting state.
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(() => {
      fetch(`/api/attendees?limit=${RESULT_LIMIT}${term ? `&search=${encodeURIComponent(term)}` : ''}`)
        .then(r => (r.ok ? r.json() : []))
        .then((data: AttendeeSearchRow[]) => { if (!cancelled) setRows(Array.isArray(data) ? data : []); })
        .catch(() => { if (!cancelled) setRows([]); })
        .finally(() => { if (!cancelled) setLoading(false); });
    }, DEBOUNCE_MS);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search]);

  const menu = (
    <>
    {dock && <div className="fixed inset-0 z-[99] bg-black/20" onClick={() => setOpen(false)} />}
    <div
      ref={menuRef}
      style={dock && dockRect
        ? { position: 'fixed', top: dockRect.top, left: dockRect.left, width: dockRect.width, maxHeight: dockRect.maxHeight }
        : { position: 'fixed', top: pos?.top, bottom: pos?.bottom, left: pos?.left, width: pos?.width, maxHeight: pos?.maxHeight }}
      className="z-[100] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col overflow-hidden"
    >
      {/* The field this opened from is somewhere down the form and behind the
          scrim, so the docked panel leads with its own search box — otherwise
          there is nowhere on screen to see what is being typed. */}
      {dock && (
        <div className="p-2 border-b border-gray-100 flex-shrink-0">
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={placeholder}
            className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-secondary"
          />
        </div>
      )}
      <div className="overflow-y-auto">
        {onSelectOther && (
          <button
            type="button"
            onClick={() => { onSelectOther(); setOpen(false); }}
            className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
          >
            Other (not in list)
          </button>
        )}
        {loading && rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-3 py-3">Searching…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-gray-400 px-3 py-3">No attendees match.</p>
        ) : rows.map(a => {
          const blocked = excludeIds?.has(a.id) ?? false;
          return (
            <button
              key={a.id}
              type="button"
              disabled={blocked}
              onClick={() => { onPick(a); setOpen(false); setSearch(''); }}
              className={`w-full text-left px-3 py-2 border-b border-gray-50 last:border-b-0 transition-colors ${
                blocked ? 'opacity-60 cursor-default' : 'hover:bg-blue-50'
              }`}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-gray-800 truncate">
                  {a.first_name} {a.last_name}
                </span>
                {blocked && (
                  <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 border border-gray-200 whitespace-nowrap">
                    {excludeLabel}
                  </span>
                )}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {[a.title, a.company_name].filter(Boolean).join(' · ') || '—'}
              </span>
            </button>
          );
        })}
      </div>
    </div>
    </>
  );

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <svg className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
        </svg>
        <input
          autoFocus={autoFocus}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          className="w-full border border-gray-300 rounded-lg pl-9 pr-3 py-2 text-sm bg-white focus:outline-none focus:ring-1 focus:ring-brand-secondary"
        />
      </div>
      {open && mounted && (dock ? dockRect : pos) && createPortal(menu, document.body)}
    </div>
  );
}
