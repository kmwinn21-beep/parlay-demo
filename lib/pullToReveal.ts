'use client';

/**
 * Showing something only when the reader pulls the page down.
 *
 * On a phone the Back button sits above the conference card and costs a row
 * of screen to something nobody needs until they are leaving. Hidden by
 * default, it comes back when the page is pulled down — the gesture somebody
 * already makes to get to the top of a list — and goes away again when they
 * push back up.
 *
 * Out of the component because the rule is the part with anything to get
 * wrong: which direction reveals, how far counts as a direction rather than a
 * wobble, and what happens at the very top.
 */

/**
 * How far the page has to move before it counts as a direction.
 *
 * A finger resting on a scrolling list sends a stream of one and two pixel
 * deltas in both directions; without a threshold the button flickers on and
 * off through the whole gesture.
 */
export const PULL_REVEAL_THRESHOLD = 8;

/**
 * Whether the thing should be on screen after this scroll.
 *
 * Pulling down — content moving down, scrollTop falling — reveals. Pushing
 * back up hides. Anything smaller than the threshold leaves it as it was, so
 * the state only changes when somebody meant it to.
 *
 * Note what this does NOT do: sitting at the top does not reveal. Hidden at
 * rest is the whole point, and the page is often shorter than the screen now
 * that the tabs are a drawer — so "at the top" is the usual state rather than
 * a special one. The gesture at the top is handled by pulledAtTop below,
 * because a finger dragging against the end of a scroller moves nothing and
 * fires no scroll event at all.
 */
export function nextRevealed(
  prev: boolean,
  lastY: number,
  y: number,
  threshold = PULL_REVEAL_THRESHOLD,
): boolean {
  if (y < lastY - threshold) return true;
  if (y > lastY + threshold) return false;
  return prev;
}

/**
 * What a drag that began at the top means: reveal, hide, or nothing yet.
 *
 * The case scrolling cannot see. When a page is already at its top — or is
 * shorter than the screen, which the conference page usually is now that the
 * tabs are a drawer — a finger moves nothing and fires no scroll event, so
 * the rule above never runs. Without this the button could be revealed and
 * then never put away, which is worse than never revealing it.
 *
 * `startY` and `y` are the touch's coordinates: dragging DOWN increases them,
 * which is the opposite sign from scrollTop. Away from the top this returns
 * null and the scroll rule has it, because there the finger and the content
 * are telling the same story and two sources would fight.
 */
export function dragAtTop(
  scrollTop: number,
  startY: number,
  y: number,
  threshold = PULL_REVEAL_THRESHOLD,
): boolean | null {
  if (scrollTop > 0) return null;
  if (y - startY > threshold) return true;
  if (startY - y > threshold) return false;
  return null;
}
