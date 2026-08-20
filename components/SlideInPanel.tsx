'use client';

import { useEffect, useState } from 'react';

const ANIMATION_MS = 220;

/**
 * The panel chrome the outreach and social-event notes drawers use, pulled out
 * so other surfaces can open the same thing rather than growing a third copy.
 *
 * Desktop: a column beside the content that unfurls top-down and collapses
 * bottom-up, sticky so it stays put while the list scrolls. Below sm it is the
 * site's standard bottom sheet, backdrop and all.
 */
export function SlideInPanel({
  title,
  subtitle,
  onClose,
  children,
  footer,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** Pinned below the scrolling body. */
  footer?: React.ReactNode;
}) {
  const [phase, setPhase] = useState<'closed' | 'open' | 'closing'>('closed');
  const [isDesktop, setIsDesktop] = useState(true);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 640px)');
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const raf = requestAnimationFrame(() => setPhase('open'));
    return () => cancelAnimationFrame(raf);
  }, []);

  // The collapse only reads as motion on desktop; the sheet has its own.
  const handleClose = () => {
    if (!isDesktop) { onClose(); return; }
    setPhase('closing');
    setTimeout(onClose, ANIMATION_MS);
  };

  useEffect(() => {
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') handleClose(); };
    document.addEventListener('keydown', onEsc);
    return () => document.removeEventListener('keydown', onEsc);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop]);

  return (
    <>
      {!isDesktop && (
        <div className="fixed inset-0 bg-black/30 z-40" onClick={handleClose} />
      )}
      <div
        style={isDesktop ? {
          transformOrigin: phase === 'closing' ? 'bottom' : 'top',
          transform: phase === 'open' ? 'scaleY(1)' : 'scaleY(0.05)',
          opacity: phase === 'open' ? 1 : 0,
          transition: `transform ${ANIMATION_MS}ms ease, opacity ${ANIMATION_MS}ms ease`,
        } : undefined}
        className={isDesktop
          ? 'border border-gray-200 rounded-xl bg-white overflow-hidden sticky top-4 flex flex-col max-h-[calc(100vh-6rem)]'
          : 'drawer-mobile-responsive fixed inset-x-0 bottom-0 z-50 h-[75vh] w-full rounded-t-2xl border border-gray-200 bg-white overflow-hidden flex flex-col'}
      >
        <div className="flex items-start justify-between gap-2 px-3 py-2.5 border-b border-gray-100 flex-shrink-0">
          <div className="min-w-0">
            <div className="text-xs font-semibold text-gray-700 truncate">{title}</div>
            {subtitle && <div className="text-[10px] text-gray-400 truncate mt-0.5">{subtitle}</div>}
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
            title="Close"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">{children}</div>

        {footer && (
          <div className="border-t border-gray-100 px-3 py-2.5 flex-shrink-0">{footer}</div>
        )}
      </div>
    </>
  );
}
