/**
 * The public conference form, on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/public-form-layout.mjs
 *
 * The card is meant to sit in the middle of the screen. It was centred in
 * `min-h-screen` — 100vh, which on a phone browser is the viewport as it
 * would be with the toolbars hidden, taller than what anyone is looking at —
 * so it sat low, with a band of background above it and its bottom edge at
 * the fold.
 *
 * Three things have to hold together for this to work, and each of them
 * breaks the others if it is changed alone: the height is the viewport the
 * browser is actually giving the page, it is a HEIGHT rather than a minimum
 * because the document itself cannot scroll, and the card does not shrink to
 * fit that fixed height.
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

const page = readFileSync('app/forms/page.tsx', 'utf8');
const css = readFileSync('app/globals.css', 'utf8');
// The phone branch is the last return of the component — the desktop one
// places the card by coordinates and is not centred at all.
const phone = page.slice(page.indexOf('if (isDesktop)'));

console.log('\n— the viewport it centres in —');
{
  eq('the shell is one viewport tall',
    /className="h-screen supports-\[height:100dvh\]:h-dvh flex flex-col p-6 py-12 overflow-y-auto"/.test(phone), true);
  // vh is the viewport with the toolbars hidden; dvh is the one on screen.
  eq('  measured as dvh, with vh as the fallback', /h-screen supports-\[height:100dvh\]:h-dvh/.test(phone), true);
  /*
   * And the shell itself asks for no minimum. Only this one block is read:
   * the desktop branch keeps min-h-screen correctly, since it places the card
   * by coordinates and centres nothing, and so does the Suspense fallback,
   * which is a blank background with no card in it at all.
   */
  const shell = phone.slice(phone.indexOf('className="h-screen'), phone.indexOf('{formCard}', phone.indexOf('className="h-screen')));
  eq('  and the shell asks for no minimum', /min-h-/.test(shell), false);
}

console.log('\n— why a height and not a minimum —');
{
  /*
   * The app shell holds the document still so it can scroll inside itself.
   * The public form has no shell, but the rule is global: a page that merely
   * grows past the fold puts the rest of itself out of reach, so this div has
   * to be the scroller, which means its height has to be fixed.
   */
  eq('the document itself cannot scroll', /html,\nbody \{\n  overflow: hidden;/.test(css), true);
  eq('  so the shell scrolls instead', /overflow-y-auto/.test(phone), true);
}

console.log('\n— and the card inside it —');
{
  // Auto margins share free space when there is some and resolve to zero when
  // there is none — unlike justify-center, which would cut off the top.
  // `relative` joined it when the details panel arrived — the panel is
  // pinned to this card's edges rather than to the page's.
  eq('the card centres with auto margins',
    /className="relative my-auto mx-auto w-full max-w-\[480px\] flex-shrink-0/.test(phone), true);
  /*
   * Measured: a fourteen-question card was squashed from 1403px to 568px and
   * lost its Submit button, because a flex item whose overflow is hidden may
   * shrink below its content to fit a fixed container.
   */
  eq('  and does not shrink to fit the screen', /flex-shrink-0 rounded-2xl/.test(phone), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
