'use client';

import { useEffect, useState } from 'react';

/**
 * Whether the viewport is narrower than Tailwind's `sm`.
 *
 * For the places where a phone and a pointer need DIFFERENT MARKUP rather
 * than different styling — a card anchored to the control that opened it
 * cannot become a full-width sheet with a class, because its position is a
 * measurement rather than a rule.
 *
 * Starts false and corrects itself after mount, so the server's output and
 * the first client render agree. A card that renders anchored for one frame
 * and then becomes a sheet is the right trade here: the alternative is
 * rendering nothing until the measurement lands, and this one only ever
 * mounts in response to a tap.
 */
export function useIsPhone(): boolean {
  const [isPhone, setIsPhone] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 639px)');
    const update = () => setIsPhone(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return isPhone;
}
