'use client';

import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, ReactNode } from 'react';

/**
 * The card treatment shared by the desktop record tables — meetings, attendees
 * and companies.
 *
 * A row reads as a card: white on a grey ground, with a border, rounded ends
 * and a gap on every side. The fill, border and rounding go on the cells rather
 * than the row, because a <tr> cannot be rounded, and are applied through a
 * child selector so the switch that builds each cell doesn't repeat them.
 */

/**
 * Grey ground and the inset that gives the cards their left/right margin.
 *
 * The inset is on this element and the scrolling happens on the one inside it.
 * Padding on a scroll container is inside the scrollport, so a horizontally
 * scrolled table slides its cards through the margin instead of being clipped
 * by it.
 */
export const CARD_TABLE_WRAP = 'bg-gray-50 rounded-lg px-2';

/** The scrollport, inset by the wrapper above. */
export const CARD_TABLE_SCROLL = 'overflow-auto';

/**
 * The same, for a table that grows with the page rather than scrolling inside
 * a capped height — only sideways, so there is no scrollbar down its side.
 */
export const CARD_TABLE_SCROLL_X = 'overflow-x-auto';

/**
 * A sticky header row over card rows.
 *
 * Each cell carries the grey itself — with border-separate a row's background
 * does not reliably cover its cells — and a shadow paints the 8px of
 * border-spacing below the header, which is otherwise a transparent band that
 * rows show through as they scroll under. The z-index sits above the frozen
 * body cells, which have one of their own.
 */
export const CARD_TABLE_STICKY_HEAD = 'sticky top-0 z-40 [&>tr>th]:bg-gray-50 [&>tr>th]:shadow-[0_8px_0_0_rgb(249,250,251)]';

/**
 * A header row that scrolls with the table. Still needs the grey on the cells
 * themselves: with border-separate a row's background does not reliably cover
 * them.
 */
export const CARD_TABLE_HEAD = '[&>tr>th]:bg-gray-50';

/** border-spacing is the only place a table has to put a gap between rows. */
export const CARD_TABLE = 'border-separate [border-spacing:0_0.5rem]';

/**
 * The row's cell styling. `selected` and `focused` swap the fill and outline the
 * card by colouring its own border — a ring is inset on all four sides of every
 * cell, which draws the column divisions back on as grid lines.
 *
 * The three states are mutually exclusive, and each names both its fill and its
 * border. That matters: two border-colour utilities of equal specificity are
 * settled by the order Tailwind happens to emit them in, not by the order they
 * are written here, so a base colour alongside a state colour is a coin toss.
 * It landed the wrong way — the resting grey was emitted after the selected
 * blue and beat it, and a selected row never showed the border it asked for.
 * Deciding the colour once per state removes the contest rather than winning
 * it, and it is why focused now beats selected on purpose.
 *
 * Hover is a wash of the account's second accent, and only from `sm`: a tap on a
 * touch screen leaves the hover style stuck on the last card touched, which on a
 * phone reads as a selection nobody made.
 */
export function cardRowClass(selected: boolean, focused = false): string {
  return [
    '[&>td]:transition-colors [&>td]:border-y',
    '[&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg',
    '[&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg',
    focused
      // Dark grey rather than more of the accent: the fill is already the
      // accent, and an outline in the same colour has nothing to draw against.
      ? '[&>td]:bg-brand-highlight/25 [&>td]:border-gray-500'
      : selected
        ? '[&>td]:bg-blue-50 [&>td]:border-brand-secondary/40'
        : '[&>td]:bg-white [&>td]:border-gray-200 sm:[&:hover>td]:bg-brand-highlight/20',
  ].join(' ');
}

/**
 * A family's own row, sitting above the companies it gathers.
 *
 * Same card shape as the rows beneath it — border-y, rounded outer corners,
 * the 8px gap from border-spacing — so it reads as one of them rather than as
 * chrome. What separates it is a wash of the account's primary and a darker
 * border: enough to lead a run of rows, not so much that it competes with the
 * selected and picked states, which are the ones a reader is acting on.
 *
 * The wash is the brand token rather than a fixed navy, so an account that has
 * set its own primary gets its own tint. At the default primary it composites to
 * exactly rgba(34, 58, 94, 0.055) over the table's ground.
 *
 * It has to be opaque, though, and a 5.5% fill is not. Three of these cells are
 * sticky, and a translucent sticky cell has the rows it is holding still over
 * sliding beneath it — which reads as a dark band down the frozen columns as
 * soon as the table is scrolled sideways. So the tint is laid as a gradient over
 * an opaque ground rather than set as the colour: same result, nothing shows
 * through.
 */
