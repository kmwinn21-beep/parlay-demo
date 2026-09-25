/**
 * Where the spoke cards sit around a hub that can be anywhere on the canvas.
 *
 * The first version put them on an ellipse centred on the hub and clamped each
 * card into the canvas afterwards. That is fine while the hub is in the middle
 * and falls apart the moment it is not: half the ring lands outside, every card
 * out there clamps to the same edge, and four names stack on one another.
 *
 * Two changes fix it. The ring is sized to the room actually available on each
 * side of the hub rather than to the canvas as a whole, so a hub near the left
 * edge fans its cards right instead of into the wall. And whatever the ring
 * produces is then relaxed: any two cards that overlap push each other apart,
 * and any card sitting on the hub is pushed off it, for a fixed number of
 * passes.
 *
 * Relaxation cannot always succeed — twenty cards on a small canvas have
 * nowhere to go — so it is written to degrade rather than thrash. Every pass
 * ends inside the canvas, and a pass that cannot separate a pair leaves them
 * closer than they would be with no relaxation at all.
 */

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pos { x: number; y: number }

/** Passes of overlap resolution. Enough to settle a dozen cards. */
const PASSES = 60;
/** Gap left between two cards, and between a card and the hub. */
const GAP = 12;

function overlap(a: Rect, b: Rect, gap: number): { dx: number; dy: number } | null {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  // How far the two boxes intrude on one another, on each axis.
  const px = (a.w + b.w) / 2 + gap - Math.abs(ax - bx);
  const py = (a.h + b.h) / 2 + gap - Math.abs(ay - by);
  if (px <= 0 || py <= 0) return null;
  // Separate along the shallower axis: pushing a pair apart sideways when they
  // are barely touching vertically sends them much further than they need.
  if (px < py) return { dx: (ax < bx ? -px : px), dy: 0 };
  return { dx: 0, dy: (ay < by ? -py : py) };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * The cheapest way off a rectangle that does not end in a wall.
 *
 * The shallower axis is the right answer in open space and the wrong one
 * against an edge: a card below a hub that is itself on the bottom edge gets
 * pushed further down, clamped back, and is still on the hub next pass. So all
 * four escapes are costed and the cheapest one that actually fits is taken.
 *
 * Returns null when none of them fit, which is a card with nowhere to go —
 * better left where it is than shoved somewhere equally wrong.
 */
function escapeFrom(a: Rect, b: Rect, gap: number, maxX: number, maxY: number): Pos | null {
  const ax = a.x + a.w / 2, ay = a.y + a.h / 2;
  const bx = b.x + b.w / 2, by = b.y + b.h / 2;
  const px = (a.w + b.w) / 2 + gap - Math.abs(ax - bx);
  const py = (a.h + b.h) / 2 + gap - Math.abs(ay - by);
  if (px <= 0 || py <= 0) return null;

  // Each direction, with the distance it costs to leave that way.
  const left = (ax - bx) - (a.w + b.w) / 2 - gap;
  const right = (bx - ax) - (a.w + b.w) / 2 - gap;
  const up = (ay - by) - (a.h + b.h) / 2 - gap;
  const down = (by - ay) - (a.h + b.h) / 2 - gap;
  const options: Array<{ d: Pos; cost: number }> = [
    { d: { x: left, y: 0 }, cost: Math.abs(left) },
    { d: { x: -right, y: 0 }, cost: Math.abs(right) },
    { d: { x: 0, y: up }, cost: Math.abs(up) },
    { d: { x: 0, y: -down }, cost: Math.abs(down) },
  ];
  options.sort((m, n) => m.cost - n.cost);

  for (const o of options) {
    const nx = a.x + o.d.x;
    const ny = a.y + o.d.y;
    // Only worth taking if it survives the clamp — otherwise the card is back
    // on the hub the moment it is applied.
    if (nx >= -0.5 && nx <= maxX + 0.5 && ny >= -0.5 && ny <= maxY + 0.5) return o.d;
  }
  return null;
}

/**
 * The starting ring.
 *
 * The radius on each axis is the smaller of the room to each side of the hub,
 * so the ring stays inside the canvas wherever the hub is, and never smaller
 * than it takes to clear the hub itself.
 *
 * Giving each card its own radius — as far as it could reach in its own
 * direction — was tried and is worse: cards aimed at a nearby wall come in so
 * close that they start on top of the hub, and relaxation has further to
 * carry them than it can in one pass.
 *
 * Cards are placed at their own angle, which keeps their order stable as the
 * hub moves. An angle recomputed from the index would reshuffle every card
 * whenever one was filtered out.
 */
function ring(count: number, hub: Rect, card: { w: number; h: number }, box: { w: number; h: number }): Pos[] {
  const cx = hub.x + hub.w / 2;
  const cy = hub.y + hub.h / 2;

  // Room from the hub's centre to each wall, less half a card so the card
  // itself fits.
  const roomL = cx - card.w / 2 - GAP;
  const roomR = box.w - cx - card.w / 2 - GAP;
  const roomT = cy - card.h / 2 - GAP;
  const roomB = box.h - cy - card.h / 2 - GAP;

  const minRx = hub.w / 2 + card.w / 2 + GAP;
  const minRy = hub.h / 2 + card.h / 2 + GAP;
  const rx = Math.max(minRx, Math.min(roomL, roomR));
  const ry = Math.max(minRy, Math.min(roomT, roomB));

  const n = Math.max(1, count);
  const out: Pos[] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
    out.push({
      x: clamp(cx + Math.cos(angle) * rx - card.w / 2, 0, Math.max(0, box.w - card.w)),
      y: clamp(cy + Math.sin(angle) * ry - card.h / 2, 0, Math.max(0, box.h - card.h)),
    });
  }
  return out;
}

