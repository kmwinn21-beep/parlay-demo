/**
 * The bulk action bars follow the tab row instead of scrolling away.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/sticky-bulk-actions.mjs
 *
 * Selecting rows at the bottom of a 2,645-attendee or 1,101-company list meant
 * scrolling all the way back up to reach the actions. The bars now pin to the
 * bottom edge of the conference tab row.
 *
 * Measured in Chromium at 1280px, against the real rule read out of
 * globals.css: at rest the bar sits at 390px with the tab row's bottom at 365;
 * from scrollTop 340 onward it holds at 65px, exactly the tab row's bottom
 * edge, at every depth tried up to 2000. A source file cannot measure that, so
 * what is checked here are the three things that make it work and would each
 * silently break it.
 *
 * ── The one worth explaining ────────────────────────────────────────────────
 *
 * z-index 35 is not a round number picked for headroom. Both tables freeze
 * their first column with `sticky left-0 z-30` header cells, and those stick
 * only HORIZONTALLY — they ride up through the pinned bar's position as the
 * page scrolls. Measured with elementFromPoint at the bar's centre: at z-10
 * AND at z-30 the header cell is what comes back on top; 35 is the first value
 * that wins. It stays under the report menu at z-40 and the drawers and modals
 * at z-50.
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

const rule = cssNoComments.match(/\.bulk-actions-sticky\s*\{([^}]*)\}/)?.[1] ?? '';

// ── The rule ─────────────────────────────────────────────────────────────────

console.log('\n— the bar pins under the tab row —');
{
  eq('the rule exists', rule !== '', true);
  eq('  it is sticky', /position:\s*sticky/.test(rule), true);
  eq('  anchored to the measured tab height',
    /top:\s*var\(--conf-tabbar-h,\s*0px\)/.test(rule), true);
  // The fallback is what every other page gets — no tab row, pin to the top of
  // the column — so it must stay, and stay 0.
  eq('  with a 0 fallback for pages that have no tab row',
    /var\(--conf-tabbar-h,\s*0px\)/.test(rule), true);
}

console.log('\n— it outranks the frozen table header —');
{
  const z = rule.match(/z-index:\s*(\d+)/)?.[1];
  eq('the bar has a z-index', z != null, true);
  // The header cells are z-30 and they pass THROUGH the bar. Anything at or
  // below 30 is painted over by them — measured, not assumed.
  eq('  above the tables\' sticky header cells at z-30', Number(z) > 30, true);
  eq('  and below the drawers and modals at z-50', Number(z) < 50, true);

  const frozen = /sticky left-0 z-30/.test(page) || /sticky left-0 z-30/.test(companyTable);
  eq('the frozen header cells are still z-30, which is what 35 is measured against',
    frozen, true);
}

console.log('\n— and covers the full width of the card it sits in —');
{
  // Both bars live inside `.card`, which is p-6. Without pulling back out by
  // that, rows show through beside the bar while it is pinned.
  const cardPad = cssNoComments.match(/\.card\s*\{[^}]*p-6[^}]*\}/);
  eq('the card is still p-6', cardPad != null, true);
  eq('  and the bar pulls out by exactly that', /margin-left:\s*-1\.5rem/.test(rule)
    && /margin-right:\s*-1\.5rem/.test(rule), true);
  eq('  padding it back so the text lines up', /padding:\s*0\.5rem 1\.5rem/.test(rule), true);
  eq('  over an opaque background', /background:\s*#fff/.test(rule), true);
}

// ── The offset it reads ──────────────────────────────────────────────────────

console.log('\n— the tab height is measured, not guessed —');
{
  eq('the page publishes --conf-tabbar-h', /--conf-tabbar-h/.test(page), true);
  eq('  from the tab row\'s own rectangle',
    /tabBarRef[\s\S]{0,400}getBoundingClientRect\(\)\.height/.test(page), true);
  eq('  and keeps it current with a ResizeObserver',
    /new ResizeObserver\(apply\)/.test(page), true);
  eq('  cleaning the observer up', /ro\.disconnect\(\)/.test(page), true);
}

// ── Where it is applied ──────────────────────────────────────────────────────

console.log('\n— both conference tables use it —');
{
  eq('the attendees bulk bar is pinned',
    /selectedAttendeeIds\.size >= 1 && \([\s\S]{0,200}bulk-actions-sticky/.test(page), true);
  eq('the companies table can be', /bulk-actions-sticky/.test(companyTable), true);
  eq('  and the conference page turns it on',
    /<CompanyTable[\s\S]{0,600}stickyBulkActions/.test(page), true);
}

console.log('\n— but the standalone Companies page is left alone —');
{
  // It has no tab row to pin under; the 0 fallback would pin the bar to the
  // top of the scrolling column, which is not what was asked for.
  eq('the prop defaults to off', /stickyBulkActions = false/.test(companyTable), true);
  eq('  so the bar is only pinned when asked',
    /stickyBulkActions \? ' bulk-actions-sticky' : ''/.test(companyTable), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
