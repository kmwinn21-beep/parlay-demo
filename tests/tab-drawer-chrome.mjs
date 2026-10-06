/**
 * The conference tab drawer's close, and the Back button that hides itself.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/tab-drawer-chrome.mjs
 *
 * Two changes to the drawer's chrome. The grab handle and the Close button
 * below it are gone, replaced by an X pinned at the right of the tab row with
 * the tabs scrolling underneath it — the same arrangement the report row
 * above already uses for its kebab. And the Back button, which costs a row of
 * screen to something nobody needs until they are leaving, is hidden until
 * the page is pulled down.
 *
 * The reveal rule is RUN, because the thing that was wrong with the first
 * version of it is not visible in the source: it revealed whenever the page
 * sat at its top, and now that the tabs are a drawer the page is usually
 * shorter than the screen, so "at the top" is the resting state rather than a
 * special one — the button was simply always there.
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
const { nextRevealed, dragAtTop, PULL_REVEAL_THRESHOLD } = await import('@/lib/pullToReveal');
const T = PULL_REVEAL_THRESHOLD;

console.log('\n— one way out of the drawer, pinned —');
{
  eq('the grab handle is gone', /Close the tab drawer/.test(page), false);
  eq('  and so is the Close button', />\s*Close\s*</.test(page), false);
  eq('an X closes it', /aria-label="Close"[\s\S]{0,400}M6 18L18 6M6 6l12 12/.test(page), true);

  /*
   * The same arrangement as the report row: an opaque block pinned over the
   * right of a scrolling row, with the width it covers reserved so the last
   * item can still be reached.
   *
   * The row itself is now the chip row, and it reserves that width with a
   * spacer rather than with padding — Chromium does not lay the padding out
   * past content that overflows, so the last tab ended up under the X and
   * could not be tapped. See conference-tab-chips.mjs.
   */
  eq('  pinned over the row', /absolute top-0 right-0 bottom-0 w-10[\s\S]{0,120}bg-gray-50/.test(page), true);
  eq('  with the tabs scrolling under it',
    /overflow-x-auto hide-scrollbar flex-1 min-w-0 pl-3/.test(strip('components/ConferenceTabChips.tsx')), true);
  // The report row this copies, so the two can be compared.
  eq('  which is what the report row does',
    /overflow-x-auto flex-nowrap hide-scrollbar flex-1 min-w-0 pr-10/.test(page), true);

  // Desktop keeps the sticky row it had: wrapping it would have broken sticky,
  // which can only travel within its own parent.
  eq('the desktop row is untouched',
    /tabDrawerOpen === null \? \([\s\S]{0,300}sticky top-0 z-20/.test(page), true);
}

console.log('\n— Back is hidden until it is asked for —');
{
  eq('it starts hidden on a phone', /setBackRevealed\(false\);/.test(page), true);
  eq('  and is always there on a pointer',
    /if \(!isPhone\) \{ setBackRevealed\(true\); return; \}/.test(page), true);
  // Collapsed rather than unmounted, or the page jumps by a row each time.
  eq('  collapsed rather than removed',
    /backRevealed \? 'max-h-10 opacity-100' : 'max-h-0 opacity-0 !mt-0'/.test(page), true);
  eq('  and hidden from a screen reader too', /aria-hidden=\{!backRevealed\}/.test(page), true);
}

console.log('\n— what counts as pulling it down —');
{
  /*
   * Scrolling: content moving down — scrollTop falling — reveals.
   */
  eq('scrolling up reveals', nextRevealed(false, 400, 400 - T - 1), true);
  eq('  scrolling down hides', nextRevealed(true, 400, 400 + T + 1), false);
  // A finger resting on a list sends a stream of one and two pixel deltas in
  // both directions; without a threshold the button flickers all the way.
  eq('  a wobble changes nothing', nextRevealed(true, 400, 400 + T - 1), true);
  eq('  in either direction', nextRevealed(false, 400, 400 - T + 1), false);

  /*
   * Sitting at the top does NOT reveal. The first version of this rule said
   * it did, and since the page is usually shorter than the screen now, that
   * meant the button was always on display — the opposite of hidden by
   * default.
   */
  eq('resting at the top reveals nothing', nextRevealed(false, 0, 0), false);
}

console.log('\n— and the gesture scrolling cannot see —');
{
  /*
   * At the top, or on a page shorter than the screen, a finger moves nothing
   * and fires no scroll event. Without this the button could never be reached
   * — and, once revealed, never put away, which is worse.
   */
  eq('a drag down at the top reveals', dragAtTop(0, 300, 300 + T + 1), true);
  eq('  a drag up at the top hides', dragAtTop(0, 300, 300 - T - 1), false);
  eq('  a small drag means nothing yet', dragAtTop(0, 300, 300 + T - 1), null);

  // Away from the top the finger and the content tell the same story, and two
  // sources would fight.
  eq('away from the top it defers to scrolling', dragAtTop(120, 300, 400), null);
  eq('  however far the finger went', dragAtTop(1, 300, 900), null);

  eq('the page listens for it', /addEventListener\('touchmove', onTouchMove/.test(page), true);
  eq('  and acts only when the drag means something',
    /const meant = dragAtTop\([\s\S]{0,120}if \(meant !== null\) setBackRevealed\(meant\);/.test(page), true);
  eq('  cleaning the listeners up', /removeEventListener\('touchmove', onTouchMove\)/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
