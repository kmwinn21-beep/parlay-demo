/**
 * Where the rep drill-down drawer stops on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/rep-drawer-height.mjs
 *
 * Tapping a rep badge in the pre-conference review opened their accounts in a
 * drawer that covered the status bar and the clock.
 *
 * The drawer was already written to pin itself to the panel header's bottom
 * edge, through a --pcr-header-h the header publishes with a ResizeObserver.
 * The observer read entry.contentRect, which EXCLUDES padding — and on a phone
 * that header is mostly padding: px-6 py-4 plus
 * pt-[calc(1rem + env(safe-area-inset-top))] for the status bar.
 *
 * Measured in Chromium at 390x844 with a 59px inset: contentRect reported 41
 * where the header was 132. The drawer opened at 41 — 91px too high, which is
 * the padding it could not see.
 *
 * Measured after: the drawer opens at 132, which is the header's bottom edge
 * exactly, and runs to 844.
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

console.log('\n— the header is measured at all —');
{
  const pcr = strip('components/PreConferenceReview.tsx');

  /*
   * The effect has to re-run when the panel OPENS.
   *
   * This component returns null until slot.isOpen, and the effect ran once on
   * the first mount — when it had returned null. headerRef.current was null,
   * the effect returned, and with an empty dependency list it never tried
   * again. The observer was never attached: headerHeight stayed 0, the panel
   * published --pcr-header-h: 0px, and the drawer pinned to it opened at the
   * top of the screen.
   *
   * This is why reading the border box instead of the content box fixed
   * nothing on a device — there was no measurement happening to correct. The
   * probe that said otherwise rendered the panel already open, which is the
   * one sequence that hides this.
   *
   * Measured mounting closed and then opening, at 390x844 with a 59px inset:
   * with [] the variable is 0px and the drawer opens at 0, 132px above the
   * header's bottom edge; with [slot.isOpen] it is 131.5px and the drawer
   * opens at 132.
   */
  eq('the observer is attached when the panel opens',
    /observer\.disconnect\(\);[\s\S]{0,80}\}, \[slot\.isOpen\]\);/.test(pcr), true);
  eq('  and the panel is the thing that renders null until then',
    /if \(!slot\.isOpen\) return null;/.test(pcr), true);
}

console.log('\n— and it reports how tall it actually is —');
{
  const pcr = strip('components/PreConferenceReview.tsx');

  /*
   * The border box, not the content box. contentRect is the content box, so
   * every pixel of padding — and the whole safe-area inset — was missing from
   * the number the drawer pinned itself to.
   */
  eq('the observer reads the border box',
    /entry\.borderBoxSize\?\.\[0\]\?\.blockSize/.test(pcr), true);
  eq('  and no longer the content box', /entry\.contentRect/.test(pcr), false);
  /* borderBoxSize is what every current browser reports; the rect is the
     fallback for Safari versions that observe without carrying it. */
  eq('  with a fallback for browsers that lack it',
    /border \?\? el\.getBoundingClientRect\(\)\.height/.test(pcr), true);

  // It is still measured rather than assumed: the header changes height when
  // the mobile stat pills collapse.
  eq('it is still measured live', /new ResizeObserver\(/.test(pcr), true);
  eq('  and published for the drawer to read',
    /'--pcr-header-h': `\$\{headerHeight\}px`/.test(pcr), true);
}

console.log('\n— and the drawer spans from there to the bottom —');
{
  const land = strip('components/pre-conference/LandscapeTab.tsx');

  eq('the drawer pins to the published height',
    /top-\[var\(--pcr-header-h,0px\)\]/.test(land), true);
  eq('  and reaches the bottom edge', /fixed inset-x-0 bottom-0/.test(land), true);

  /*
   * globals.css caps `.drawer-mobile-responsive:not(.left-0)` at the space
   * below the site header, which is right for the drawers that are flex
   * children and cannot be top-anchored. This one positions itself, so the cap
   * only over-constrains it: with top, bottom and a max-height all in play the
   * browser drops `bottom`, and the drawer stopped 12px above the bottom of
   * the screen — 832 against an 844 viewport. Measured after: 844.
   */
  eq('its own anchoring wins over the shared cap', /!max-h-none/.test(land), true);
  const css = readFileSync('app/globals.css', 'utf8');
  eq('  which is the cap it is opting out of',
    /\.drawer-mobile-responsive:not\(\.left-0\)/.test(css), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
