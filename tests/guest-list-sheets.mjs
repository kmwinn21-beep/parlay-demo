/**
 * Where the guest list sheets stop on a phone.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/guest-list-sheets.mjs
 *
 * Both were supposed to meet the site header and neither did.
 *
 * TWO separate causes, which is why neither was fixed by the rule that already
 * caps every other sheet at the header:
 *
 * 1. A transformed ancestor. `position: fixed` is relative to the viewport
 *    only while nothing above it is transformed, and on a phone these open
 *    inside the conference tab drawer, which carries a translateY to slide.
 *    That makes the drawer the containing block, so `inset-0` meant the
 *    drawer's box rather than the screen. Measured in Chromium: with a
 *    transformed ancestor whose top is 300, the sheet's top went to 300
 *    instead of to the header's 144. They are portalled to the body now, which
 *    is the pattern LineItemCostDrawer already uses.
 *
 * 2. A cap is not a position. `max-height: calc(100dvh - header)` lands the
 *    top edge on the header only when the content is tall enough to reach the
 *    cap. A guest list with nothing in it is not — the sheet sized itself to
 *    "No attendees to show" and floated partway down the screen. The height is
 *    set now, so the top edge is the same whatever is inside.
 *
 * Measured after, at 390x844 with --mobile-header-h = 85px + a 59px inset:
 * both sheets open at 144, which is the header's bottom edge, and run to 844.
 * At 1280x800 nothing moved: the drawer is still a full-height 500px drawer on
 * the right, and the modal is still a centred 672px dialog capped at 640.
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

const table = strip('components/SocialEventsTable.tsx');
const css = readFileSync('app/globals.css', 'utf8');

console.log('\n— they escape the transformed ancestor —');
{
  /*
   * Both sheets, not one. The Build sheet is rendered from inside the guest
   * list drawer, so portalling only the outer one would leave the inner one
   * captured by it as well as by the tab drawer.
   */
  /* Each sheet's OWN return, anchored on its own markup. Counting
     createPortal calls would have passed on two: the card's kebab menu has
     one of its own, so dropping a sheet's portal still left two in the file —
     the mutation that proved it. */
  eq('the guest list drawer portals to the body',
    /return createPortal\(\s*\n\s*<div className="fixed inset-0 z-\[60\]/.test(table), true);
  eq('  and so does the build sheet',
    /return createPortal\(\s*\n\s*<div\s*\n\s*className="fixed inset-0 z-\[70\]/.test(table), true);
  eq('  both handing React the body as the host',
    (table.match(/\n    document\.body,\n  \);/g) ?? []).length, 2);
  eq('  and they wait to be mounted first',
    (table.match(/if \(!mounted\) return null;/g) ?? []).length >= 2, true);
  eq('  because document does not exist before that',
    (table.match(/useEffect\(\(\) => setMounted\(true\), \[\]\);/g) ?? []).length >= 2, true);
}

console.log('\n— and span the space below the header, not a fraction of it —');
{
  // One class for both, so they cannot drift apart.
  eq('there is one rule for both', /const SHEET_BELOW_HEADER = 'sheet-below-header';/.test(table), true);
  eq('  the guest list wears it', /drawer-mobile-responsive[\s\S]{0,200}\$\{SHEET_BELOW_HEADER\}/.test(table), true);
  eq('  and so does the build sheet', /modal-sheet-mobile[\s\S]{0,200}\$\{SHEET_BELOW_HEADER\}/.test(table), true);

  // Neither keeps the fraction it used to be sized by.
  eq('no 90vh left on the drawer', /h-\[90vh\]/.test(table), false);
  eq('  and no 80vh cap on the sheet below sm', /[^:]max-h-\[80vh\]/.test(table), false);

  /*
   * height, not max-height. The existing .modal-sheet-mobile rule caps; this
   * one spans. A cap leaves a short list floating partway down the screen,
   * which is exactly what an empty guest list did.
   */
  const rule = css.slice(css.indexOf('.sheet-below-header'), css.indexOf('.sheet-below-header') + 220);
  eq('the rule sets a height', /height: calc\(100vh - var\(--mobile-header-h\)\);/.test(rule), true);
  eq('  and overrides it with dvh', /height: calc\(100dvh - var\(--mobile-header-h\)\);/.test(rule), true);
  eq('  not a max-height', /max-height/.test(rule), false);
  // vh first, dvh second: vh includes the status bar under viewport-fit cover,
  // so it is the fallback for anything that cannot do dvh, never the answer.
  eq('  with vh underneath, not over',
    rule.indexOf('100vh') < rule.indexOf('100dvh'), true);

  /*
   * Below sm only. From 640px the drawer is a full-height right-hand drawer
   * and the sheet is a centred dialog, and a height anchored to the MOBILE
   * header would be wrong for both. Measured at 1280x800 after: drawer 500x800
   * at the right edge, dialog 672 wide and 640 tall, centred.
   */
  eq('the rule is for phones only',
    /@media \(max-width: 639px\) \{\s*\.sheet-below-header/.test(css), true);
  eq('  and the sheet takes its desktop height back', /sm:h-auto sm:max-h-\[80vh\]/.test(table), true);
  eq('  as does the drawer', /\$\{SHEET_BELOW_HEADER\} sm:h-full/.test(table), true);
}

console.log('\n— the build sheet rises from the bottom —');
{
  // A sheet on a phone, the centred dialog it always was from sm.
  eq('it is bottom-aligned below sm',
    /flex items-end justify-center sm:items-center p-0 sm:p-4/.test(table), true);
  eq('  square-topped only where it meets the screen edge',
    /rounded-t-2xl sm:rounded-2xl/.test(table), true);
  // The shared animation, so it slides up like every other sheet rather than
  // fading in where a sheet would slide.
  eq('  and animates like the other sheets', /modal-sheet-mobile relative bg-white/.test(table), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
