'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';

/**
 * The shell the dashboard's action drawers share — up from the bottom on a
 * phone, in from the right from sm, matching every other drawer in the app.
 *
 * Deliberately plain: no Suspense, no server component, nothing handed down
 * from the server tree. Everything inside is client-rendered and fetches for
 * itself, so there is never a server-created Suspense boundary for React to
 * adopt when the drawer opens. That is what took the dashboard down before
 * (React #435, "Unexpected Suspense handler tag"), and a boundary that never
 * existed on the server cannot be adopted wrongly.
 */
export function DashboardDrawer({ title, subtitle, onClose, children }: {
  title: string;
  subtitle?: string | null;
  onClose: () => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[69] bg-black/40" onClick={onClose} />
      <div className="drawer-mobile-responsive fixed bottom-0 left-0 right-0 sm:inset-y-0 sm:left-auto sm:right-0 h-[85vh] sm:h-auto w-full sm:w-[560px] bg-white shadow-2xl flex flex-col rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none z-[70]">
        <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-gray-200 flex-shrink-0">
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-brand-primary font-serif truncate">{title}</h3>
            {subtitle && <p className="text-xs text-gray-500 mt-0.5 truncate">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </>,
    document.body,
  );
}
