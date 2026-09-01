'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRevealOnExpand } from './revealOnExpand';

/**
 * Dashboard sections that fold away on a phone and stay open on desktop.
 *
 * Both pieces of state start at their desktop values — not mobile, and not
 * read from anything the server can't see — so the first client render matches
 * the server's exactly. The breakpoint is measured after mount instead, which
 * is the whole reason this is a hook rather than a `typeof window` check
 * inside useState: reading the viewport during render is what put React #418
 * (and the crashes downstream of it) on the dashboard twice.
 *
 * Phones open collapsed, once. A later resize back into mobile won't re-fold a
 * section the reader has since opened.
 */
export function useMobileCollapse(query = '(max-width: 1023px)') {
  const [isMobile, setIsMobile] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const collapsedOnce = useRef(false);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      if (!mobile) {
        setExpanded(true);
      } else if (!collapsedOnce.current) {
        collapsedOnce.current = true;
        setExpanded(false);
      }
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  // Opening one is a request to read it, so make sure it can be read.
  useRevealOnExpand(expanded);

  /** Only does anything on a phone; desktop sections don't collapse. */
  const toggle = useCallback(() => { setExpanded(v => (isMobile ? !v : v)); }, [isMobile]);

  /** Opens the section — for when new content arrives that should be seen. */
  const expand = useCallback(() => { collapsedOnce.current = true; setExpanded(true); }, []);

  return {
    isMobile,
    expanded,
    toggle,
    expand,
    /** Desktop always shows the body; a phone shows it when expanded. */
    showBody: !isMobile || expanded,
  };
}
