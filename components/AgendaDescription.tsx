'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * An agenda item's description: one line by default, the rest behind a
 * chevron. It sits outside the item's text column so its left edge lines up
 * with the session time.
 */
export function AgendaDescription({ text, className = '', icon }: {
  text: string;
  className?: string;
  /** Leading glyph — the location line uses the map pin. */
  icon?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [clamped, setClamped] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  // Only offer the chevron when there is something hidden to reveal.
  const measure = useCallback(() => {
    const el = ref.current;
    if (!el || open) return;
    setClamped(el.scrollHeight > el.clientHeight + 1);
  }, [open]);

  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener('resize', measure);
    return () => { ro.disconnect(); window.removeEventListener('resize', measure); };
  }, [measure, text]);

  return (
    <div className={`flex items-start gap-1 ${className}`}>
      {icon}
      <p ref={ref} className={`text-xs text-gray-500 flex-1 min-w-0 ${open ? '' : 'line-clamp-1'}`}>
        {text}
      </p>
      {(clamped || open) && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          title={open ? 'Show less' : 'Show more'}
          className="flex-shrink-0 p-0.5 -mt-0.5 text-gray-400 hover:text-brand-secondary transition-colors"
        >
          <svg className={`w-3.5 h-3.5 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}
    </div>
  );
}
