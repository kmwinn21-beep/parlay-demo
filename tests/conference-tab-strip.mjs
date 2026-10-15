/**
 * The conference tabs as a grid of tiles.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-tab-strip.mjs
 *
 * Eleven tabs rendered as words showed four of them on a 390px screen and
 * gave no sign that seven more existed. They are now tiles — a coloured glyph
 * over a label, the shape the dashboard's Quick Views uses.
 *
 * They were one scrolling row with dots under it counting the groups you had
 * not reached. Four to a row and a row to a card instead: every tab is on
 * screen, so there is nothing left for an indicator to indicate.
 *
 * The rows are RUN, over the page's own eleven and over the edges either
 * side of a full row — the part that cannot be read off the markup.
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
  .replace(/(^|[\s{(,;])\/\*[\s\S]*?\*\//g, '$1').replace(/^\s*\/\/.*$/gm, '');

const { tileRows, TILES_PER_ROW } = await import('@/lib/tileRows');

console.log('\n— four to a row —');
{
  const n = (count) => tileRows(Array.from({ length: count }, (_, i) => i)).map(r => r.length);

  eq('four to a row', TILES_PER_ROW, 4);
  // The page's own eleven: two full rows and a short one.
  eq('eleven tabs make 4, 4 and 3', n(11), [4, 4, 3]);
  // The edges either side of a full row, where an off-by-one would show.
  eq('  four make one row', n(4), [4]);
  eq('  five make two', n(5), [4, 1]);
  eq('  eight make two full ones', n(8), [4, 4]);
  eq('  one makes one', n(1), [1]);
  eq('  and none makes none', n(0), []);

  // Order is the order given: the rows are a wrap of the tab list, not a
  // regrouping of it, so the tabs read left to right and top to bottom in
  // the order the page lists them.
  eq('the order is kept', tileRows(['a', 'b', 'c', 'd', 'e']), [['a', 'b', 'c', 'd'], ['e']]);
}

console.log('\n— the tiles —');
{
  const strip_ = strip('components/ConferenceTabStrip.tsx');

  /*
   * The tab's colour is the whole tile, not a disc behind the glyph.
   *
   * At this size a 36px circle is a small target to aim at and a small thing
   * to tell apart; the tint reaching the tile's edge gives both the colour
   * and the tap area the whole tile.
   */
  eq('the tint is the tile', /w-full h-\[76px\] rounded-xl[\s\S]{0,140}\$\{\s*style\.tint\}/.test(strip_), true);
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

  /*
   * The colours live in one table, read by both of the places a tab is drawn
   * as a shape rather than a word: this strip and the drawer's chip row. A
   * tab that is rose in one and amber in the other would undo the only thing
   * the colour is there to do.
   */
  const style = strip('lib/conferenceTabStyle.ts');
  eq('the colours come from the shared table',
    /conferenceTabStyle\(tab\.key\)/.test(strip_), true);
  eq('  and the strip keeps no table of its own', /TILE_STYLE/.test(strip_), false);
  // Every tab names its own colours, so none can fall back to a guess.
  eq('  every tab has a tint', (style.match(/tint: 'bg-/g) ?? []).length, 12);
  eq('  a badge fill', (style.match(/badge: 'bg-/g) ?? []).length, 12);
  eq('  and a ring', (style.match(/ring: 'ring-/g) ?? []).length, 12);

  /*
   * Four to a row, laid out rather than scrolled.
   *
   * The row used to scroll sideways with dots under it counting the groups
   * out of view — so seven of eleven tabs were a swipe away and the dots were
   * the only sign of them. Nothing scrolls now and nothing clips: the badge
   * sits above the tile's top edge and `ring-offset-1` pushes the open tab's
   * ring 3px past every edge, both of which the scroller cut off.
   *
   * Measured at 480px, the drawer's width, over the page's eleven: three
   * cards of 4, 4 and 3, every tile 100px, every gap 8px, no scroller, no
   * dots, and no badge past the edge of the frame. At 390px the same, at
   * 77px a tile.
   */
  eq('the tiles are a grid of four', /<div className="grid grid-cols-4 gap-2">/.test(strip_), true);
  eq('  cut into rows by the shared rule', /tileRows\(tabs\)\.map\(\(row, i\) =>/.test(strip_), true);
  eq('  and nothing scrolls sideways', /overflow-x-auto/.test(strip_), false);
  eq('there are no dots under it', /dotCount|dotScale|activeDotPosition/.test(strip_), false);
  eq('  and nothing left to measure for them', /ResizeObserver|onScroll/.test(strip_), false);

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

  // Nothing to scroll means nothing to steer it with either.
  eq('the strip offers no chevrons', /Scroll (left|right)/.test(strip_), false);

  /*
   * In a card, like the dashboard's Quick Views.
   *
   * It takes `.card` rather than copying the white, the radius, the border
   * and the shadow, so it cannot drift from the panels around it — measured
   * against the conference card above it: same background, same 12px radius,
   * same 1px gray-100 border, same 358px width.
   *
   * Only the padding differs, and a card per ROW: the gap between the rows is
   * the gap between the cards, and the page's own stack spaces this component
   * rather than what is inside it.
   */
  eq('each row sits in a card', /<div key=\{i\} className="card !px-3 !py-3">/.test(strip_), true);
  eq('  and the rows are spaced as a stack', /<div className="lg:hidden space-y-3">/.test(strip_), true);

  // An account can add a tab the table has never heard of.
  eq('an unknown tab still gets a tile',
    /CONFERENCE_TAB_STYLE\[key\] \?\? CONFERENCE_TAB_FALLBACK/.test(style), true);
  // lg:hidden on the stack, so the whole section goes on a pointer — where
  // the tab row is the row of words it always was.
  eq('  and the strip is mobile only', /lg:hidden space-y-3/.test(strip_), true);
}

console.log('\n— and the drawer meets the header above it —');
{
  const page = strip('app/conferences/[id]/page.tsx');

  /*
   * Whichever header that is.
   *
   * On the page it is the app's mobile header, and --mobile-header-h carries
   * the safe-area inset with it. Framed in a quick-view drawer there is no
   * app header inside the frame — the frame's top edge IS the drawer header's
   * bottom edge — so the variable left 85px of nothing above the panel, with
   * the report row showing through it. Measured in Chromium in a 480px frame:
   * the old value put the panel's top at 85, the new one at 0.
   */
  eq('the drawer stops at the header it is under',
    /top: isEmbed \? 0 : 'var\(--mobile-header-h\)',/.test(page), true);
  eq('  knowing when it is framed',
    /const isEmbed = searchParams\.get\('embed'\) === 'true';/.test(page), true);
  // A rounded sheet edge against a header reads as two things that failed to
  // line up, so the radius goes where the seam is.
  eq('  and squares its top where it meets one',
    /isEmbed \? ' !rounded-t-none' : ''/.test(page), true);
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
