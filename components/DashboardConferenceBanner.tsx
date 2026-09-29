'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { ProgramConferenceCard, type ProgramCardConference, type ProgramCardTerritory } from '@/components/ProgramConferenceCard';
import { QuickViewDrawer, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { postConferenceDaysRemaining } from '@/lib/conference-stage';
import { bannerBands, bannerHeadline, type BannerHeadlineKind } from '@/lib/dashboardBannerConferences';

/**
 * The dashboard's conference banner.
 *
 * It used to name the one conference a rep was going to next and spend its
 * expanded half on a prep checklist for it. The checklist went unused, and the
 * one-conference headline was silent whenever the next thing was not the
 * interesting thing — a show under way, or one still being written up.
 *
 * Collapsed it now leads with whatever is actually happening; expanded it is
 * the Program tab's own cards, so the dashboard and the conferences page show
 * one thing rather than two views of it.
 */

function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate + 'T00:00:00');
  const end = new Date(endDate + 'T00:00:00');
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${startStr} – ${endStr}, ${end.getFullYear()}`;
}

function cityStateLabel(c: ProgramCardConference): string | null {
  if (c.location_city && c.location_state) return `${c.location_city}, ${c.location_state}`;
  return c.location || null;
}

function daysUntil(startDate: string): number {
  return Math.max(0, Math.ceil((new Date(startDate + 'T00:00:00').getTime() - Date.now()) / 86_400_000));
}

/**
 * The eyebrow over each headline conference.
 *
 * Coloured by what it says rather than uniformly: green is a show that is
 * happening, amber one whose window is closing, and the plain one is a date in
 * the future. The same three colours the Program tab's cards use for the same
 * three states.
 */
function HeadlinePill({ kind, conference }: { kind: BannerHeadlineKind; conference: ProgramCardConference }) {
  if (kind === 'in_progress') {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[11px] font-semibold whitespace-nowrap">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        In Progress
      </span>
    );
  }
  if (kind === 'post_conference') {
    const left = postConferenceDaysRemaining({ end_date: conference.end_date, post_conference_days: conference.post_conference_days ?? null });
    return (
      <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-200 text-[11px] font-semibold whitespace-nowrap">
        Post-Conference · {left} days left
      </span>
    );
  }
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-white/10 text-white/70 text-[11px] font-semibold whitespace-nowrap">
      {daysUntil(conference.start_date)} days away
    </span>
  );
}

export function DashboardConferenceBanner() {
  // Starts expanded to match what the server rendered, then takes the stored
  // preference after mount. Reading localStorage during the first render made
  // anyone who had collapsed the banner disagree with the server HTML, and this
  // banner sits in a Suspense boundary, so that mismatch took the whole
  // dashboard down (React #418 → #422 → a crash inside React's recovery).
  const [collapsed, setCollapsed] = useState(false);
  const [conferences, setConferences] = useState<ProgramCardConference[] | null>(null);
  const [territories, setTerritories] = useState<ProgramCardTerritory[]>([]);
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);

  useEffect(() => {
    setCollapsed(localStorage.getItem('parlay_banner_collapsed') === 'true');
  }, []);

  /*
   * The same payload the Program tab reads, rather than a second query that
   * answers nearly the same question. The cards below are that page's own
   * cards, so anything less than its own rows would be a shape to keep in
   * step by hand.
   */
  useEffect(() => {
    let live = true;
    // Both of these answer with an OBJECT around their rows, not a bare array.
    // Reading them as arrays leaves the banner permanently empty while the
    // request succeeds, which is what it did.
    fetch('/api/conferences?enriched=1')
      .then(r => (r.ok ? r.json() : { conferences: [] }))
      .then((data: { conferences?: ProgramCardConference[] }) => {
        if (live) setConferences(data.conferences ?? []);
      })
      .catch(() => { if (live) setConferences([]); });
    fetch('/api/admin/territories')
      .then(r => (r.ok ? r.json() : { territories: [] }))
      .then((data: { territories?: ProgramCardTerritory[] }) => {
        if (live) setTerritories(data.territories ?? []);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  const toggle = () => {
    setCollapsed(v => {
      const next = !v;
      localStorage.setItem('parlay_banner_collapsed', String(next));
      return next;
    });
  };

  const headline = useMemo(() => bannerHeadline(conferences ?? []), [conferences]);
  const bands = useMemo(() => bannerBands(conferences ?? []), [conferences]);
  const planYear = new Date().getFullYear();

  return (
    <div className="bg-brand-primary rounded-2xl p-6 text-white h-full flex flex-col">
      {/* Collapsed header — always visible */}
      <div className="cursor-pointer flex items-start justify-between gap-3" onClick={toggle}>
        {headline.items.length > 0 ? (
          /* One line, scrolling, with a rule between each. Several shows run at
             once often enough that stacking them would push the rest of the
             dashboard down for a week at a time. */
          <ScrollRow className="min-w-0 flex-1" gapClass="gap-0" step={260}>
            {headline.items.map((c, i) => (
              <div key={c.id} className={`min-w-0 flex-shrink-0 ${i > 0 ? 'border-l border-white/20 pl-5 ml-5' : ''}`}>
                <HeadlinePill kind={headline.kind} conference={c} />
                <h1 className="text-2xl font-bold font-serif whitespace-nowrap mt-1">{c.name}</h1>
                {/* Dates and place on one line: two facts about where to be,
                    which read as one. */}
                <p className="text-white/60 text-sm mt-0.5 whitespace-nowrap">
                  {formatDateRange(c.start_date, c.end_date)}
                  {cityStateLabel(c) && <> · {cityStateLabel(c)}</>}
                </p>
              </div>
            ))}
          </ScrollRow>
        ) : (
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-bold font-serif">
              {/* A non-breaking space would hold the line too, but it is
                  invisible in the source; this says what it is doing. */}
              {conferences === null
                ? <span className="opacity-0">Loading conferences</span>
                : 'No Active or Upcoming Conferences'}
            </h1>
          </div>
        )}
        <svg
          className={`w-5 h-5 text-white/60 flex-shrink-0 mt-1 transition-transform duration-200 ${collapsed ? '' : 'rotate-180'}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </div>

      {/* Expanded content — the Program tab's cards, in its own three bands. */}
      {!collapsed && bands.length > 0 && (
        /*
         * As tall as the cards it holds.
         *
         * It used to be capped at two rows and scroll past that, and the cap
         * landed wherever it landed — through the middle of a card, under a
         * band heading with nothing visible beneath it. A card sliced in half
         * reads as something failing to load rather than as something to
         * scroll, and the thin scrollbar that would have said otherwise only
         * appears once a pointer is over it.
         *
         * Nothing needs a cap here: the whole half is behind the chevron, and
         * that choice is remembered, so anyone who wants the dashboard short
         * collapses it once.
         */
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3 content-start">
          {bands.map(band => (
            <div key={band.label} className="contents">
              <p className="sm:col-span-2 text-white/50 text-[11px] font-semibold uppercase tracking-wider">
                {band.label}
              </p>
              {/* The Program tab's card, unwrapped — it paints its own white
                  surface, and the wrapper that used to sit around it clipped
                  the shadow it lifts on hover. */}
              {band.items.map(c => (
                <ProgramConferenceCard
                  key={c.id}
                  conference={c}
                  territories={territories}
                  planYear={planYear}
                  allConferences={[]}
                  onRepsUpdated={() => {}}
                  onQuickView={setQuickView}
                />
              ))}
            </div>
          ))}
        </div>
      )}

      {quickView && <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />}
    </div>
  );
}
