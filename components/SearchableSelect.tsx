'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * Type-to-filter picker with an optional "Other (not in list)" escape hatch —
 * shared by the floor-note assign flow and the add-attendee forms so they all
 * behave the same. Portalled, so a scrolling modal body can't clip the menu.
 */
export function SearchableSelect<T extends { id: number }>({
  options, value, onChange, getLabel, placeholder, disabled, onSelectOther,
}: {
  options: T[]; value: T | null; onChange: (v: T | null) => void;
  getLabel: (v: T) => string; placeholder: string; disabled?: boolean;
  /** Adds an "Other (not in list)" entry above the results when provided. */
  onSelectOther?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // Portalled so the Assign Note modal's scrolling body can't clip the list.
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!ref.current?.contains(t) && !menuRef.current?.contains(t)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const position = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < 180 && above > below;
    const maxHeight = Math.max(140, Math.min(240, flip ? above : below));
    setPos({ top: flip ? r.top - 4 - maxHeight : r.bottom + 4, left: r.left, width: r.width, maxHeight });
  }, []);

  useEffect(() => {
    if (!open) { setPos(null); return; }
    position();
    const onScroll = () => position();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, position]);

  const filtered = options.filter(o => getLabel(o).toLowerCase().includes(search.toLowerCase()));

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled}
        onClick={() => { setOpen(v => !v); setSearch(''); }}
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm text-left flex items-center justify-between gap-2 hover:border-brand-secondary transition-colors bg-white disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <span className={value ? 'text-gray-800' : 'text-gray-400'}>{value ? getLabel(value) : placeholder}</span>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {value && (
            <span role="button" onClick={e => { e.stopPropagation(); onChange(null); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </span>
          )}
          <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
        </div>
      </button>
      {open && mounted && pos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          className="z-[100] bg-white border border-gray-200 rounded-lg shadow-xl flex flex-col"
        >
          <div className="p-2 border-b border-gray-100">
            <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…"
              className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-brand-secondary" />
          </div>
          <div className="overflow-y-auto">
            {onSelectOther && (
              <button
                type="button"
                onClick={() => { onSelectOther(); setOpen(false); setSearch(''); }}
                className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
              >
                Other (not in list)
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 px-3 py-2">No results</p>
            ) : filtered.map(o => (
              <button key={o.id} type="button" onClick={() => { onChange(o); setOpen(false); setSearch(''); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 hover:text-brand-secondary transition-colors ${value?.id === o.id ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-700'}`}>
                {getLabel(o)}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

