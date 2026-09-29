'use client';

import { useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * A note, read on a phone.
 *
 * Below sm it rises from the bottom edge and fills the screen from just under
 * the app header down — a fixed span rather than a height that follows the
 * note, so a two-line note opens where a twenty-line one does instead of
 * sitting in a strip at the bottom of the screen. From sm up it is the centred
 * dialog it always was.
 *
 * The top is MEASURED off the header rather than set to its height: banners
 * sit above it and come and go, and a sheet that starts at a number somebody
 * typed once ends up overlapping one of them or leaving a gap under it.
 */
export function NoteSheet({ onClose, labelledBy, className = '', children }: {
  onClose: () => void;
  /** id of the element naming this sheet, for assistive tech. */
  labelledBy?: string;
  /** Extra classes on the panel — a left rule for a pinned note, say. */
  className?: string;
  children: React.ReactNode;
}) {
  const [top, setTop] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const header = document.querySelector('[data-app-header]');
      setTop(header ? Math.max(0, Math.round(header.getBoundingClientRect().bottom)) : 0);
    };
    measure();
    window.addEventListener('resize', measure);
    // The header is taller once a banner appears above it, and banners arrive
    // after their own fetch rather than with the first paint.
    const ro = new ResizeObserver(measure);
    const header = document.querySelector('[data-app-header]');
    if (header) ro.observe(header);
    return () => { window.removeEventListener('resize', measure); ro.disconnect(); };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] bg-black/40 sm:flex sm:items-center sm:justify-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        onClick={e => e.stopPropagation()}
        style={{ ['--sheet-top' as string]: `${top}px` }}
        className={`note-sheet modal-sheet-mobile bg-white shadow-2xl border border-gray-200 flex flex-col ${className}`}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}
