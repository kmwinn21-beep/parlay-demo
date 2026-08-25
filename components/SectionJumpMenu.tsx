'use client';

import { useEffect, useRef, useState } from 'react';

interface Target { key: string; label: string }

/**
 * Phone-only shortcut to any section on a long detail page.
 *
 * The list is read off the page when the menu opens rather than declared here:
 * a section that rendered nothing, or one hidden in Section Management, simply
 * isn't in the DOM and so can't be offered. Labels come from each section's own
 * heading, so a renamed section reads the same here as it does on the page.
 */
export function SectionJumpMenu({ className = '' }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const collect = () => {
    const found: Target[] = [];
    document.querySelectorAll<HTMLElement>('[data-company-section]').forEach(el => {
      const key = el.getAttribute('data-company-section');
      if (!key) return;
      const rect = el.getBoundingClientRect();
      if (rect.height === 0) return;
      const heading = el.querySelector('h2, h3');
      const label = heading?.textContent?.trim();
      if (!label) return;
      found.push({ key, label });
    });
    setTargets(found);
  };

  const jump = (key: string) => {
    setOpen(false);
    const el = document.querySelector<HTMLElement>(`[data-company-section="${CSS.escape(key)}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => { if (!open) collect(); setOpen(o => !o); }}
        aria-label="Jump to a section"
        aria-expanded={open}
        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-secondary hover:bg-gray-100 transition-colors"
      >
        <svg className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 z-40 w-56 max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1">
          <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Jump to</p>
          {targets.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No sections on this page.</p>
          ) : targets.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => jump(t.key)}
              className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 truncate"
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
