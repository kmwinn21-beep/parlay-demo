'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Shared open/shut state for the collapsible sections down a detail page's
 * side column, so one control can drive all of them.
 *
 * The sections don't share a parent — some are rendered by the page, others by
 * their own components — so rather than lift the state up, each one registers
 * itself here and Expand All walks the registry. A section that unmounts takes
 * itself out, which is what keeps the count honest when Section Management
 * hides one or a section renders nothing.
 */
interface Registration {
  expanded: boolean;
  set: (value: boolean) => void;
}

const sections = new Map<number, Registration>();
const subscribers = new Set<() => void>();
let nextId = 0;

function notify() {
  subscribers.forEach(fn => fn());
}

/** Drop-in for useState(false) that also joins the registry. */
export function useCollapsibleSection(initial = false): [boolean, React.Dispatch<React.SetStateAction<boolean>>] {
  const [expanded, setExpanded] = useState(initial);
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = ++nextId;

  useEffect(() => {
    const id = idRef.current;
    sections.set(id, { expanded, set: v => setExpanded(v) });
    notify();
    return () => { sections.delete(id); notify(); };
  }, [expanded]);

  return [expanded, setExpanded];
}

/** True while at least one registered section is open. */
export function useAnySectionExpanded(): boolean {
  const [any, setAny] = useState(false);
  useEffect(() => {
    const update = () => setAny(Array.from(sections.values()).some(s => s.expanded));
    subscribers.add(update);
    update();
    return () => { subscribers.delete(update); };
  }, []);
  return any;
}

export function setAllSections(expand: boolean): void {
  sections.forEach(s => s.set(expand));
}
