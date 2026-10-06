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

  /*
   * The tab's colour is the whole tile, not a disc behind the glyph.
   *
   * At this size a 36px circle is a small target to aim at and a small thing
   * to tell apart; the tint reaching the tile's edge gives both the colour
   * and the tap area the full 88x76.
   */
  eq('the tint is the tile', /w-\[88px\] h-\[76px\] rounded-xl[\s\S]{0,120}\$\{\s*style\.tint\}/.test(strip_), true);
  eq('  with the glyph over the label', /<p className=\{`text-\[11px\]/.test(strip_), true);

  /*
   * One background class on the tile, never two.
   *
   * An earlier version kept a pale disc and added the filled colour beside
   * it for the active tab. Both are backgrounds, so which applied came down
   * to the order Tailwind happened to write them in — the pale one won, and
   * the active tile had a white icon on a pale circle. The open tab is now
   * marked by a ring, which cannot collide with the tint.
   */
  eq('the open tab is marked by a ring, not a second background',
    /isActive \? `ring-2 ring-offset-1 \$\{style\.ring\}` : ''/.test(strip_), true);
  eq('  and never derives a colour by rewriting a class', /\.replace\(/.test(strip_), false);
  // Every tab names its own colours, so none can fall back to a guess.
  eq('  every tab has a tint', (strip_.match(/tint: 'bg-/g) ?? []).length, 12);
  eq('  a badge fill', (strip_.match(/badge: 'bg-/g) ?? []).length, 12);
  eq('  and a ring', (strip_.match(/ring: 'ring-/g) ?? []).length, 12);

  /*
   * Room below the tiles as well as above, and it is not decoration.
   *
   * `overflow-x-auto` clips the vertical axis too, and two things paint
   * outside a tile's box: the badge above the top edge, and `ring-offset-1`,
   * which pushes the open tab's ring 3px past every edge. With the tiles
   * flush against the scroller the ring's bottom was shaved off. Measured at
   * 390px: clip box 49.5-141.5, ring paint 54.5-136.5.
   */
  eq('the scroller leaves room for the ring it would otherwise clip',
    /overflow-x-auto scrollbar-hide px-3 pt-2 pb-2/.test(strip_), true);

  /*
   * The count is a badge in the tab's own colour, not a parenthesis.
   *
   * Conferences run to five figures of attendance, so it is the widest thing
   * on the tile and it overhangs the tile beside it; the white ring is what
   * keeps it legible where it does.
   */
  eq('the count rides in a badge', /\{count\}/.test(strip_), true);
  eq('  filled in the tab’s own colour', /\$\{style\.badge\}/.test(strip_), true);
  eq('  ringed in white so an overhang still reads', /ring-2 ring-white/.test(strip_), true);
  eq('  and the digits do not jitter', /tabular-nums/.test(strip_), true);
  eq('  no badge at all when there is nothing to count', /count !== null && \(/.test(strip_), true);

  // No scrollbar and no chevrons: the dots are the indicator, and two of them
  // in different units would be worse than one.
  eq('the row hides its scrollbar', /overflow-x-auto scrollbar-hide/.test(strip_), true);
  eq('  and offers no chevrons', /Scroll (left|right)/.test(strip_), false);

  /*
   * In a card, like the dashboard's Quick Views.
   *
   * It takes `.card` rather than copying the white, the radius, the border
   * and the shadow, so it cannot drift from the panels around it — measured
   * against the conference card above it: same background, same 12px radius,
   * same 1px gray-100 border, same 358px width.
   *
   * Only the padding differs. A scroller inside a 24px gutter stops short of
   * the card's own edge and reads as cut off, so the sides come off and the
   * row carries its own inset instead.
   */
  eq('the strip sits in a card', /lg:hidden card !px-0 !py-2/.test(strip_), true);
  eq('  with the row holding the inset', /overflow-x-auto scrollbar-hide px-3/.test(strip_), true);

  // An account can add a tab this file has never heard of.
  eq('an unknown tab still gets a tile', /const FALLBACK = \{/.test(strip_), true);
  // lg:hidden on the card itself, so the whole section goes on a pointer —
  // where the tab row is the row of words it always was.
  eq('  and the strip is mobile only', /lg:hidden card/.test(strip_), true);
}

console.log('\n— and it is what the page shows at rest —');
{
  const page = strip('app/conferences/[id]/page.tsx');
  eq('the resting tabs are the strip', /<ConferenceTabStrip/.test(page), true);
  eq('  picking one opens the drawer',
    /onPick=\{key => handleTabChange\(key as ConferenceTabKey\)\}/.test(page), true);
  eq('  and it knows which tab is open', /activeKey=\{activeTab\}/.test(page), true);

  /*
   * One count for both. The tile shows it as a badge and the drawer's row in
   * parentheses, but they ask the same function — computing them separately
   * is what lets a count show in one place and not the other.
   */
  eq('the count is computed once', (page.match(/const tabCount = \(tabKey/g) ?? []).length, 1);
  eq('  the drawer’s row parenthesises it',
    /const count = tabCount\(tabKey\);[\s\S]{0,160}\$\{baseLabel\} \(\$\{count\}\)/.test(page), true);
  eq('  and the strip passes it through as a number', /count: tabCount\(tabKey\),/.test(page), true);
  // The tile's label is the bare name: the badge carries the number, so a
  // parenthesised count would print it twice.
  eq('  the tile’s label carries no count',
    /label: conferenceTabConfig\.getLabel\(tabKey\),/.test(page), true);
  eq('  while the drawer’s row still uses the full label',
    /const labelWithCount = tabLabel\(tabKey\);/.test(page), true);
}

console.log('\n— what the badge says —');
{
  const { badgeCount } = await import('@/lib/tabBadge');

  // Five figures of attendance is the normal case at a conference, so the
  // number is shown in full rather than rounded to "14.2k" on a page whose
  // job is the exact figure.
  eq('five figures, in full', badgeCount(14250), '14,250');
  eq('  four figures too', badgeCount(3480), '3,480');
  eq('  and a small one unchanged', badgeCount(7), '7');

  // An empty tab says so by being empty; a "0" is a mark drawing the eye to
  // the one tab with nothing in it.
  eq('zero gets no badge', badgeCount(0), null);
  eq('  nor does a tab that does not count', badgeCount(null), null);
  eq('  nor an absent one', badgeCount(undefined), null);
  // A count arriving mid-load should not render "NaN" in a coloured bubble.
  eq('  nor a number that is not one', badgeCount(NaN), null);
  eq('  nor a negative', badgeCount(-3), null);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
