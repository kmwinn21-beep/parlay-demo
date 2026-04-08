'use client';

import { useState, useRef, useEffect } from 'react';

interface AttendeesTooltipProps {
  attendees: string[];
  align?: 'center' | 'right';
}

export default function AttendeesTooltip({ attendees, align = 'center' }: AttendeesTooltipProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('click', handleClickOutside, true);
    return () => document.removeEventListener('click', handleClickOutside, true);
  }, [open]);

  if (attendees.length === 0) return null;

  return (
    <span
      ref={ref}
      className="relative group/tip"
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
      <span
        className={`pointer-events-none absolute bottom-full mb-2 z-20 ${
          open ? 'flex' : 'hidden group-hover/tip:flex'
        } flex-col ${
          align === 'right' ? 'right-0 items-end' : 'left-1/2 -translate-x-1/2 items-center'
        }`}
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
      </span>
    </span>
  );
}
