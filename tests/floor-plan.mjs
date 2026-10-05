/**
 * The conference floor plan, and TBD as a meeting time.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/floor-plan.mjs
 *
 * Two things that share a shape: a value that is deliberately not the thing
 * it sits beside. A floor plan is a file the conference points at rather than
 * a copy of one, and TBD is a meeting time that is not a time.
 *
 * Both rules are run. The wiring — where the upload sits, where the menu item
 * sits, when it is dead — is read.
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

const { isFloorPlanType, floorPlanYear } = await import('@/lib/floorPlan');
const {
  MEETING_TIME_OPTIONS, formatMeetingTime, timeToMinutes,
  hasNoStartTime, unscheduledLabel, isTbd, isBoothHours, TBD, BOOTH_HOURS,
} = await import('@/lib/meetingTime');

console.log('\n— what counts as a floor plan —');
{
  eq('a PNG', isFloorPlanType('image/png', 'hall-b.png'), true);
  eq('  a JPEG', isFloorPlanType('image/jpeg', 'plan.jpg'), true);
  eq('  a PDF', isFloorPlanType('application/pdf', 'plan.pdf'), true);
  // Some desktops hand over a dragged file with no type at all.
  eq('  and one with no type, by its name', isFloorPlanType('', 'plan.PDF'), true);
  eq('  or no type at all', isFloorPlanType(null, 'map.jpeg'), true);

  // Accepting these would file something in the Files tab that the Floor Plan
  // button then opens onto nothing.
  eq('not a spreadsheet', isFloorPlanType('application/vnd.ms-excel', 'booths.xls'), false);
  eq('  not a document', isFloorPlanType('application/msword', 'notes.doc'), false);
  eq('  and not a name that merely mentions one', isFloorPlanType('text/plain', 'about-the-pdf.txt'), false);
}

console.log('\n— and which year it is filed under —');
{
  /*
   * The same year the Logistics drawer asks for. The conference page passes
   * `new Date(conference.start_date).getFullYear()` as its planYear, so a
   * plan filed under any other year is stored correctly and shown nowhere.
   */
  eq('the conference’s own year', floorPlanYear('2026-10-21'), 2026);
  eq('  across a year boundary', floorPlanYear('2027-01-04'), 2027);
  // A conference with no date still has to put the file somewhere a person
  // would think to look.
  const today = new Date('2026-06-01T00:00:00Z');
  eq('no start date falls back to this year', floorPlanYear(null, today), 2026);
  eq('  as does an unparseable one', floorPlanYear('soon', today), 2026);
  eq('  and a nonsense year', floorPlanYear('0001-01-01', today), 2026);

  // The page's own expression, so the two cannot drift apart unnoticed.
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the drawer asks for that same year',
    /planYear=\{new Date\(conference\.start_date\)\.getFullYear\(\)\}/.test(page), true);
}

console.log('\n— the plan is a file the conference points at —');
{
  const route = strip('app/api/conferences/[id]/floor-plan/route.ts');
  // Into the table the Files tab reads, which is why it shows up there with
  // the Files tab knowing nothing about this route.
  eq('it is written to the conference’s files',
    /INSERT INTO conference_plan_files/.test(route), true);
  eq('  and only then pointed at',
    route.indexOf('INSERT INTO conference_plan_files') < route.indexOf('SET floor_plan_file_id = ?'), true);
  // A conference naming a file that was never written is the bad order.
  eq('  by id, not by a copied URL', /SET floor_plan_file_id = \?/.test(route), true);

  const confRoute = strip('app/api/conferences/[id]/route.ts');
  eq('the conference reads it back by joining',
    /LEFT JOIN conference_plan_files fp ON fp\.id = c\.floor_plan_file_id/.test(confRoute), true);
  // A LEFT JOIN, so a plan deleted from the Files tab reads as no plan rather
  // than a broken link — which is what greys the menu item out again.
  eq('  and a deleted file reads as no plan',
    /floor_plan_url: conference\.floor_plan_key[\s\S]{0,140}: null,/.test(confRoute), true);

  // Removing it from the form unsets it; the file stays in the Files tab,
  // which has its own delete.
  eq('clearing it only unsets the pointer',
    /SET floor_plan_file_id = NULL/.test(route) && !/DELETE FROM conference_plan_files/.test(route), true);

  /*
   * Appended, not inserted.
   *
   * The runner applies migrations.slice(appliedCount), so inserting shifts
   * every later index and a database already at the old count skips the new
   * row. Checked as "after the ones that were there before it" rather than
   * "last in the file", which stops being true the moment anybody adds the
   * next one correctly — see the hash guard in hubspot-bridge.mjs for the
   * durable version.
   */
  const { migrations } = await import('@/lib/db-migrations');
  const at = migrations.findIndex(m => m.includes('ADD COLUMN floor_plan_file_id'));
  const previousLast = migrations.findIndex(m => m.includes('ALTER TABLE conferences ADD COLUMN event_code'));
  eq('the column is declared once', migrations.filter(m => m.includes('floor_plan_file_id')).length, 1);
  eq('  and added after what came before it', at > previousLast && previousLast !== -1, true);
}

