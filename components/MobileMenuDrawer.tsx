'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * A header menu, as a phone drawer.
 *
 * The four menus in the app header are dropdowns anchored to their icon: a
 * panel 224 to 288px wide, pinned to the top right corner, holding a list
 * that can run to forty conferences or a hundred follow-ups. On a desktop
 * that is right — the pointer is already there and the page behind stays
 * readable. On a phone it is a column a third of the screen wide, scrolling
 * inside a scrolling page, with rows too small to hit and actions that only
 * appear on hover.
 *
 * So below sm each of them opens this instead: the same sheet every other
 * phone drawer in the app uses, from the header's bottom edge to the bottom
 * of the screen. One component rather than four, so they stop in the same
 * place, close the same ways, and a fifth menu costs nothing.
 *
 * The menu's own content is passed in: this owns the frame, the scrim, the
 * heading and the ways out, and nothing about what is being listed.
 */
export function MobileMenuDrawer({
  title, subtitle, badge, action, onClose, children,
}: {
  title: string;
  /** The line under it — a count, or what a mark in the list means. */
  subtitle?: ReactNode;
  /** A bubble beside the title, where the menu's icon carries one. */
  badge?: ReactNode;
  /** One control in the heading, like Mark all read. */
  action?: ReactNode;
  onClose: () => void;
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); return () => setMounted(false); }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    /* pointer-events-none on the frame, restored on the two things inside
       it: the strip where the app header is must stay live, or the only way
       from one menu to another is to close this one first — and tapping the
       icon you can plainly see is what anyone does next. */
    <div className="sm:hidden fixed inset-0 z-[180] flex items-end pointer-events-none">
      {/* The scrim stops at the header's bottom edge too, so the header keeps
          its colour and the open icon keeps its highlight. */}
      <div
        className="absolute inset-x-0 bottom-0 bg-black/40 pointer-events-auto"
        style={{ top: 'var(--mobile-header-h)' }}
        onClick={onClose}
        aria-hidden
      />
      {/* drawer-mobile-responsive caps it at the header's bottom edge rather
          than setting the height, so a short menu is a short sheet with the
          page showing above it and a long one stops exactly where every other
          phone drawer in the app stops. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        data-mobile-menu-drawer
        className="drawer-mobile-responsive pointer-events-auto relative w-full flex flex-col overflow-hidden rounded-t-2xl border-t border-gray-200 bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.18)]"
      >
        <div className="flex-shrink-0 flex items-center gap-2.5 px-4 py-3.5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-semibold font-serif text-brand-primary truncate">{title}</h2>
            {subtitle && <div className="mt-0.5 text-[11.5px] text-gray-500">{subtitle}</div>}
          </div>
          {badge}
          {action}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex-shrink-0 w-9 h-9 flex items-center justify-center rounded-full text-gray-400 hover:text-gray-700 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Whether a click landed inside an open menu drawer.
 *
 * Every one of these menus closes itself on a mousedown outside its own
 * element — which is right for a dropdown, and wrong the moment the same menu
 * is drawn in a PORTAL: the drawer is a child of <body>, so `ref.contains`
 * says every tap inside it is outside. The menu then shut on mousedown and
 * the button under the finger never saw its click, which looked from the
 * outside like a drawer full of controls that do nothing.
 *
 * So each handler asks this as well. The scrim is deliberately not inside —
 * it is a sibling of the sheet — so tapping it still closes.
 */
export function isInsideMobileMenuDrawer(target: EventTarget | null): boolean {
  const node = target as Node | null;
  const el = node instanceof Element ? node : node?.parentElement ?? null;
  return !!el?.closest('[data-mobile-menu-drawer]');
}

/** A group heading in one of these lists, pinned while its group runs under it. */
export function MobileMenuSection({ label, sticky = false }: { label: string; sticky?: boolean }) {
  return (
    <div className={`${sticky ? 'sticky top-0 z-10' : ''} bg-gray-50 border-b border-gray-100 px-4 py-1.5`}>
      <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">{label}</p>
    </div>
  );
}