export function cardGroupRowClass(): string {
  return [
    '[&>td]:transition-colors [&>td]:border-y [&>td]:border-gray-300',
    '[&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg',
    '[&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg',
    '[&>td]:bg-gray-50',
    '[&>td]:bg-[linear-gradient(rgb(var(--brand-primary-rgb)/0.055),rgb(var(--brand-primary-rgb)/0.055))]',
  ].join(' ');
}

/**
 * Everything that handles its own click. A click that lands on one of these is
 * that control's, not the card's — picking a card must not fight with opening a
 * record, editing a cell in place or ticking a checkbox.
 */
const INTERACTIVE_SELECTOR =
  'a, button, input, select, textarea, label, [role="button"], [role="menuitem"], [contenteditable="true"]';

/** True when the click was on the card itself — its text or its whitespace. */
export function isCardBackgroundClick(e: MouseEvent): boolean {
  const target = e.target as HTMLElement | null;
  return !!target && !target.closest(INTERACTIVE_SELECTOR);
}

/**
 * How much of the table a card gets to itself.
 *
 * Picking a card pushes every other one further back than the kebab does — the
 * kebab is a menu you are about to use and the rows behind it still matter,
 * whereas picking a card is a deliberate "this one", and the point is that
 * nothing else competes with it.
 */
export function cardEmphasisClass({ focused, otherFocused, dimmed }: {
  focused: boolean;
  /** Some other card in this table is the picked one. */
  otherFocused: boolean;
  /** Another row's actions menu is open. */
  dimmed: boolean;
}): string {
  const base = 'transition-opacity duration-200 ease-out';
  if (focused) return base;
  if (otherFocused) return `${base} opacity-20`;
  if (dimmed) return `${base} opacity-40`;
  return base;
}

/**
 * Which card the reader has picked out, and the region that keeps it picked.
 *
 * Put the returned ref on the element that wraps the table: a press anywhere
 * outside it lets the pick go. Picking a card is a way of reading the table, so
 * it should not outlive the reader's attention on it — leaving the table with
 * one card still lit and the rest greyed out is a state nobody asked to keep.
 *
 * Listens on mousedown rather than click so a press that starts outside the
 * table releases the pick even if the pointer is dragged before it lifts.
 */
export function useCardFocus<T extends HTMLElement = HTMLDivElement>() {
  const [focusedId, setFocusedId] = useState<number | null>(null);
  const regionRef = useRef<T>(null);

  useEffect(() => {
    if (focusedId == null) return;
    const onDown = (e: globalThis.MouseEvent) => {
      if (!regionRef.current?.contains(e.target as Node)) setFocusedId(null);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [focusedId]);

  /** Toggle from a click on the card itself; a click on a control is ignored. */
  const onCardClick = (id: number) => (e: MouseEvent) => {
    if (!isCardBackgroundClick(e)) return;
    setFocusedId(cur => (cur === id ? null : id));
  };

  return { focusedId, setFocusedId, regionRef, onCardClick };
}

/** Width of the selection column, open and collapsed. */
export const SELECTION_OPEN = 40;
export const SELECTION_CLOSED = 16;

/**
 * The selection column, which is only there when it is wanted.
 *
 * Collapsed it keeps the card's left padding, so the row still has a proper
 * rounded corner to sit behind; revealed it widens to hold the checkbox, which
 * pushes the row's contents right.
 *
 * A table's columns share one width, so this reveals for the whole table rather
 * than for the single hovered row: a cell cannot be wider than its column in
 * one row and narrower in the next. For the same reason the header's checkbox
 * is revealed along with the rest — held visible, it would reserve exactly the
 * space the reveal is meant to open up.
 */
export function SelectionCell({ revealed, children }: { revealed: boolean; children: ReactNode }) {
  return (
    <div
      className={`overflow-hidden transition-[width,opacity] duration-200 ease-out flex items-center justify-end ${
        revealed ? 'w-7 opacity-100' : 'w-2 opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

/**
 * The same reveal for a fixed-layout table, where the column's width comes from
 * the header cell rather than from its contents. The width is animated on the
 * cell itself; anything positioned after it (a sticky Name column, say) has to
 * follow the same number.
 */
export function selectionColumnWidth(revealed: boolean): number {
  return revealed ? SELECTION_OPEN : SELECTION_CLOSED;
}
