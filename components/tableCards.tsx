'use client';

import type { ReactNode } from 'react';

/**
 * The card treatment shared by the desktop record tables — meetings, attendees
 * and companies.
 *
 * A row reads as a card: white on a grey ground, with a border, rounded ends
 * and a gap on every side. The fill, border and rounding go on the cells rather
 * than the row, because a <tr> cannot be rounded, and are applied through a
 * child selector so the switch that builds each cell doesn't repeat them.
 */

/** Grey ground, and the inset that gives the cards their left/right margin. */
export const CARD_TABLE_WRAP = 'bg-gray-50 rounded-lg px-2 pb-2';

/** border-spacing is the only place a table has to put a gap between rows. */
export const CARD_TABLE = 'border-separate [border-spacing:0_0.5rem]';

/**
 * The row's cell styling. `selected` swaps the fill and outlines the card by
 * colouring its own border — a ring is inset on all four sides of every cell,
 * which draws the column divisions back on as grid lines.
 */
export function cardRowClass(selected: boolean): string {
  return [
    '[&>td]:transition-colors [&>td]:border-y [&>td]:border-gray-200',
    '[&>td:first-child]:border-l [&>td:first-child]:rounded-l-lg',
    '[&>td:last-child]:border-r [&>td:last-child]:rounded-r-lg',
    selected
      ? '[&>td]:bg-blue-50 [&>td]:border-brand-secondary/40'
      : '[&>td]:bg-white [&:hover>td]:bg-gray-50',
  ].join(' ');
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
