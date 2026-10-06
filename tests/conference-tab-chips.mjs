/**
 * The conference drawer's pinned tab row, as chips.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/conference-tab-chips.mjs
 *
 * Eleven tabs written as words run to about four screens on a phone, so the
 * row the drawer pins at its top was something to scroll rather than
 * something to use. Each tab is now the glyph and colour its tile already
 * wears, in a 32px square, and only the open one carries its name.
 *
 * That one named chip is the only thing in the row saying where you are —
 * which is why the scrolling rule below is the part that is RUN rather than
 * read off the markup. Measured in Chromium at 390px, eleven tabs: the row is
 * 497px against 358px of clip, so a tab opened from the far end starts off
 * screen and the row has to bring it back.
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

const { centerScrollLeft } = await import('@/lib/centerInRow');

console.log('\n— bringing the open chip into view —');
{
  /*
   * The row is 358 wide with 40 of it under the close block, so 318 is what
   * can actually be seen. A 130px chip at 300 centres at 300 - (318-130)/2.
   */
  eq('a chip in the middle is centred in what you can see',
    centerScrollLeft(300, 130, 358, 900, 40), 206);

  // Centring in the FULL width would leave the chip 20px further right on
  // screen, which is 20px further under the close block. Holding the block
  // back scrolls the row further along to make up for it.
  eq('  and the close block is not counted as visible',
    centerScrollLeft(300, 130, 358, 900, 40) - centerScrollLeft(300, 130, 358, 900, 0), 20);

  /*
   * Both ends settle flush rather than asking for a scroll position that
   * does not exist — a negative one at the start, or one past the end.
   */
  eq('the first chip does not ask to scroll backwards',
    centerScrollLeft(0, 32, 358, 900, 40), 0);
  eq('  nor the second, which still fits', centerScrollLeft(38, 32, 358, 900, 40), 0);
  eq('the last chip stops at the end', centerScrollLeft(860, 32, 358, 900, 40), 542);
  eq('  which is scrollWidth minus clientWidth', 900 - 358, 542);

  // A row with nothing to scroll resolves to 0 rather than a negative.
  eq('a row that fits does not scroll at all', centerScrollLeft(100, 32, 358, 358, 40), 0);
}

console.log('\n— the chips —');
{
  const chips = strip('components/ConferenceTabChips.tsx');

  // A 32px square for a closed tab; the open one grows to fit its name.
  eq('a closed tab is the glyph alone', /: 'w-8'/.test(chips), true);
  eq('  the open one carries its name',
    /isActive \? `gap-1\.5 px-2\.5 ring-2 ring-offset-1 \$\{style\.ring\}`/.test(chips), true);
  eq('  and nothing else does', /isActive && \(/.test(chips), true);

  /*
   * No count anywhere. The tile strip carries the counts, and the tab you are
   * in states its own in the panel below — a third place to keep in step is a
   * third place to drift.
   */
  eq('no counts in here', /badgeCount|count/.test(chips), false);

  // The same table the tiles read, so a tab cannot be rose in one place and
  // amber in the other.
  eq('the colours are the tiles’ own', /conferenceTabStyle\(tab\.key\)/.test(chips), true);

  /*
   * A chip with no visible text still has to say what it is. Without this
   * every closed tab is a button a screen reader announces as nothing.
   */
  eq('a closed chip is still named', /aria-label=\{tab\.label\}/.test(chips), true);
  eq('  and marks the open one', /aria-current=\{isActive \? 'page' : undefined\}/.test(chips), true);

  /*
   * Scrolled by setting the row's own scrollLeft.
   *
   * scrollIntoView walks up the tree and would scroll the drawer and the page
   * behind it: the panel under this row is a scroller of its own, and having
   * it jump because a tab was picked is worse than the problem being solved.
   */
  eq('the row scrolls itself', /row\.scrollTo\(\{ left/.test(chips), true);
  eq('  and never by walking up the tree', /scrollIntoView/.test(chips), false);
  eq('  every time the open tab changes', /\}, \[activeKey, tabs\.length\]\);/.test(chips), true);
  eq('  and it holds still for anyone who asked for that',
    /prefers-reduced-motion: reduce/.test(chips), true);

  /*
   * The scroller clips its vertical axis, and ring-offset-1 paints 3px
   * outside the open chip on every edge — the same thing that shaved the
   * tiles' ring before it was padded.
   */
  eq('the scroller leaves room for the ring', /pl-3 py-2/.test(chips), true);

  /*
   * The close block's width is held back by a real element, not by padding.
   *
   * Measured in Chromium: with padding-right alone, scrolled fully to the
   * end, the last chip's right edge lands at 390 on a 390px screen — flush
   * with the row's edge and 40px beneath the X, where it cannot be tapped.
   * Playwright refused the click outright, which is how this was found. The
   * padding counts toward scrollWidth but is not laid out past content that
   * overflows. A spacer is content, so the scroll stops short of the block.
   */
  eq('the close block’s width is held back by a spacer',
    /<span className="flex-shrink-0 w-10" aria-hidden \/>/.test(chips), true);
  eq('  and not by padding, which does not hold', /pr-10/.test(chips), false);
  // The same 40 the scrolling rule holds back. Two different numbers would
  // park the open chip under the X.
  eq('  the scroll rule reserves the same width', /const CLOSE_BLOCK_W = 40;/.test(chips), true);
}

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