console.log('\n— where the form puts it —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  // Territories to the left of Conference Strategy, sharing a row: Strategy
  // lost the full-width span it used to take.
  eq('Territories comes before Strategy',
    page.indexOf('Select Territories') < page.indexOf('Conference Strategy'), true);
  eq('  and Strategy no longer spans the row',
    /<div className="md:col-span-2">\s*<label className="label">Conference Strategy/.test(page), false);

  // The agenda and the plan share a row for the same reason.
  eq('the agenda no longer spans the row either',
    /<div className="md:col-span-2">\s*<div className="flex items-start justify-between gap-4">\s*<div className="flex-1 min-w-0">\s*<label className="label">Conference Agenda/.test(page), false);
  eq('  and the floor plan upload sits beside it',
    page.indexOf('Conference Agenda') < page.indexOf('<FloorPlanUpload'), true);
}

console.log('\n— and the menu item —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  const menu = page.slice(page.indexOf('Floor Plan\n'), page.indexOf('Field Report'));
  eq('Floor Plan sits above Field Report',
    page.indexOf('Floor Plan\n') < page.indexOf('Field Report'), true);
  eq('  dead when there is nothing to show', /disabled=\{!floorPlan\.url\}/.test(page), true);
  // A disabled row with no explanation reads as a bug.
  eq('  and says why', /No floor plan uploaded for this conference yet/.test(page), true);
  eq('  the viewer only opens with a plan',
    /\{floorPlanOpen && floorPlan\.url && \(/.test(page), true);
  eq('  (nothing between it and Field Report)', menu.includes('<button'), true);
}

console.log('\n— TBD is a time that is not a time —');
{
  const labels = MEETING_TIME_OPTIONS.map(o => o.label);
  eq('it is offered', labels.includes('TBD'), true);
  // Directly under Booth Hours: both are answers to "when" that step past the
  // clock, and the sixty-four slots below are scrolled rather than read.
  eq('  directly below Booth Hours', labels.slice(0, 3), ['Booth Hours', 'TBD', '6:00 AM']);
  eq('  and the value is the sentinel', MEETING_TIME_OPTIONS[1].value, TBD);

  eq('it reads as TBD', formatMeetingTime(TBD), 'TBD');
  eq('  whatever the casing stored', formatMeetingTime('TBD'), 'TBD');
  eq('  and booth hours still reads as itself', formatMeetingTime(BOOTH_HOURS), 'Booth Hours');
  eq('  a real time is untouched', formatMeetingTime('09:30'), '9:30 AM');

  /*
   * Whatever the path, a sentinel never comes back as a number — if one did,
   * it would reach a Date and put the meeting in 1970.
   *
   * Belt and braces: hasNoStartTime catches it first, and the numeric parse
   * below would reject 'tbd' regardless. So this pins the behaviour rather
   * than the route to it, which is the right way round for a guard.
   */
  eq('it is not a point on the clock', timeToMinutes(TBD), null);
  eq('  nor is booth hours', timeToMinutes(BOOTH_HOURS), null);
  eq('  but a real time is', timeToMinutes('09:30'), 570);

  eq('both sentinels have no start time', [hasNoStartTime(TBD), hasNoStartTime(BOOTH_HOURS)], [true, true]);
  eq('  and a real one does', hasNoStartTime('09:30'), false);
  eq('  they stay distinguishable', [isTbd(TBD), isBoothHours(TBD)], [true, false]);
  eq('  both ways', [isBoothHours(BOOTH_HOURS), isTbd(BOOTH_HOURS)], [true, false]);
  eq('the label helper names each', [unscheduledLabel(TBD), unscheduledLabel(BOOTH_HOURS), unscheduledLabel('09:30')],
    ['TBD', 'Booth Hours', null]);
}

console.log('\n— and everything that stepped around Booth Hours steps around it —');
{
  for (const [f, what] of [
    ['app/api/meetings/[id]/invite.ics/route.ts', 'a calendar invite needs a start time'],
    ['components/NewMeetingModal.tsx', 'so does the offer to send one'],
    ['components/AgendaTab.tsx', 'the agenda parks timeless meetings at the end of the day'],
    ['components/DashboardAgendaSection.tsx', 'and so does the dashboard'],
    ['app/api/conferences/[id]/crm-prompt/route.ts', 'the CRM prompt needs something to write'],
  ]) {
    const src = strip(f);
    eq(`${f.split('/').pop()} — ${what}`, /hasNoStartTime\(/.test(src), true);
    eq('  and no longer asks about booth hours alone', /isBoothHours\(/.test(src), false);
  }

  /*
   * Except the Booth Hours filters, which mean that and only that.
   *
   * They are a toggle a reader turns on to see booth-hours meetings; folding
   * TBD into them would show meetings they did not ask for.
   */
  for (const f of ['components/DashboardActionCard.tsx', 'app/conferences/[id]/page.tsx']) {
    eq(`${f.split('/').pop()} keeps its Booth Hours filter literal`,
      /isBoothHours\(/.test(strip(f)), true);
  }
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
