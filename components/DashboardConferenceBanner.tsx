'use client';

import { useEffect, useMemo, useState } from 'react';
import { ScrollRow } from '@/components/ScrollRow';
import { ProgramConferenceCard, type ProgramCardConference, type ProgramCardTerritory } from '@/components/ProgramConferenceCard';
import { QuickViewDrawer, type QuickViewTarget } from '@/components/QuickViewDrawer';
import { postConferenceDaysRemaining } from '@/lib/conference-stage';
import { bannerBands, bannerHeadline, type BannerHeadlineKind } from '@/lib/dashboardBannerConferences';
import { closesInLabel, conferenceDayLabel, startsInLabel } from '@/lib/conferenceCardBar';
import { useIsPhone } from '@/lib/useIsPhone';

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

/**
 * How wide a card sits in its row.
 *
 * A width rather than a column, because a card in a scrolling row has no
 * column to take one from. Two of them: a phone has about 310px of banner to
 * work with and the chevron takes 26 of it, so the desktop width overhangs
 * the row and the last card on the line comes out clipped. Both measured in
 * Chromium, against the real dashboard layout at 1500px and at 390px.
 */
const CARD_WIDTH = 288;
const CARD_WIDTH_PHONE = 248;
/** One card and the gap after it, so a chevron lands on a card edge. */
const cardStep = (width: number) => width + 12;

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
 * The eyebrow over each headline conference: what stage it is in, and where
 * in that stage it is.
 *
 * Two pills rather than one sentence. The stage was carrying its countdown
 * along with it — "Post-Conference · 10 days left" — which put the least
 * changeable fact and the most changeable one in the same breath and left the
 * planning case with no stage on it at all, just a number.
 *
 * The second pill says exactly what the card below it says on its own top bar,
 * from the same functions, so the headline and the card cannot come to
 * disagree about which day of a show it is.
 *
 * Coloured by stage rather than uniformly: green is a show that is happening,
 * amber one whose window is closing, and the plain one is a date in the
 * future — the same three states the Program tab's cards colour the same way.
 * The pair share a colour so they read as one thing said twice over, and the
 * detail takes a border to sit apart from the stage without taking a second
 * hue to do it.
 */
const PILL = 'inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap';

const STAGE_TONE: Record<Exclude<BannerHeadlineKind, 'none'>, { fill: string; outline: string; label: string }> = {
  in_progress: {
    fill: 'bg-emerald-400/20 text-emerald-300',
    outline: 'border border-emerald-400/40 text-emerald-300',
    label: 'In Progress',
  },
  post_conference: {
    fill: 'bg-amber-400/20 text-amber-200',
    outline: 'border border-amber-400/40 text-amber-200',
    label: 'Post-Conference',
  },
  planning: {
    fill: 'bg-white/10 text-white/70',
    outline: 'border border-white/25 text-white/70',
    label: 'Planning',
  },
  closed: {
    fill: 'bg-white/10 text-white/70',
    outline: 'border border-white/25 text-white/70',
    label: 'Closed',
  },
};

/** Where in its stage the conference is — the card's own top-bar line. */
function stageDetail(kind: BannerHeadlineKind, c: ProgramCardConference): string | null {
  if (kind === 'in_progress') return conferenceDayLabel(c.start_date, c.end_date);
  if (kind === 'post_conference') {
    return closesInLabel(postConferenceDaysRemaining({
      end_date: c.end_date,
      post_conference_days: c.post_conference_days ?? null,
    }));
  }
  if (kind === 'planning') return startsInLabel(daysUntil(c.start_date));
  // A closed conference is never a headline, so there is no countdown to draw.
  return null;
}

function HeadlinePill({ kind, conference }: { kind: BannerHeadlineKind; conference: ProgramCardConference }) {
  if (kind === 'none') return null;
  const tone = STAGE_TONE[kind];
  const detail = stageDetail(kind, conference);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`${PILL} ${tone.fill}`}>
        {/* The one stage that is happening right now gets the dot. */}
        {kind === 'in_progress' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
        {tone.label}
      </span>
      {detail && <span className={`${PILL} ${tone.outline}`}>{detail}</span>}
    </span>
  );
}

