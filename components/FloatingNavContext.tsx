'use client';

/**
 * Who owns the floating nav menu's open state.
 *
 * ── Why a context ────────────────────────────────────────────────────────────
 *
 * The menu is rendered by FloatingNav, but on a phone it is OPENED by the
 * Parlay mark in the header — two components that are siblings, not relatives.
 * Lifting `open` here is what lets the mark toggle a menu it does not render,
 * and lets the mark show itself as selected while that menu is up.
 *
 * ── The anchor ───────────────────────────────────────────────────────────────
 *
 * FloatingNav lays its menu out around a point, and on desktop that point is
 * the draggable button's own position. On a phone there is no draggable button
 * — the header mark is the trigger — so the mark publishes its own rectangle
 * and the menu is built around that instead. Same layout maths either way: the
 * menu drops below and right-aligns because the anchor is high and to the
 * right, which is exactly what the position logic already does with a button
 * dragged to that corner.
 *
 * ── What this replaces ───────────────────────────────────────────────────────
 *
 * FloatingNavHiddenContext, which carried `navHidden` for a Hide pill and the
 * header hamburger that undid it. With the mark as the trigger there is nothing
 * to hide from and nothing to restore, so both are gone.
 */

import { createContext, useCallback, useContext, useMemo, useState } from 'react';

export interface NavAnchor {
  /** Viewport coordinates of the trigger's top-left corner. */
  x: number;
  y: number;
  /** The trigger's own size, so the menu can centre against it. */
  width: number;
  height: number;
}

interface FloatingNavValue {
  open: boolean;
  setOpen: (next: boolean | ((prev: boolean) => boolean)) => void;
  /** Null on desktop, where FloatingNav uses its own dragged position. */
  anchor: NavAnchor | null;
  setAnchor: (next: NavAnchor | null) => void;
}

const Ctx = createContext<FloatingNavValue>({
  open: false,
  setOpen: () => {},
  anchor: null,
  setAnchor: () => {},
});

export function useFloatingNav(): FloatingNavValue {
  return useContext(Ctx);
}

export function FloatingNavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpenState] = useState(false);
  const [anchor, setAnchorState] = useState<NavAnchor | null>(null);

  const setOpen = useCallback((next: boolean | ((prev: boolean) => boolean)) => {
    setOpenState(prev => (typeof next === 'function' ? next(prev) : next));
  }, []);
  const setAnchor = useCallback((next: NavAnchor | null) => setAnchorState(next), []);

  const value = useMemo(
    () => ({ open, setOpen, anchor, setAnchor }),
    [open, setOpen, anchor, setAnchor],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
