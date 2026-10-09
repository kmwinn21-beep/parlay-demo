'use client';

import { useEffect, useState } from 'react';
import { RecordQuickViewBody } from '@/components/RecordQuickViewBody';
import { createPortal } from 'react-dom';
import { useDrawerResize } from '@/lib/useDrawerResize';

export interface QuickViewTarget {
  type: 'attendee' | 'company' | 'conference';
  id: number;
  name: string;
}

const BASE_PATHS: Record<QuickViewTarget['type'], string> = {
  attendee: '/attendees',
  company: '/companies',
  conference: '/conferences',
};

interface Props {
  target: QuickViewTarget;
  onClose: () => void;
  /**
   * The layer it opens on. Default clears the page.
   *
   * It portals to the body, so a caller that is itself above the page — a
   * modal — has to say so, or this opens behind the thing that opened it.
   */
  zClass?: string;
  /**
   * Opened BESIDE the drawer that opened it, rather than over the page.
   *
   * Docked, this paints no backdrop of its own: the drawer alongside already
   * has one, and a second would dim that drawer as well — the thing the reader
   * is meant to still be looking at. Outside clicks fall through to the
   * existing backdrop, which is the same arrangement CompanyAttendeesDrawer
   * uses for its activity timeline.
   */
  docked?: boolean;
}

export function QuickViewDrawer({ target, onClose, zClass = 'z-50', docked = false }: Props) {
  const [mounted, setMounted] = useState(false);
  const { panelStyle, handleResizeStart } = useDrawerResize(480);

  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  const href = `${BASE_PATHS[target.type]}/${target.id}`;

  if (!mounted) return null;

  return createPortal(
    <div className={`fixed inset-0 ${zClass} flex items-end sm:items-stretch sm:justify-end ${
      docked ? 'pointer-events-none' : ''}`}>
      {/* Backdrop — not when docked; see the prop. */}
      {!docked && <div className="absolute inset-0 bg-black/40" onClick={onClose} />}
      {/* Panel */}
      <div
        /* sheet-below-header rather than h-[90vh]: it SPANS the space under the
           site header instead of capping at it, so the top edge lands on the
           header whatever is inside. See app/globals.css — a cap only puts the
           edge there when the content is tall enough to reach it. */
        className={`drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[480px] sheet-below-header sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-tr-none ${
          docked ? 'pointer-events-auto' : ''}`}
        style={panelStyle}
      >
        {/* Resize handle */}
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>
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
        {/* The record itself. RecordQuickViewBody decides whether that is the
            view rendered inline or the page in a frame — it depends on the
            width and on the type, and neither is this drawer's business. */}
        <RecordQuickViewBody type={target.type} id={target.id} onClose={onClose} />
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
