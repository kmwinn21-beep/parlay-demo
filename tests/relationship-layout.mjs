/**
 * Where the spoke cards sit around a hub that can be anywhere on the canvas.
 *
 *   node --experimental-strip-types --import ./tests/register-ts.mjs \
 *        tests/relationship-layout.mjs
 *
 * The first version put the cards on an ellipse centred on the hub and clamped
 * each one into the canvas afterwards. Fine while the hub is in the middle,
 * and wrong the moment it is not: half the ring lands outside, everything out
 * there clamps to the same edge, and four names stack on one another.
 *
 * This is geometry, so it is measured rather than eyeballed — every case below
 * drags the hub somewhere awkward and then counts the overlaps.
 *
 * Exits non-zero on the first failing expectation, so it can gate a build.
 */
let pass = 0;
let fail = 0;
const eq = (label, got, want) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g === w) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}\n       got  ${g}\n       want ${w}`); }
};

const { layoutSpokes, cardsOverlap } = await import('@/lib/relationshipLayout');

const CARD = { w: 268, h: 96 };
const HUB = { w: 224, h: 96 };
const BOX = { w: 900, h: 560 };

const hubAt = (x, y) => ({ x, y, ...HUB });
const ids = (n) => Array.from({ length: n }, (_, i) => i + 1);

/** How many pairs of cards intersect, and how many sit on the hub. */
function collisions(placed, list, hub) {
  let pairs = 0;
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      if (cardsOverlap(placed[list[i]], placed[list[j]], CARD)) pairs++;
    }
  }
  const onHub = list.filter(id => {
    const p = placed[id];
    return p.x < hub.x + hub.w && p.x + CARD.w > hub.x && p.y < hub.y + hub.h && p.y + CARD.h > hub.y;
  }).length;
  return { pairs, onHub };
}

function outOfBounds(placed, list) {
  return list.filter(id => {
    const p = placed[id];
    return p.x < 0 || p.y < 0 || p.x + CARD.w > BOX.w + 0.5 || p.y + CARD.h > BOX.h + 0.5;
  }).length;
}

console.log('\n— a hub in the middle —');
{
  const hub = hubAt(BOX.w / 2 - HUB.w / 2, BOX.h / 2 - HUB.h / 2);
  for (const n of [1, 2, 3, 4, 5, 6]) {
    const list = ids(n);
    const placed = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
    const c = collisions(placed, list, hub);
    eq(`${n} cards do not overlap`, c.pairs, 0);
    eq(`  nor sit on the hub`, c.onHub, 0);
    eq(`  and stay on the canvas`, outOfBounds(placed, list), 0);
  }
}

console.log('\n— a hub dragged into a corner —');
{
  // The case from the screenshot: the hub near an edge, half the ring off the
  // canvas, every card out there clamping to the same place.
  const corners = [
    ['top left', hubAt(0, 0)],
    ['top right', hubAt(BOX.w - HUB.w, 0)],
    ['bottom left', hubAt(0, BOX.h - HUB.h)],
    ['bottom right', hubAt(BOX.w - HUB.w, BOX.h - HUB.h)],
  ];
  for (const [where, hub] of corners) {
    const list = ids(5);
    const placed = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
    const c = collisions(placed, list, hub);
    eq(`5 cards clear of each other with the hub ${where}`, c.pairs, 0);
    eq(`  and clear of the hub`, c.onHub, 0);
    eq(`  and on the canvas`, outOfBounds(placed, list), 0);
  }
}

console.log('\n— a hub against each edge —');
{
  const edges = [
    ['left', hubAt(0, BOX.h / 2 - HUB.h / 2)],
    ['right', hubAt(BOX.w - HUB.w, BOX.h / 2 - HUB.h / 2)],
    ['top', hubAt(BOX.w / 2 - HUB.w / 2, 0)],
    ['bottom', hubAt(BOX.w / 2 - HUB.w / 2, BOX.h - HUB.h)],
  ];
  for (const [where, hub] of edges) {
    const list = ids(6);
    const placed = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
    const c = collisions(placed, list, hub);
    eq(`6 cards clear with the hub on the ${where}`, c.pairs, 0);
    eq(`  and clear of the hub`, c.onHub, 0);
  }
}

console.log('\n— more cards than there is room for —');
{
  // Twenty cards on this canvas cannot all be separated. The point is that it
  // degrades rather than thrashes: still on the canvas, still not worse than
  // the ring it started from.
  const hub = hubAt(BOX.w / 2 - HUB.w / 2, BOX.h / 2 - HUB.h / 2);
  const list = ids(20);
  const placed = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
  eq('every card is still on the canvas', outOfBounds(placed, list), 0);
  eq('  and every card has a position', Object.keys(placed).length, 20);
  eq('  with no NaN in any of them',
    list.every(id => Number.isFinite(placed[id].x) && Number.isFinite(placed[id].y)), true);
}

console.log('\n— cards the reader has placed —');
{
  const hub = hubAt(BOX.w / 2 - HUB.w / 2, BOX.h / 2 - HUB.h / 2);
  const list = ids(4);
  const fixed = { 1: { x: 10, y: 10 } };
  const placed = layoutSpokes({ ids: list, hub, card: CARD, box: BOX, fixed });

  // A card put down deliberately staying put matters more than a tidy ring.
  eq('a dragged card is left exactly where it was put', placed[1], { x: 10, y: 10 });
  // But it is an obstacle, so nothing is laid out underneath it.
  eq('  and nothing is placed under it',
    [2, 3, 4].filter(id => cardsOverlap(placed[1], placed[id], CARD)).length, 0);

  // A dragged card outside the canvas is brought back in rather than lost.
  const off = layoutSpokes({ ids: list, hub, card: CARD, box: BOX, fixed: { 1: { x: 5000, y: 5000 } } });
  eq('a dragged card beyond the canvas is pulled back',
    off[1].x <= BOX.w - CARD.w && off[1].y <= BOX.h - CARD.h, true);
}

console.log('\n— the same input gives the same layout —');
{
  const hub = hubAt(120, 80);
  const list = ids(5);
  const a = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
  const b = layoutSpokes({ ids: list, hub, card: CARD, box: BOX });
  // Nothing random in here: a layout that shifts between renders would make
  // the cards twitch on every state change.
  eq('twice over, identical', a, b);
}

console.log('\n— nothing to lay out —');
{
  const hub = hubAt(0, 0);
  eq('no cards is no positions', layoutSpokes({ ids: [], hub, card: CARD, box: BOX }), {});
  // The canvas is zero-sized on the first paint, before it has been measured.
  eq('an unmeasured canvas does not divide by it',
    layoutSpokes({ ids: ids(3), hub, card: CARD, box: { w: 0, h: 0 } }), {});
}

// Two mutations survive this suite on purpose, and are worth naming rather
// than chasing with weak assertions:
//
//   - sizing the ring to the canvas instead of to the room around the hub
//   - taking the first escape off the hub rather than the cheapest
//
// Both are quality, not correctness: relaxation reaches a layout with no
// overlaps either way, and the property this file exists to defend still
// holds. What they change is how far cards travel to get there, which no
// assertion here can pin without hard-coding coordinates that would then
// break on any honest improvement.
//
// A third — dropping `if (isFixed[i]) continue` before the positions are
// applied — is genuinely equivalent: nothing ever writes a displacement for a
// fixed card, so the guard is defence rather than logic.

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exit(1);
