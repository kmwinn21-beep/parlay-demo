'use client';

import { useEffect } from 'react';

/**
 * How much of the screen CSS cannot see, in pixels, as --viewport-overhang.
 *
 * On an iPhone with the app on the Home Screen and the status bar set to
 * black-translucent, iOS lays the page out from the PHYSICAL top of the
 * screen — under the clock, which is the point — but makes the LAYOUT
 * viewport the screen MINUS the status bar. Every way CSS has of asking how
 * tall the screen is answers with that short box: 100vh, 100dvh, 100% of the
 * initial containing block, and `bottom: 0` on a fixed element all land one
 * status bar above the bottom edge. Measured on an iPhone 16 Pro: 812px of
 * layout on an 874px screen, with the last 62px showing the body's
 * background through every one of them.
 *
 * `window.innerHeight` is not fooled — it reports the visual viewport, which
 * is the whole screen — so the difference between the two is the overhang,
 * and the shell adds it to its own height to reach the bottom.
 *
 * Measured rather than named. Writing `env(safe-area-inset-top)` into the
 * height would be right on exactly this bug and wrong everywhere the inset
 * is real and already counted — an Android home-screen app, where the
 * layout viewport does include the status bar, would push its last row off
 * the bottom by the height of one. Here the two agree everywhere but on the
 * bug, so the overhang is 0 in every browser that has nothing wrong with it
 * and the rule changes nothing at all.
 *
 * The visual viewport also shrinks for the keyboard and for pinch zoom, so
 * the larger of the two readings is the one taken, and the result is clamped:
 * a surprising number is a measurement gone wrong, not a taller screen.
 */
const MAX_OVERHANG_PX = 200;

export function useViewportOverhang(): void {
  useEffect(() => {
    const root = document.documentElement;
    const measure = () => {
      const visual = Math.max(window.innerHeight || 0, window.visualViewport?.height ?? 0);
      const layout = root.clientHeight;
      const overhang = Math.round(visual - layout);
      root.style.setProperty(
        '--viewport-overhang',
        `${overhang > 0 && overhang <= MAX_OVERHANG_PX ? overhang : 0}px`,
      );
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('orientationchange', measure);
    window.visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('orientationchange', measure);
      window.visualViewport?.removeEventListener('resize', measure);
    };
  }, []);
}
