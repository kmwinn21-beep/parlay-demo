/**
 * The bulk action bars follow the list instead of scrolling away.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/sticky-bulk-actions.mjs
 *
 * Selecting rows at the bottom of a 2,645-attendee or 1,101-company list meant
 * scrolling all the way back up to reach the actions. All three bars — the two
 * on the conference page and the ones on Companies and Attendees — now pin.
 *
 * Where they stop depends on what is above them, and both cases were measured
 * in Chromium at 1280px against the real rule read out of globals.css:
 *
 *   conference page, a tab row pinned above
 *     at rest the bar sits at 390 with the tab row's bottom at 365; from
 *     scrollTop 340 on it holds at 65 — the tab row's bottom edge — at every
 *     depth tried up to 2000.
 *
 *   Companies / Attendees, nothing pinned above
 *     the variable is never set, so the 0 fallback applies and the bar holds at
 *     24: the top of the scrolling column, inset by its own padding.
 *
 * In both, the bar is what elementFromPoint reports on top throughout. A source
 * file cannot measure any of that, so what is checked here are the things that
 * make it work and would each silently break it.
 *
 * ── The one worth explaining ────────────────────────────────────────────────
 *
 * z-index 35 is not a round number picked for headroom. The conference page and
 * the Companies table freeze their first and last columns with `sticky left-0
 * z-30` / `sticky right-0 z-30` header cells, and those stick only
 * HORIZONTALLY — they ride up through the pinned bar's position as the page
 * scrolls. Measured with elementFromPoint at the bar's centre: at z-10 AND at
 * z-30 the header cell is what comes back on top; 35 is the first value that
 * wins. It stays under the conference report menu at z-40 and the drawers and
 * modals at z-50.
 *
 * The Attendees table is built differently and this test says so rather than
 * assuming three of a kind — an earlier version of it asserted all three froze
 * a column at z-30 and failed on the third. That table scrolls INSIDE its own
 * box (`overflow-auto`, max-height 100vh-18rem) with a `sticky top-0 z-10`
 * thead, so its header sticks to that box and never travels through the bar at
 * all. It is covered here because its ceiling is what the bar must clear, and
 * 10 is comfortably under 35 either way.
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

const css = readFileSync('app/globals.css', 'utf8');
// Prose in this stylesheet names the very properties under test; assertions
// read a copy with the comments stripped.
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
const page = readFileSync('app/conferences/[id]/page.tsx', 'utf8');
const companyTable = readFileSync('components/CompanyTable.tsx', 'utf8');
const attendeeTable = readFileSync('components/AttendeeTable.tsx', 'utf8');

const rule = cssNoComments.match(/\.bulk-actions-sticky\s*\{([^}]*)\}/)?.[1] ?? '';

// ── The rule ─────────────────────────────────────────────────────────────────

console.log('\n— the bar pins to whatever is above it —');
{
  eq('the rule exists', rule !== '', true);
  eq('  it is sticky', /position:\s*sticky/.test(rule), true);
  eq('  anchored to whatever is pinned above it',
    /top:\s*var\(--bulk-actions-top,\s*0px\)/.test(rule), true);
  // The fallback is what Companies and Attendees get — nothing pinned above, so
  // pin to the top of the column — so it must stay, and stay 0.
  eq('  with a 0 fallback for pages that pin nothing',
    /var\(--bulk-actions-top,\s*0px\)/.test(rule), true);
}

console.log('\n— it outranks the frozen table header —');
{
  const z = rule.match(/z-index:\s*(\d+)/)?.[1];
  eq('the bar has a z-index', z != null, true);
  // The header cells are z-30 and they pass THROUGH the bar. Anything at or
  // below 30 is painted over by them — measured, not assumed.
  eq('  above the tables\' sticky header cells at z-30', Number(z) > 30, true);
  eq('  and below the drawers and modals at z-50', Number(z) < 50, true);

  // 35 was chosen against what these tables' sticky elements actually use. If
  // one of them is raised past it later, the bar starts losing to it — so the
  // check is against the highest z-index on any sticky element in each file,
  // not against a remembered number.
  const highestSticky = (src) => Math.max(0, ...
    Array.from(src.matchAll(/sticky[a-z0-9 -]*z-(\d+)/g)).map(m => Number(m[1])));

  eq('the conference page tops out at z-30 on its sticky cells',
    highestSticky(page), 30);
  eq('  the companies table too', highestSticky(companyTable), 30);
  // Different shape entirely: this table scrolls inside its own box, so its
  // thead sticks to that box rather than riding up through the bar.
  eq('  and the attendees table at z-10, being its own scrollport',
    highestSticky(attendeeTable), 10);
  eq('the bar clears all of them',
    [page, companyTable, attendeeTable].every(src => Number(z) > highestSticky(src)), true);
}

console.log('\n— and covers the full width of the card it sits in —');
{
  // Every one of these bars lives inside `.card`, which is p-6. Without pulling
  // back out by that, rows show through beside the bar while it is pinned.
  const cardPad = cssNoComments.match(/\.card\s*\{[^}]*p-6[^}]*\}/);
  eq('the card is still p-6', cardPad != null, true);
  eq('  and the bar pulls out by exactly that', /margin-left:\s*-1\.5rem/.test(rule)
    && /margin-right:\s*-1\.5rem/.test(rule), true);
  eq('  padding it back so the text lines up', /padding:\s*0\.5rem 1\.5rem/.test(rule), true);
  eq('  over an opaque background', /background:\s*#fff/.test(rule), true);
}

// ── The offset it reads ──────────────────────────────────────────────────────

console.log('\n— the conference tab height is measured, not guessed —');
{
  eq('the conference page publishes --bulk-actions-top',
    /--bulk-actions-top/.test(page), true);
  eq('  from the tab row\'s own rectangle',
    /tabBarRef[\s\S]{0,400}getBoundingClientRect\(\)\.height/.test(page), true);
  eq('  and keeps it current with a ResizeObserver',
    /new ResizeObserver\(apply\)/.test(page), true);
  eq('  cleaning the observer up', /ro\.disconnect\(\)/.test(page), true);
}

// ── Where it is applied ──────────────────────────────────────────────────────

console.log('\n— every bulk bar uses it —');
{
  // Three bars across three files: the conference page's own attendee bar, and
  // the two shared tables. All three are reached from the pages the user works
  // the lists on, so all three pin.
  eq('the conference attendees bar is pinned',
    /selectedAttendeeIds\.size >= 1 && \([\s\S]{0,300}bulk-actions-sticky/.test(page), true);
  eq('the companies table\'s bar is pinned',
    /selectedIds\.size >= 1 && \([\s\S]{0,200}bulk-actions-sticky/.test(companyTable), true);
  eq('the attendees table\'s bar is pinned',
    /selectedIds\.size >= 1 && \([\s\S]{0,200}bulk-actions-sticky/.test(attendeeTable), true);
}

console.log('\n— with no flag to forget to pass —');
{
  // It started as an opt-in prop, back when only the conference page wanted it.
  // All three call sites want it, so the prop was ceremony: a switch every
  // caller sets is not a switch. Pinning is now what these tables do.
  const noFlag = !/stickyBulkActions/.test(companyTable)
    && !/stickyBulkActions/.test(attendeeTable)
    && !/stickyBulkActions/.test(page);
  eq('the opt-in prop is gone', noFlag, true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
