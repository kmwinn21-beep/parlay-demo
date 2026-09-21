'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the activity chooser, or a modal it opened, is on screen.
 *
 * Two things listen for a saved note and both can want the screen at once. The
 * chooser appears immediately, because it read the note locally; the vendor
 * prompt appears whenever the extractor finishes, which is anywhere from one
 * to twelve seconds later. Left alone, a note that mentions both a meeting and
 * a vendor stacks two dialogs and two backdrops, and the one underneath is
 * unreachable.
 *
 * The rule is that the chooser goes first. It is the more urgent of the two —
 * the person wrote that sentence seconds ago — and it resolves in one tap,
 * after which the vendor prompt shows normally with nothing lost: it holds its
 * suggestions in state rather than discarding them.
 *
 * A module-level flag with an event rather than context, for the same reason
 * announce.ts is an event: neither of these components is anywhere near the
 * other in the tree, and neither should have to be.
 */
const ACTIVITY_FLOW_EVENT = 'parlay:activity-flow';

let open = false;

/** Called by the chooser as it opens and as the last thing it opened closes. */
export function setActivityFlowOpen(next: boolean) {
  if (typeof window === 'undefined' || open === next) return;
  open = next;
  window.dispatchEvent(new CustomEvent(ACTIVITY_FLOW_EVENT, { detail: next }));
}

export function isActivityFlowOpen(): boolean {
  return open;
}

/** Re-renders whatever is waiting when the flow opens or closes. */
export function useActivityFlowOpen(): boolean {
  // Seeded from the module rather than from `false`: a listener mounting while
  // the flow is already open would otherwise show itself once before the next
  // event corrected it.
  const [isOpen, setIsOpen] = useState(open);
  useEffect(() => {
    setIsOpen(open);
    const onChange = (e: Event) => setIsOpen(Boolean((e as CustomEvent).detail));
    window.addEventListener(ACTIVITY_FLOW_EVENT, onChange);
    return () => window.removeEventListener(ACTIVITY_FLOW_EVENT, onChange);
  }, []);
  return isOpen;
}