export function DashboardConferenceBanner() {
  /*
   * Shut until somebody opens it.
   *
   * The dashboard's own sections are what the page is for; the banner is its
   * header, and opening by default put a panel of conference cards over them
   * every time the page loaded.
   *
   * The stored preference is read AFTER mount, never during the first render:
   * reading localStorage there made anyone whose stored state differed
   * disagree with the server HTML, and this banner sits in a Suspense
   * boundary, so that mismatch took the whole dashboard down (React #418 →
   * #422 → a crash inside React's recovery). Collapsed is now both the
   * server's output and the first client render, so they agree by default.
   *
   * Absent means collapsed, so the new default reaches everyone who has not
   * expressed a preference. Only an explicit 'false' — somebody who opened it
   * — reopens it.
   */
  const [collapsed, setCollapsed] = useState(true);
  const [conferences, setConferences] = useState<ProgramCardConference[] | null>(null);
  const [territories, setTerritories] = useState<ProgramCardTerritory[]>([]);
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const isPhone = useIsPhone();

  useEffect(() => {
    setCollapsed(localStorage.getItem('parlay_banner_collapsed') !== 'false');
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

  /*
   * The expanded half floats over the dashboard rather than lifting it.
   *
   * It used to be a block inside the banner, so opening it grew the banner and
   * pushed Attendees / Agenda / Meetings and everything under them down the
   * page — the sections you are reading move out from under you, and closing
   * it snaps them back. The header stays in flow, so the row it sits in keeps
   * the height it has when the banner is shut, and the cards drop over what is
   * below on their own layer.
   */
  const expanded = !collapsed && bands.length > 0;
  const cardWidth = isPhone ? CARD_WIDTH_PHONE : CARD_WIDTH;

  return (
    <div className="relative h-full">
      <div className={`bg-brand-primary p-6 text-white h-full flex flex-col rounded-2xl ${expanded ? 'rounded-b-none shadow-2xl' : ''}`}>
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
      </div>

      {/* Expanded content — the Program tab's cards, in its own three bands. */}
      {expanded && (
        /*
         * One line per band, scrolled rather than wrapped.
         *
         * It was a two-column grid, so a band of six cards was three rows deep
         * and the three bands together ran past the fold — which is how the
         * expanded half came to be the tallest thing on the dashboard. A band
         * is now one line: the chevrons page through it, and a touch screen
         * swipes it.
         *
         * `top-full` puts it directly under the header, whose bottom corners
         * are squared off while this is open so the two read as one surface.
         */
        <div className="absolute left-0 right-0 top-full z-30 bg-brand-primary rounded-b-2xl px-6 pb-6 pt-1 shadow-2xl">
          {bands.map(band => (
            <div key={band.label} className="mt-3 first:mt-1">
              <p className="text-white/50 text-[11px] font-semibold uppercase tracking-wider mb-2">
                {band.label}
              </p>
              {/* One card plus its gap per press, so a chevron lands on a card
                  edge rather than part-way through one. */}
              <ScrollRow gapClass="gap-3" alignClass="items-stretch" step={cardStep(cardWidth)}>
                {band.items.map(c => (
                  /* A fixed width, because a card in a scrolling row has no
                     column to take one from. `grid` rather than `flex` on the
                     wrapper: a lone grid item stretches to both the width set
                     here and the height of the tallest card on the line, which
                     is what keeps the row's bottom edge straight.

                     The Program tab's card itself is unwrapped in every other
                     sense — it paints its own white surface, and a wrapper with
                     a background of its own clipped the shadow it lifts on
                     hover. */
                  <div key={c.id} className="flex-shrink-0 grid" style={{ width: cardWidth }}>
                    <ProgramConferenceCard
                      conference={c}
                      territories={territories}
                      planYear={planYear}
                      allConferences={[]}
                      onRepsUpdated={() => {}}
                      onQuickView={setQuickView}
                      // Just the list pill here. The card is narrower in this
                      // row than it is on the Program tab and the two pills
                      // wrapped onto separate lines; the dashboard's question
                      // is whether the list is in, and outreach is assigned on
                      // the page that shows both.
                      showOutreach={false}
                      // And a button to aim at rather than a card-sized target.
                      // These sit in a row you swipe, inside a panel that opens
                      // over the page — a whole-card link there fires on the
                      // way past it.
                      linkMode="button"
                    />
                  </div>
                ))}
              </ScrollRow>
            </div>
          ))}
        </div>
      )}

      {quickView && <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />}
    </div>
  );
}
