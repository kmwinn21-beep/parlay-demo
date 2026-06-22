'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

export interface QuickViewTarget {
  type: 'attendee' | 'company';
  id: number;
  name: string;
}

interface Props {
  target: QuickViewTarget;
  onClose: () => void;
}

export function QuickViewDrawer({ target, onClose }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const basePath = target.type === 'attendee' ? '/attendees' : '/companies';
  const href = `${basePath}/${target.id}`;

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      {/* Panel */}
      <div
        className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[480px] h-[90vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none"
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100 flex-shrink-0">
          <span className="text-sm font-semibold text-gray-800 truncate flex-1 min-w-0">{target.name}</span>
          <a
            href={href}
            className="text-xs text-brand-secondary hover:underline whitespace-nowrap flex-shrink-0"
          >
            Go to record →
          </a>
          <button
            type="button"
            onClick={onClose}
            className="flex-shrink-0 text-gray-400 hover:text-gray-700 transition-colors"
            aria-label="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Embedded record */}
        <iframe
          src={`${href}?embed=true`}
          className="flex-1 border-0 w-full"
          title={target.name}
        />
      </div>
    </div>,
    document.body
  );
}

/** Small eye icon button used to trigger quick view */
export function QuickViewIcon({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onClick(); }}
      className="flex-shrink-0 text-gray-400 hover:text-brand-secondary transition-colors"
      title="Quick view"
    >
      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    </button>
  );
}