/**
 * Positions for every spoke, avoiding each other and the hub where it can.
 *
 * `fixed` holds cards the reader has dragged somewhere. They are never moved —
 * a card put down deliberately staying put matters more than a tidy ring — but
 * they do push the others away, so an automatic card will not land under one.
 */
export function layoutSpokes({ ids, hub, card, box, fixed = {} }: {
  ids: number[];
  hub: Rect;
  card: { w: number; h: number };
  box: { w: number; h: number };
  fixed?: Record<number, Pos>;
}): Record<number, Pos> {
  if (ids.length === 0 || box.w <= 0 || box.h <= 0) return {};

  const maxX = Math.max(0, box.w - card.w);
  const maxY = Math.max(0, box.h - card.h);

  const start = ring(ids.length, hub, card, box);
  const pos: Pos[] = ids.map((id, i) =>
    fixed[id] ? { x: clamp(fixed[id].x, 0, maxX), y: clamp(fixed[id].y, 0, maxY) } : start[i]);
  const isFixed = ids.map(id => !!fixed[id]);

  for (let pass = 0; pass < PASSES; pass++) {
    let settled = true;
    // Displacements are gathered first and applied together, so the order of
    // the list does not decide who gets pushed where.
    const push: Pos[] = ids.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < ids.length; i++) {
      const a = { ...pos[i], w: card.w, h: card.h };

      // Off the hub first: a card under the hub is the one overlap a reader
      // cannot work around by dragging the others.
      if (!isFixed[i]) {
        const away = escapeFrom(a, hub, GAP, maxX, maxY);
        if (away) {
          push[i].x += away.x;
          push[i].y += away.y;
          settled = false;
        }
      }

      for (let j = i + 1; j < ids.length; j++) {
        const b = { ...pos[j], w: card.w, h: card.h };
        const o = overlap(a, b, GAP);
        if (!o) continue;
        settled = false;
        // A fixed card takes none of the push, so the moving one gives way.
        if (isFixed[i] && isFixed[j]) continue;
        if (isFixed[i]) { push[j].x -= o.dx; push[j].y -= o.dy; continue; }
        if (isFixed[j]) { push[i].x += o.dx; push[i].y += o.dy; continue; }
        push[i].x += o.dx / 2; push[i].y += o.dy / 2;
        push[j].x -= o.dx / 2; push[j].y -= o.dy / 2;
      }
    }

    if (settled) break;
    for (let i = 0; i < ids.length; i++) {
      if (isFixed[i]) continue;
      pos[i] = {
        x: clamp(pos[i].x + push[i].x, 0, maxX),
        y: clamp(pos[i].y + push[i].y, 0, maxY),
      };
    }
  }

  // A last correction for the hub alone, applied straight to the position
  // rather than averaged with anything else.
  //
  // During relaxation a card can be pushed off the hub and back onto it by a
  // neighbour in the same pass, and the two can cancel to within a pixel or
  // two — which still reads as a card sitting on the hub. Of every overlap on
  // this canvas that is the one a reader cannot fix by dragging something
  // else, so it gets the last word.
  for (let i = 0; i < ids.length; i++) {
    if (isFixed[i]) continue;
    for (let k = 0; k < 4; k++) {
      const away = escapeFrom({ ...pos[i], w: card.w, h: card.h }, hub, GAP, maxX, maxY);
      if (!away) break;
      pos[i] = {
        x: clamp(pos[i].x + away.x, 0, maxX),
        y: clamp(pos[i].y + away.y, 0, maxY),
      };
    }
  }

  const out: Record<number, Pos> = {};
  ids.forEach((id, i) => { out[id] = pos[i]; });
  return out;
}

/** True when two cards of this size at these positions intersect. */
export function cardsOverlap(a: Pos, b: Pos, card: { w: number; h: number }, gap = 0): boolean {
  return overlap({ ...a, ...card }, { ...b, ...card }, gap) !== null;
}
