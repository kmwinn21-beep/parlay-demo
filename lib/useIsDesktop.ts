'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the viewport is at Tailwind's `lg` or wider, for the handful of
 * places where a desktop-only subtree is expensive enough that hiding it with
 * CSS still costs something — a phone would run its fetches for a card it can
 * never see.
 *
 * Returns null until the breakpoint has actually been measured. Callers must
 * render nothing for null rather than guessing, so the server's output and the
 * first client render agree; reading the viewport during render is what put
 * React #418 on the dashboard before. Only reach for this over a `hidden
 * lg:block` class when the work being skipped is real — and never around a
 * subtree containing a server-rendered <Suspense>, which is the shape that
 * turned that mismatch into #435.
 */
export function useIsDesktop(): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 1024px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isDesktop;
}
