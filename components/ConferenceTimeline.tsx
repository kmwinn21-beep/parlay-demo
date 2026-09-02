'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { FadeCollapse } from '@/components/CollapseAnimation';

/**
 * Every conference a record has been to, most recent first, with what happened
 * at each one beneath it.
 *
 * Shared by the attendee and company pages: the two differ only in scope — an
 * attendee's counts are their own, a company's are the same things totalled
 * across its attendees — and that difference lives in the endpoint, not here.
 *
 * Deliberately a flat list of conferences rather than a grouping by series.
 * Grouping reads well in a mock-up and badly in use: it buries the thing
 * anyone actually scans for, which is what happened and when.
 */

interface Breakdown { label: string; count: number }

interface TimelineItem {
  key: 'internal_attendees' | 'meetings' | 'touchpoints' | 'event_attendees';
  title: string;
  count: number;
  breakdown: Breakdown[];
  names?: string[];
}

interface TimelineConference {
  id: number;
  name: string;
  start_date: string | null;
  end_date: string | null;
  location: string | null;
  logo_url: string | null;
  upcoming: boolean;
  items: TimelineItem[];
}

/** One colour per kind, so a row is identifiable before it is read. */
const DOT: Record<TimelineItem['key'], string> = {
  internal_attendees: 'bg-indigo-500',
  meetings: 'bg-blue-500',
  touchpoints: 'bg-purple-500',
  event_attendees: 'bg-emerald-500',
};

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  return (words[0][0] + (words[1]?.[0] ?? '')).toUpperCase();
}

/** "Aug 24–26, 2026", or the long form when the range crosses a month. */
function formatRange(start: string | null, end: string | null): string {
  if (!start) return '';
  const s = new Date(`${start}T00:00:00`);
  const e = end ? new Date(`${end}T00:00:00`) : null;
  const mon = (d: Date) => d.toLocaleDateString('en-US', { month: 'short' });
  if (!e || start === end) return `${mon(s)} ${s.getDate()}, ${s.getFullYear()}`;
  if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) {
    return `${mon(s)} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`;
  }
  return `${mon(s)} ${s.getDate()} – ${mon(e)} ${e.getDate()}, ${e.getFullYear()}`;
}

/** The conference's year, appended when the name doesn't already carry one. */
function nameWithYear(name: string, start: string | null): string {
  if (!start) return name;
  const year = start.slice(0, 4);
  return name.includes(year) ? name : `${name} ${year}`;
}

function subtextFor(item: TimelineItem): string {
  if (item.names && item.names.length > 0) return item.names.join(' · ');
  return item.breakdown.map(b => `${b.label}: ${b.count}`).join(' · ');
}

/**
 * The subtext line. On a phone it stays one row and scrolls sideways — a
 * wrapped breakdown pushes the next conference off the screen. On a desktop it
 * truncates with a chevron that wraps it open, and the chevron only appears
 * when there is actually something hidden.
 */
function Subtext({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setOverflows(el.scrollWidth > el.clientWidth + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text]);

  if (!text) return null;

  return (
    <>
      <div className="lg:hidden overflow-x-auto scrollbar-hide">
        <p className="text-xs text-gray-500 whitespace-nowrap">{text}</p>
      </div>
      <div className="hidden lg:flex items-start gap-1">
        <span
          ref={ref}
          className={`text-xs text-gray-500 min-w-0 ${expanded ? 'whitespace-normal' : 'truncate whitespace-nowrap'}`}
        >
          {text}
        </span>
        {(overflows || expanded) && (
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            aria-label={expanded ? 'Show less' : 'Show more'}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        )}
      </div>
    </>
  );
}

