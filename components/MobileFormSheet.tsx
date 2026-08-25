'use client';

import { createPortal } from 'react-dom';
import { useIsDesktop } from '@/lib/useIsDesktop';

/**
 * A form that stays inline on desktop and becomes a bottom sheet on a phone.
 *
 * Inline, a long form pushes the rest of the page down and opens somewhere the
 * reader has to go looking for; as a sheet it arrives over the page with the
 * same slide-up every other drawer in the app uses.
 *
 * Nothing inside should autofocus. On a phone the keyboard would open with the
 * sheet and cover most of the fields before anyone has chosen to type.
 */
export function MobileFormSheet({ title, onClose, children }: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const isDesktop = useIsDesktop();

  // null until measured — render the inline form, which is what the server
  // sent, so the first client paint matches it.
  if (isDesktop !== false) {
    return <div className="mb-4 p-4 border border-blue-200 rounded-lg bg-blue-50/50 space-y-3">{children}</div>;
  }

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />
      <div className="drawer-mobile-responsive fixed inset-x-0 bottom-0 z-[61] max-h-[88vh] w-full rounded-t-2xl bg-white shadow-2xl flex flex-col">
        <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-300" />
        </div>
        <div className="flex items-center justify-between gap-3 px-4 pb-3 border-b border-gray-100 flex-shrink-0">
          <h3 className="text-sm font-semibold text-brand-primary font-serif truncate">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded hover:bg-gray-100 text-gray-500 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3">{children}</div>
      </div>
    </>,
    document.body,
  );
}
