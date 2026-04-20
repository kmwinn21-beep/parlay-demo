'use client';

import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

interface FloatingNavHiddenCtx {
  navHidden: boolean;
  setNavHidden: (v: boolean) => void;
  showUnhideHint: boolean;
  dismissHint: () => void;
}

const Ctx = createContext<FloatingNavHiddenCtx>({
  navHidden: false,
  setNavHidden: () => {},
  showUnhideHint: false,
  dismissHint: () => {},
});

const KEY = 'floatingNavHidden';

// ── Overlay that spotlights the header hamburger button ───────────────────────
function UnhideNavOverlay({ onDismiss }: { onDismiss: () => void }) {
  const [rect, setRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    // Wait one frame for header to render the hamburger button
    const frame = requestAnimationFrame(() => {
      if (!mounted.current) return;
      const btn = document.getElementById('header-unhide-nav-btn');
      if (btn) {
        const r = btn.getBoundingClientRect();
        setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
      }
    });
    return () => { mounted.current = false; cancelAnimationFrame(frame); };
  }, []);

  const pad = 8;
  const spotTop = rect ? rect.top - pad : 0;
  const spotLeft = rect ? rect.left - pad : 0;
  const spotW = rect ? rect.width + pad * 2 : 0;
  const spotH = rect ? rect.height + pad * 2 : 0;

  // Tooltip positioning: centered on button, clamped to viewport
  const tooltipW = 220;
  const tooltipLeft = rect
    ? Math.min(Math.max(rect.left + rect.width / 2 - tooltipW / 2, 16), (typeof window !== 'undefined' ? window.innerWidth : 400) - tooltipW - 16)
    : 0;
  const tooltipTop = rect ? rect.top + rect.height + pad + 14 : 0;
  // Arrow offset within tooltip
  const arrowLeft = rect ? Math.max(8, Math.min(rect.left + rect.width / 2 - tooltipLeft - 8, tooltipW - 24)) : tooltipW / 2 - 8;

  return (
    <div
      className="fixed inset-0 z-[500]"
      onClick={onDismiss}
    >
      {/* Dark overlay rendered as backdrop. The spotlight uses box-shadow. */}
      {rect ? (
        <div
          style={{
            position: 'fixed',
            top: spotTop,
            left: spotLeft,
            width: spotW,
            height: spotH,
            borderRadius: 10,
            // box-shadow fills everything outside the element with dark overlay
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.78)',
            pointerEvents: 'none',
          }}
          className="outline outline-2 outline-white/80 animate-pulse"
        />
      ) : (
        <div className="absolute inset-0 bg-black/78" />
      )}

      {/* Tooltip */}
      {rect && (
        <div
          style={{ position: 'fixed', top: tooltipTop, left: tooltipLeft, width: tooltipW, zIndex: 501 }}
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-xl shadow-2xl px-4 py-3"
        >
          {/* Arrow */}
          <div
            style={{ position: 'absolute', top: -7, left: arrowLeft }}
            className="w-3.5 h-3.5 bg-white rotate-45 shadow-sm"
          />
          <p className="text-sm font-semibold text-procare-dark-blue leading-snug">Click Here</p>
          <p className="text-xs text-gray-500 mt-0.5">to Unhide Navigation Menu</p>
        </div>
      )}

      {/* X button */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss"
        style={{ position: 'fixed', top: 12, left: 12, zIndex: 502 }}
        className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

// ── Provider ──────────────────────────────────────────────────────────────────
export function FloatingNavHiddenProvider({ children }: { children: React.ReactNode }) {
  const [navHidden, setNavHiddenState] = useState(false);
  const [showUnhideHint, setShowUnhideHint] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === 'true') setNavHiddenState(true);
    } catch {}
  }, []);

  const setNavHidden = useCallback((v: boolean) => {
    setNavHiddenState(v);
    if (v) setShowUnhideHint(true);
    try { localStorage.setItem(KEY, v ? 'true' : 'false'); } catch {}
  }, []);

  const dismissHint = useCallback(() => setShowUnhideHint(false), []);

  return (
    <Ctx.Provider value={{ navHidden, setNavHidden, showUnhideHint, dismissHint }}>
      {children}
      {showUnhideHint && <UnhideNavOverlay onDismiss={dismissHint} />}
    </Ctx.Provider>
  );
}

export function useFloatingNavHidden() {
  return useContext(Ctx);
}