export function ConferenceTimeline({ entityType, entityId, title = 'Conference Timeline' }: {
  entityType: 'attendee' | 'company';
  entityId: number;
  /** Overridable because section names are renameable per account. */
  title?: string;
}) {
  const [conferences, setConferences] = useState<TimelineConference[]>([]);
  const [attendeeCount, setAttendeeCount] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [sort, setSort] = useState<'recent' | 'earliest'>('recent');
  const [sortOpen, setSortOpen] = useState(false);

  const sortRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/conference-timeline?entity_type=${entityType}&entity_id=${entityId}`, { cache: 'no-store' })
      .then(r => (r.ok ? r.json() : { conferences: [], attendeeCount: 0 }))
      .then((data: { conferences: TimelineConference[]; attendeeCount: number }) => {
        if (cancelled) return;
        setConferences(Array.isArray(data.conferences) ? data.conferences : []);
        setAttendeeCount(Number(data.attendeeCount ?? 0));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
  }, [entityType, entityId]);

  useEffect(() => {
    if (!sortOpen) return;
    const onDown = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [sortOpen]);

  const ordered = useMemo(() => {
    const rows = [...conferences];
    rows.sort((a, b) => {
      const av = a.start_date ?? '';
      const bv = b.start_date ?? '';
      return sort === 'recent' ? bv.localeCompare(av) : av.localeCompare(bv);
    });
    return rows;
  }, [conferences, sort]);

  if (!loaded) return null;

  const countText = entityType === 'company'
    ? `${conferences.length} ${conferences.length === 1 ? 'conference' : 'conferences'} · ${attendeeCount} ${attendeeCount === 1 ? 'attendee' : 'attendees'}`
    : `${conferences.length} ${conferences.length === 1 ? 'conference' : 'conferences'}`;

  return (
    <div className="card">
      {/* Wraps rather than breaking the title: this section sits in a narrow
          column on both pages, and a two-line "Conference / Timeline" reads
          worse than the count dropping to its own row. */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <h2 className="text-base font-semibold text-brand-primary font-serif whitespace-nowrap">{title}</h2>

        <div className="relative" ref={sortRef}>
          <button
            type="button"
            onClick={() => setSortOpen(v => !v)}
            aria-label="Sort conferences"
            title="Sort"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-50 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4h13M3 8h9M3 12h5m5 8V8m0 12l-3-3m3 3l3-3" />
            </svg>
          </button>
          {sortOpen && (
            <div className="absolute left-0 top-full mt-1 z-30 w-40 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
              {([['recent', 'Most Recent'], ['earliest', 'Earliest']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => { setSort(key); setSortOpen(false); }}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                    sort === key ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>

        <span className="ml-auto text-xs text-gray-400 whitespace-nowrap">{countText}</span>
      </div>

      {ordered.length === 0 ? (
        <p className="text-sm text-gray-400">No conferences yet.</p>
      ) : (
        <FadeCollapse rows={1} label="conference timeline">
          <div className="space-y-5">
              {ordered.map(conf => {
                // A conference that has been and gone with nothing recorded
                // recedes — it is context, not activity.
                const quiet = !conf.upcoming && conf.items.length === 0;
                return (
                  <div key={conf.id} className="flex gap-3">
                    <div className={`w-10 h-10 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center text-xs font-bold font-serif ${
                      quiet ? 'bg-gray-100 text-gray-300' : 'bg-brand-primary text-white'
                    }`}>
                      {conf.logo_url
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={conf.logo_url} alt="" className={`w-full h-full object-contain ${quiet ? 'opacity-40' : ''}`} />
                        : initials(conf.name)}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/conferences/${conf.id}`}
                          // Wraps instead of truncating — the year is the end
                          // of the name and the part most worth keeping.
                          className={`text-sm font-semibold min-w-0 break-words ${quiet ? 'text-gray-400' : 'text-brand-primary hover:text-brand-secondary hover:underline'}`}
                        >
                          {nameWithYear(conf.name, conf.start_date)}
                        </Link>
                        {conf.upcoming && (
                          <span className="ml-auto flex-shrink-0 text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-brand-secondary border border-blue-100">
                            Upcoming
                          </span>
                        )}
                      </div>
                      <p className={`text-xs ${quiet ? 'text-gray-300' : 'text-gray-500'}`}>
                        {[conf.location, formatRange(conf.start_date, conf.end_date)].filter(Boolean).join(' · ')}
                      </p>

                      {quiet && (
                        <p className="text-xs text-gray-300 italic mt-1">Attended — No Activity</p>
                      )}

                      {conf.items.length > 0 && (
                        <div className="mt-2 space-y-2.5 border-l border-gray-200 pl-3 ml-1">
                          {conf.items.map(item => (
                            <div key={item.key} data-collapse-row className="relative">
                              <span className={`absolute -left-[17px] top-1.5 w-2 h-2 rounded-full ${DOT[item.key]}`} />
                              <p className="text-xs font-semibold text-gray-800">
                                {item.count} {item.title}
                              </p>
                              <Subtext text={subtextFor(item)} />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        </FadeCollapse>
      )}
    </div>
  );
}
