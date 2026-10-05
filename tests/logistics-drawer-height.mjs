/**
 * Where the logistics drawer stops on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/logistics-drawer-height.mjs
 *
 * It was sized h-[92vh] from the bottom edge. viewport-fit:cover makes vh
 * include the status bar, so 92vh reached up past the site header and put the
 * drawer's own close button underneath it — the drawer opened and could not
 * be shut. Measured in a browser at 390x844: the panel started at 68px with
 * its close control at 81px, both above the 85px header line.
 *
 * The fix is the one every other drawer and sheet already uses: anchor to
 * --mobile-header-h rather than to a fraction of the viewport, so the top
 * lands on the header's bottom edge whatever the safe-area inset turns out to
 * be. A fraction cannot do that — vh knows nothing about the inset, which is
 * zero in a desktop browser and about 50px on the phone this was reported
 * from.
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

console.log('\n— the drawer stops at the header —');
{
  const drawer = strip('components/logistics/ConferencePlanLogisticsDrawer.tsx');

  eq('it is anchored to the header variable',
    /h-\[calc\(100dvh-var\(--mobile-header-h\)\)\]/.test(drawer), true);
  // The thing that caused it. A fraction of the viewport cannot clear an
  // inset it does not know about.
  eq('  and no longer sized as a fraction of the viewport',
    /h-\[9[0-9]vh\]/.test(drawer), false);
  // Desktop is a full-height side panel and never had the problem.
  eq('  while the desktop panel is still full height', /sm:h-full/.test(drawer), true);

  /*
   * It takes the height from the house rule and not the animation.
   *
   * The drawers that carry drawer-mobile-responsive get this cap from
   * globals.css, but that class also brings a slide-in, and this drawer
   * already animates itself through .logistics-panel. Two animations on one
   * element is a worse bug than the one being fixed.
   */
  eq('  it keeps its own slide', /logistics-panel/.test(drawer), true);
  eq('  without taking a second animation with the cap',
    /drawer-mobile-responsive/.test(drawer), false);
}

console.log('\n— and the variable it anchors to is the shared one —');
{
  const css = readFileSync('app/globals.css', 'utf8');
  eq('--mobile-header-h is declared once',
    (css.match(/--mobile-header-h:/g) ?? []).length, 1);
  // Declared from the header's own height plus the inset, which is the whole
  // reason anchoring to it clears the status bar when a fraction cannot.
  eq('  from the header height and the safe-area inset',
    /--mobile-header-h: calc\(\d+px \+ env\(safe-area-inset-top\)\)/.test(css), true);
  // The other drawers and sheets stop at the same line, so they agree.
  eq('  and the other drawers stop at it too',
    /\.drawer-mobile-responsive[\s\S]{0,400}var\(--mobile-header-h\)/.test(css), true);
  eq('  as do the bottom-sheet modals',
    /\.modal-sheet-mobile \{\s*max-height: calc\(100vh - var\(--mobile-header-h\)\)/.test(css), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
