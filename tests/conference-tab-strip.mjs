/**
 * The conference tabs as a strip of tiles, and the dots under it.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-tab-strip.mjs
 *
 * Eleven tabs rendered as words showed four of them on a 390px screen and
 * gave no sign that seven more existed. They are now tiles — a coloured glyph
 * over a label, the shape the dashboard's Quick Views uses — with dots
 * underneath saying how much more there is in items rather than in pixels.
 *
 * The dot rule is RUN. One dot to three tiles, and the dot for the group in
 * view grows while the one you left shrinks, continuously rather than in
 * steps — which is the part that cannot be read off the markup.
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
const near = (label, got, want, tol = 0.001) => {
  if (Math.abs(got - want) <= tol) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${got}\n       want ${want}`); }
};

const strip = (f) => readFileSync(f, 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const { dotCount, activeDotPosition, dotScale, TILES_PER_DOT } = await import('@/lib/scrollDots');

console.log('\n— one dot to three tiles —');
{
  eq('three to a dot', TILES_PER_DOT, 3);
  // The page's own eleven.
  eq('eleven tabs get four dots', dotCount(11), 4);
  eq('  nine get three', dotCount(9), 3);
  eq('  ten get four', dotCount(10), 4);
  eq('  one gets one', dotCount(1), 1);
  eq('  and none gets none', dotCount(0), 0);
}

console.log('\n— where the strip says it is —');
{
  // Measured from scroll progress, not from a tile width: the tiles are not
  // all the same width because their labels differ, so counting three tiles
  // along in pixels would drift and never quite reach the last dot.
  near('at the start, the first dot', activeDotPosition(0, 1200, 390, 4), 0);
  near('  at the end, the last', activeDotPosition(810, 1200, 390, 4), 3);
  near('  halfway, between the middle two', activeDotPosition(405, 1200, 390, 4), 1.5);

  // Nothing to scroll, and a single dot, both resolve rather than dividing
  // by zero.
  near('nothing to scroll is the first dot', activeDotPosition(0, 390, 390, 4), 0);
  near('  and a lone dot is always itself', activeDotPosition(500, 1200, 390, 1), 0);
  // A rubber-band overscroll must not push it past either end.
  near('overscrolling past the end clamps', activeDotPosition(2000, 1200, 390, 4), 3);
  near('  and past the start', activeDotPosition(-80, 1200, 390, 4), 0);
}

console.log('\n— and how big each dot is —');
{
  eq('the dot you are on is full size', dotScale(2, 2), 1);
  eq('  its neighbours are at their smallest', dotScale(1, 2), 0);
  eq('  and anything further too', dotScale(0, 2), 0);

  /*
   * The part that makes it read as a position rather than a counter: half way
   * between two groups, both dots are half way between the two sizes. A
   * stepped version would have one dot at full size the whole way and snap.
   */
  near('half way between two, both are half', dotScale(1, 1.5), 0.5);
  near('  and so is the other', dotScale(2, 1.5), 0.5);
  near('  a quarter of the way, three quarters', dotScale(1, 1.25), 0.75);
}

console.log('\n— the tiles —');
{
  const strip_ = strip('components/ConferenceTabStrip.tsx');

  // A glyph over a label, as the Quick Views tiles are drawn.
  eq('each tile is a circle over a label',
    /w-9 h-9 rounded-full flex items-center justify-center/.test(strip_), true);
  eq('  with the label under it', /<p className=\{`text-\[11px\]/.test(strip_), true);

  /*
   * One background class on the circle, never two.
   *
   * The first version kept the pale ring and added the filled colour beside
   * it for the active tile. Both are backgrounds, so which applied came down
   * to the order Tailwind happened to write them in — the pale one won, and
   * the active tile had a white icon on a pale circle. Measured in a browser
   * afterwards: rgb(14,165,233), which is the filled sky.
   */
  eq('the active tile picks one background',
    /isActive \? style\.active : `\$\{style\.ring\} \$\{style\.fill\}`/.test(strip_), true);
  eq('  and never derives it by rewriting the hover class',
    /fill\.replace\(/.test(strip_), false);
  // Every tab names its own filled colour, so none can fall back to a guess.
  eq('  every tab has one', (strip_.match(/active: 'bg-/g) ?? []).length, 12);

  // No scrollbar and no chevrons: the dots are the indicator, and two of them
  // in different units would be worse than one.
  eq('the row hides its scrollbar', /overflow-x-auto scrollbar-hide/.test(strip_), true);
  eq('  and offers no chevrons', /Scroll (left|right)/.test(strip_), false);

  // An account can add a tab this file has never heard of.
  eq('an unknown tab still gets a tile', /const FALLBACK = \{/.test(strip_), true);
  eq('  and the strip is mobile only', /<div className="lg:hidden">/.test(strip_), true);
}

console.log('\n— and it is what the page shows at rest —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the resting tabs are the strip', /<ConferenceTabStrip/.test(page), true);
  eq('  picking one opens the drawer',
    /onPick=\{key => handleTabChange\(key as ConferenceTabKey\)\}/.test(page), true);
  eq('  and it knows which tab is open', /activeKey=\{activeTab\}/.test(page), true);

  /*
   * One label for both. The drawer's pinned row and the strip would otherwise
   * compute their counts separately, and a count could show in one and not
   * the other.
   */
  eq('the label is computed once', (page.match(/const tabLabel = \(tabKey/g) ?? []).length, 1);
  eq('  used by the strip', /label: tabLabel\(tabKey\)/.test(page), true);
  eq('  and by the drawer’s row', /const labelWithCount = tabLabel\(tabKey\);/.test(page), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
