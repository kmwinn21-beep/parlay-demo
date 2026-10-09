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
  /*
   * The row of words is now the POINTER's row, and the only one. The two
   * sites were a phone-or-pointer pair while both drew the same words; the
   * drawer's is chips (see conference-tab-chips.mjs) and the strip is tiles
   * (conference-tab-strip.mjs), so a phone meets no row of words at all.
   */
  eq('  and rendered from one place', (page.match(/\{tabNav\}/g) ?? []).length, 1);
  eq('  the drawer’s row is the chips', /<ConferenceTabChips/.test(page), true);
  eq('  and they are the tabs the page is showing',
    /tabs=\{visibleConferenceTabs\.map\(tabKey => \(\{[\s\S]{0,160}\}\)\)\}[\s\S]{0,80}activeKey=\{activeTab\}[\s\S]{0,120}ConferenceTabKey\)\}/.test(page), true);

  // Hidden rather than unmounted, so the handoff is a fade and not a jump.
  eq('the resting row fades as the drawer rises',
    /tabDrawerOpen \? 'opacity-0 pointer-events-none' : 'opacity-100'/.test(page), true);
  eq('  and is hidden from a screen reader with it',
    /aria-hidden=\{tabDrawerOpen\}/.test(page), true);
  // What fades is the tile strip, which is what the phone shows at rest.
  eq('  and what fades is the strip',
    /tabDrawerOpen \? 'opacity-0 pointer-events-none'[\s\S]{0,200}<ConferenceTabStrip/.test(page), true);
}

console.log('\n— opening and closing it —');
{
  // Including the tab already active: that is how somebody gets back to
  // contents they closed.
  eq('picking any tab opens it',
    /const handleTabChange = \(tabKey: ConferenceTabKey\) => \{[\s\S]{0,320}if \(tabDrawerOpen !== null\) setTabDrawerOpen\(true\);/.test(page), true);
  /* One way out, pinned at the right of the tab row — see
     tab-drawer-chrome.mjs. The grab handle and the Close button that used to
     sit above the row are gone. */
  eq('  an X closes it', /aria-label="Close"/.test(page), true);
  eq('  and it is the only way out', (page.match(/setTabDrawerOpen\(false\)/g) ?? []).length, 1);

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

console.log('\n— and the card above it is not clipped by the gap it swallowed —');
{
  /*
   * display:contents was chosen so the desktop page would lay out exactly as
   * before. It nearly did — except that the page root is a `space-y-6`
   * column, which spaces its CHILDREN, and the child it was spacing is now an
   * element that generates no box. The 1.5rem was computed and discarded, the
   * conference card ended flush against the tab row, and the row's solid
   * shadow — sized to paint the gap above it — painted the card instead.
   *
   * Measured in Chromium against the real markup and the real compiled CSS:
   * card bottom 352.5, tab row top 352.5, gap 0, and the shadow's top edge
   * 1px under the bottom row of meta pills. With mt-6 the gap is 24 again,
   * the shadow's top edge lands exactly on the card's bottom border, and the
   * pills are 25px clear. At 995px, where the shadow is 1rem, 33px clear.
   *
   * Scrolled, the row still pins at the same place it did — 73px, against a
   * scrollport top of 49 — because a margin is a position in the flow, not a
   * constraint on where a sticky element may stop.
   */
  eq('the tab row carries the stack’s gap itself',
    /className="mt-6 border-b border-gray-200 overflow-x-auto sticky top-0 z-20 bg-gray-50/.test(page), true);
  // The gap only has to be restored where it was lost — inside the drawer the
  // row is not in the page stack at all.
  eq('  only on the branch the wrapper makes boxless',
    /tabDrawerOpen === null \? \([\s\S]{0,400}className="mt-6 border-b/.test(page), true);
  eq('  and the shadow it makes room for is still there',
    /shadow-\[0_-1rem_0_0_rgb\(249,250,251\)\] lg:shadow-\[0_-1\.5rem_0_0_rgb\(249,250,251\)\]/.test(page), true);
  eq('  above a row that still sticks', /sticky top-0 z-20/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
