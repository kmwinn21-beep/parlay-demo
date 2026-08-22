'use client';

import { useEffect, useState } from 'react';

/**
 * Tracks a media query, reporting null until it has actually been measured.
 *
 * That third state matters for callers that mount one of two mutually
 * exclusive trees: guessing a value on the server would either mount both
 * (duplicating whatever fetching the tree does) or mismatch on hydration.
 */
export function useIsDesktop(query = '(min-width: 1024px)'): boolean | null {
  const [isDesktop, setIsDesktop] = useState<boolean | null>(null);

  useEffect(() => {
    const media = window.matchMedia(query);
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [query]);

  return isDesktop;
}
