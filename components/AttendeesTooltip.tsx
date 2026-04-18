'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface AttendeesTooltipProps {
  attendees: string[];
  align?: 'center' | 'right';
}

export default function AttendeesTooltip({ attendees, align = 'center' }: AttendeesTooltipProps) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const tooltipEl = tooltipRef.current;
    const tooltipWidth = tooltipEl ? tooltipEl.offsetWidth : 0;
    const PADDING = 8;

    let left: number;
    if (align === 'right') {
      left = rect.right - tooltipWidth;
    } else {
      left = rect.left + rect.width / 2 - tooltipWidth / 2;
    }

    // Clamp so the tooltip stays within the viewport
    left = Math.max(PADDING, Math.min(left, window.innerWidth - tooltipWidth - PADDING));

    setPos({
      top: rect.top - 8,
      left,
    });
  }, [align]);

  const visible = open || hover;

  useEffect(() => {
    if (!visible) return;
    updatePosition();
    // Re-calculate after the tooltip has rendered so we have its actual width
    const frame = requestAnimationFrame(updatePosition);
    return () => cancelAnimationFrame(frame);
  }, [visible, updatePosition]);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  if (attendees.length === 0) return null;

  const tooltip = visible && pos
    ? createPortal(
        <span
          ref={tooltipRef}
          className="pointer-events-none fixed z-[9999] flex flex-col items-end"
          style={{ top: pos.top, left: pos.left, transform: 'translateY(-100%)' }}
        >
          <span className="rounded-lg bg-gray-900 px-3 py-2.5 text-xs text-white shadow-xl">
            <span className="block font-semibold mb-1.5 text-gray-300 uppercase tracking-wide text-[10px]">Internal Attendees</span>
            <span className="block space-y-1">
              {attendees.map((name, i) => (
                <span key={i} className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 flex-shrink-0" />
                  <span className="whitespace-nowrap">{name}</span>
                </span>
              ))}
            </span>
          </span>
          <span className={`w-2 h-2 bg-gray-900 rotate-45 -mt-1${align === 'right' ? ' mr-2' : ''}`} />
        </span>,
        document.body
      )
    : null;

  return (
    <span
      ref={ref}
      className="relative"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen((v) => !v);
      }}
    >
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-blue-50 border border-blue-200 text-procare-bright-blue cursor-default">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      </span>
      {tooltip}
    </span>
  );
}
