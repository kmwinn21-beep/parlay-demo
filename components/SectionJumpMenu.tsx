'use client';

import { useEffect, useRef, useState } from 'react';
import { setAllSections, useAnySectionExpanded } from '@/lib/sectionExpansion';

interface Target { key: string; label: string }

/**
 * Phone-only shortcut to any section on a long detail page.
 *
 * The list is read off the page when the menu opens rather than declared here:
 * a section that rendered nothing, or one hidden in Section Management, simply
 * isn't in the DOM and so can't be offered. Labels come from each section's own
 * heading, so a renamed section reads the same here as it does on the page.
 */
export function SectionJumpMenu({ className = '', align = 'below' }: {
  className?: string;
  /** Where the list unfurls relative to the button. */
  align?: 'below' | 'above';
}) {
  const [open, setOpen] = useState(false);
  const [targets, setTargets] = useState<Target[]>([]);
  /**
   * Which edge of the button the list hangs from.
   *
   * It used to always hang from the right, which was right while the button
   * sat at the end of its row. Then Back went and the button moved into the
   * first slot, and a 224px list hanging leftwards from a button 36px in ran
   * off the side of the phone. So it is measured: the list hangs from the
   * left and opens rightwards wherever there is room for it to, and keeps the
   * old behaviour where there is not.
   */
  const [anchor, setAnchor] = useState<'left' | 'right'>('right');
  const anyExpanded = useAnySectionExpanded();
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
      // The count belongs on the section, not in a list of destinations.
      const label = heading?.textContent?.trim().replace(/\s*\((?:\d[^)]*|[^)]*pending)\)\s*$/i, '').trim();
      if (!label) return;
      found.push({ key, label });
    });
    setTargets(found);
  };

  /** w-56, which the list is wide unless the screen is narrower than that. */
  const MENU_WIDTH = 224;
  /** Clearance from the edge of the screen, matching the max-width below. */
  const EDGE = 8;

  const openMenu = () => {
    collect();
    const r = ref.current?.getBoundingClientRect();
    if (r) setAnchor(r.left + MENU_WIDTH <= window.innerWidth - EDGE ? 'left' : 'right');
    setOpen(true);
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
        onClick={() => { if (open) setOpen(false); else openMenu(); }}
        aria-label="Jump to a section"
        aria-expanded={open}
        className="flex items-center gap-1 text-sm text-gray-500 hover:text-brand-primary transition-colors"
      >
        Jump To
        {/* Up/down rather than a single chevron: the list opens over content
            either side of the button depending on where the page has scrolled. */}
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4M8 15l4 4 4-4" />
        </svg>
      </button>

      {/* max-w, so a screen narrower than the list shrinks it rather than
          letting an edge hang off either side. */}
      {open && (
        <div className={`absolute z-40 w-56 max-w-[calc(100vw-1rem)] max-h-72 overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg py-1 ${
          anchor === 'left' ? 'left-0' : 'right-0'
        } ${align === 'above' ? 'bottom-full mb-1' : 'top-full mt-1'}`}>
          <p className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">Jump to</p>
          {targets.length === 0 ? (
            <p className="px-3 py-2 text-sm text-gray-400">No sections on this page.</p>
          ) : targets.map(t => (
            <button
              key={t.key}
              type="button"
              onClick={() => jump(t.key)}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 truncate"
            >
              {t.label}
            </button>
          ))}
          {/* Same control the desktop header carries, since a phone has no
              room for it beside Back. */}
          <div className="border-t border-gray-100 mt-1 pt-1">
            <button
              type="button"
              onClick={() => { setAllSections(!anyExpanded); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm font-semibold text-brand-secondary hover:bg-gray-50"
            >
              {anyExpanded ? 'Collapse All' : 'Expand All'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
