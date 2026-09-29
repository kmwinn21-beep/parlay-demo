/**
 * The dashboard banner: what it leads with, and what it opens into.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/dashboard-banner.mjs
 *
 * It used to name the one conference a rep was going to next and spend its
 * expanded half on a prep checklist for it. The headline was silent whenever
 * the next thing was not the interesting thing — a show under way, or one
 * still being written up — so it now walks a chain, and opens into the Program
 * tab's own cards rather than a second view of them.
 *
 * The chain and the banding are run here rather than read: which rung a
 * headline comes from, and what order the cards sit in, are the parts with
 * rules in them. The layout was measured in Chromium across all four states.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
import { readFileSync } from 'node:fs';

let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { bannerHeadline, bannerBands } = await import('@/lib/dashboardBannerConferences');

const c = (id, name, stage, start, end = start) => ({ id, name, stage, start_date: start, end_date: end });

const LIVE_A = c(1, 'VALA Fall', 'in_progress', '2026-09-28', '2026-09-30');
const LIVE_B = c(2, 'Coastal Care', 'in_progress', '2026-09-27', '2026-09-29');
const POST_A = c(3, 'VBC Workshop', 'post_conference', '2026-09-23', '2026-09-24');
const POST_B = c(4, 'OHCA Annual', 'post_conference', '2026-09-22', '2026-09-23');
const SOON_A = c(5, 'NCAL DAY', 'planning', '2026-10-11', '2026-10-14');
const SOON_B = c(6, 'NIC Fall', 'planning', '2026-10-21', '2026-10-23');
const DONE = c(7, 'Interface SE', 'closed', '2026-08-30', '2026-08-31');
const ALL = [LIVE_A, LIVE_B, POST_A, POST_B, SOON_A, SOON_B, DONE];

console.log('\n— the headline walks down a chain —');
{
  // Each rung is a weaker claim on attention than the one above it, and only
  // one rung shows at a time: a row mixing "happening now" with "in 40 days"
  // reads as a list rather than as a headline.
  eq('a show under way leads', bannerHeadline(ALL).kind, 'in_progress');
  eq('  and only shows that rung',
    bannerHeadline(ALL).items.map(x => x.name), ['Coastal Care', 'VALA Fall']);

  const noLive = ALL.filter(x => x.stage !== 'in_progress');
  eq('with none under way, one still being written up',
    bannerHeadline(noLive).kind, 'post_conference');
  eq('  and both of those', bannerHeadline(noLive).items.length, 2);

  const onlySoon = [SOON_B, SOON_A, DONE];
  eq('with neither, the next one planned', bannerHeadline(onlySoon).kind, 'planning');
  // Soonest first, so the headline leads with the thing to prepare for.
  eq('  soonest first', bannerHeadline(onlySoon).items.map(x => x.name), ['NCAL DAY', 'NIC Fall']);

  // A real state rather than an error: an account between shows has nothing
  // under way and nothing booked. A closed conference is not a headline.
  eq('past ones are not a headline', bannerHeadline([DONE]).kind, 'none');
  eq('  nor is nothing at all', bannerHeadline([]).kind, 'none');
  eq('  and neither offers anything to draw', bannerHeadline([DONE]).items, []);
}

console.log('\n— the bands, in the Program tab’s own order —');
{
  const bands = bannerBands(ALL);
  eq('three bands, in reading order', bands.map(b => b.label), ['Active', 'Upcoming', 'Past']);

  // Active holds both live and closing-window shows, which is the split that
  // page makes; a conference is active from the moment it starts until its
  // post-conference window shuts.
  eq('Active covers both halves of "still going on"',
    bands[0].items.map(x => x.name), ['VALA Fall', 'Coastal Care', 'VBC Workshop', 'OHCA Annual']);
  // Most recent first — the order the conferences endpoint returns and the
  // order the Program tab leaves them in.
  eq('  newest first', bands[0].items.map(x => x.start_date), ['2026-09-28', '2026-09-27', '2026-09-23', '2026-09-22']);
  // Turned around for Upcoming: the next thing to prepare for leads.
  eq('Upcoming runs soonest first', bands[1].items.map(x => x.name), ['NCAL DAY', 'NIC Fall']);
  eq('Past runs newest first', bands[2].items.map(x => x.name), ['Interface SE']);

  // An empty band is dropped rather than left as a heading with nothing under
  // it, which reads as something failing to load.
  eq('an empty band gets no heading', bannerBands([SOON_A]).map(b => b.label), ['Upcoming']);
  eq('  and nothing at all gets none', bannerBands([]), []);
  // A conference with no stage belongs to no band rather than to the first.
  eq('an unstaged conference is in no band', bannerBands([c(9, 'Draft', null, '2026-10-01')]), []);
}

console.log('\n— the banner itself —');
{
  const banner = strip('components/DashboardConferenceBanner.tsx');
  const page = strip('app/page.tsx');

  // The headline row: one line, scrolling, ruled between each.
  eq('the headline is one scrolling row', /<ScrollRow className="min-w-0 flex-1"/.test(banner), true);
  eq('  ruled between conferences', /i > 0 \? 'border-l border-white\/20 pl-5 ml-5' : ''/.test(banner), true);
  // Dates and place on one line, bulleted — two facts about where to be.
  eq('  with the dates and the place on one line',
    /\{formatDateRange\(c\.start_date, c\.end_date\)\}\s*\n\s*\{cityStateLabel\(c\) && <> · \{cityStateLabel\(c\)\}<\/>\}/.test(banner), true);
  // The empty state speaks in the same voice as a conference name.
  eq('  and says so plainly when there is nothing',
    /conferences === null\s*\n\s*\? <span className="opacity-0">Loading conferences<\/span>\s*\n\s*: 'No Active or Upcoming Conferences'/.test(banner), true);
  // Same weight and family as a conference name, as asked.
  eq('  in the same voice as a conference name',
    /<h1 className="text-2xl font-bold font-serif">/.test(banner), true);

  // The expanded half is the Program tab's card, not a copy of it.
  eq('the cards are the Program tab’s own', /<ProgramConferenceCard/.test(banner), true);
  eq('  fed from the same endpoint it reads',
    /fetch\('\/api\/conferences\?enriched=1'\)/.test(banner), true);
  // Declared AND applied. A constant nothing reads caps nothing, which is how
  // the expanded half comes to push Targets off the bottom of the screen.
  eq('  capped rather than pushing the page down',
    /const EXPANDED_MAX_HEIGHT = \d+;/.test(banner), true);
  eq('    with the cap actually on the scrolling half',
    /style=\{\{ maxHeight: EXPANDED_MAX_HEIGHT \}\}/.test(banner), true);
  eq('    which scrolls past it', /overflow-y-auto/.test(banner), true);

  /*
   * The old banner is gone, not orphaned.
   *
   * Its prep checklist, its stat tiles and the server query that fed them had
   * no other caller. Left in place they would be dead code that still
   * compiles, and the next reader would have to work out which banner runs.
   */
  for (const gone of ['BannerStateActive', 'BannerStateUpcoming', 'BannerStateNone', 'PrepChecklist', 'TodayMeeting']) {
    eq(`${gone} is deleted`, new RegExp(gone).test(banner), false);
  }
  eq('the server query that fed it is deleted too', /getBannerData/.test(page), false);
  eq('  and so is the lookup only it used', /getUserDisplayName/.test(page), false);
  eq('the banner reads its own data', /<DashboardConferenceBanner \/>/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
