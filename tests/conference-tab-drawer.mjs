/**
 * The conference tabs as a drawer, on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-tab-drawer.mjs
 *
 * Reviewing a table on a phone meant scrolling back up past all of it to
 * reach another tab. The tabs and their contents now open as a drawer whose
 * top edge meets the site header, so the contents get the whole screen below
 * it and switching tabs costs nothing.
 *
 * Measured in a browser at 390x844: closed, the drawer sits at 844 — the
 * bottom of the viewport, fully off screen. Open, it sits at 85, which is
 * --mobile-header-h exactly, and runs to 844.
 *
 * Nothing about the desktop page changes: above sm the wrapper is
 * display:contents and the tab row and panels lay out as they always did.
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

const page = strip('app/conferences/[id]/page.tsx');

console.log('\n— there is a drawer, and only on a phone —');
{
  /*
   * Three states rather than a boolean: "no drawer here" has to be tellable
   * from "closed", because that is what lets the wrapper fall back to
   * display:contents without a second condition at every use of it.
   */
  eq('its state has a third, null, state',
    /useState<boolean \| null>\(null\)/.test(page), true);
  eq('  set from the phone breakpoint', /const isPhone = useIsPhone\(\);/.test(page), true);
  eq('  and null when it is not a phone', /if \(!isPhone\) return null;/.test(page), true);

  // display:contents, so above sm the DOM lays out exactly as before.
  eq('the wrapper vanishes from layout on a pointer',
    /className=\{tabDrawerOpen === null \? 'contents' : TAB_DRAWER_CLS\}/.test(page), true);
  eq('  and so does the panels’ scroller',
    /className=\{tabDrawerOpen === null \? 'contents' : 'flex-1 min-h-0 overflow-y-auto/.test(page), true);
}

console.log('\n— it meets the header, and nothing else —');
{
  eq('the top is the shared header variable',
    /top: 'var\(--mobile-header-h\)'/.test(page), true);
  // A fraction of the viewport cannot clear a safe-area inset it knows
  // nothing about; this is the anchor the other drawers already use.
  eq('  not a fraction of the viewport', /top: '\d+vh'/.test(page), false);
  eq('  and it runs to the bottom', /fixed inset-x-0 bottom-0 z-40/.test(page), true);

  /*
   * The page root is a space-y-6 stack, and `top` offsets a positioned
   * element's MARGIN edge — so the inherited 24px put the drawer 24px below
   * the header it was supposed to meet. Measured 109 before, 85 after.
   */
  eq('  with the stack’s margin overridden', /!mt-0/.test(page), true);

  // Closed is translated fully out of the way rather than unmounted, which is
  // what lets it slide rather than appear.
  eq('closed means translated down, not removed',
    /transform: tabDrawerOpen \? 'translateY\(0\)' : 'translateY\(100%\)'/.test(page), true);
  eq('  over 300ms', /transition-transform duration-300/.test(page), true);
}

console.log('\n— one tab row, in two places —');
{
  /*
   * The row has two homes on a phone: at rest on the page, and at the top of
   * the drawer. Only one is ever on screen, so it reads as the same row
   * having travelled. Two copies of the markup would be two rows to keep in
   * step, which is the thing that actually drifts.
   */
  eq('the buttons are defined once', (page.match(/const tabNav = \(/g) ?? []).length, 1);
  eq('  and rendered twice', (page.match(/\{tabNav\}/g) ?? []).length, 2);

  // Hidden rather than unmounted, so the handoff is a fade and not a jump.
  eq('the resting row fades as the drawer rises',
    /tabDrawerOpen \? 'opacity-0 pointer-events-none' : 'opacity-100'/.test(page), true);
  eq('  and is hidden from a screen reader with it',
    /aria-hidden=\{tabDrawerOpen\}/.test(page), true);
  // Both rows carry the same inset, or the tabs shift sideways on the handoff.
  eq('  both rows are inset the same', (page.match(/overflow-x-auto[^`"]*px-3/g) ?? []).length >= 1, true);
}

console.log('\n— opening and closing it —');
{
  // Including the tab already active: that is how somebody gets back to
  // contents they closed.
  eq('picking any tab opens it',
    /const handleTabChange = \(tabKey: ConferenceTabKey\) => \{[\s\S]{0,320}if \(tabDrawerOpen !== null\) setTabDrawerOpen\(true\);/.test(page), true);
  eq('  the grip closes it', /aria-label="Close the tab drawer"/.test(page), true);
  eq('  and so does Close', (page.match(/setTabDrawerOpen\(false\)/g) ?? []).length, 2);

  /*
   * A tab named in the URL opens the drawer on arrival. The page already
   * honoured ?tab= by selecting it; without this it would select a tab whose
   * contents were off screen.
   */
  eq('a link to a tab arrives open',
    /return prev \?\? searchParams\.get\('tab'\) != null;/.test(page), true);
  // Otherwise it starts closed: landing on the page should show the
  // conference, which is what the tabs used to push off the screen.
  eq('  and otherwise it starts closed', /prev \?\? searchParams/.test(page), true);
}

console.log('\n— and the bulk bars still pin where they should —');
{
  /*
   * .bulk-actions-sticky pins to --bulk-actions-top, which is the tab row's
   * measured height. In the drawer the row is not in the same scroller as the
   * bars, so that offset would push them a row's height too far down.
   */
  eq('the offset is zeroed inside the drawer',
    /\['--bulk-actions-top' as string\]: '0px'/.test(page), true);
  const css = readFileSync('app/globals.css', 'utf8');
  eq('  which is the variable they read', /\.bulk-actions-sticky[\s\S]{0,200}var\(--bulk-actions-top/.test(css), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
