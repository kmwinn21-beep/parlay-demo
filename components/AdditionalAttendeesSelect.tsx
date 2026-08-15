'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export interface AdditionalAttendeeCandidate {
  key: string;
  name: string;
  sub: string;
  /** 'user' candidates (from the config_options 'user' category) are internal
   * team members — the caller routes these into scheduled_by so
   * MeetingNotetaker shows them as Internal Attendees instead of External. */
  source: 'attendee' | 'user';
  id: number;
}

export interface AdditionalAttendeeSelection {
  key: string;
  name: string;
}

interface AdditionalAttendeesSelectProps {
  candidates: AdditionalAttendeeCandidate[];
  selected: AdditionalAttendeeSelection[];
  onAdd: (candidate: AdditionalAttendeeCandidate) => void;
  onRemove: (selection: AdditionalAttendeeSelection) => void;
  inputClassName?: string;
  placeholder?: string;
}

// Searchable multi-select for the "Additional Attendees" field — matches
// candidates (conference attendees by name/company, plus config_options'
// 'user' category) against the typed query. The caller decides where each
// pick is stored (attendee picks go to meetings.additional_attendees'
// free-text name list; user picks go to scheduled_by) so MeetingNotetaker's
// existing internal/external split classifies them correctly.
export function AdditionalAttendeesSelect({
  candidates,
  selected,
  onAdd,
  onRemove,
  inputClassName = '',
  placeholder = 'Search attendees, companies, or users…',
}: AdditionalAttendeesSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu renders in a portal so a short table row or a scrolling modal
  // body can't clip it; that means positioning it against the field's
  // viewport rect by hand.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Drop below the field, or flip above it when the space below is tighter.
  const positionMenu = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < 180 && above > below;
    const maxHeight = Math.max(120, Math.min(224, flip ? above : below));
    setMenuPos({
      top: flip ? r.top - 4 - maxHeight : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight,
    });
  }, []);

  useEffect(() => {
    if (!open) { setMenuPos(null); return; }
    positionMenu();
    const onScroll = () => positionMenu();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onScroll);
    };
  }, [open, positionMenu, selected.length]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (containerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
      setSearch('');
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedNames = new Set(selected.map(s => s.name));
  const q = search.trim().toLowerCase();
  const filtered = candidates
    .filter(c => !selectedNames.has(c.name))
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
    .slice(0, 50);

  const handleAdd = (candidate: AdditionalAttendeeCandidate) => {
    onAdd(candidate);
    setSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`${inputClassName} flex flex-wrap items-center gap-1 min-h-[38px] h-auto cursor-text`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selected.map(s => (
          <span
            key={s.key}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap"
          >
            {s.name}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); onRemove(s); }}
              className="hover:text-red-500 leading-none"
            >
              <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          type="text"
          className="flex-1 min-w-[120px] border-none outline-none text-sm bg-transparent"
          placeholder={selected.length === 0 ? placeholder : 'Add another…'}
          value={search}
          onChange={e => { setSearch(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      </div>

      {open && mounted && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
          className="z-[10000] bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">
              {q ? 'No matches' : 'Type to search attendees or users'}
            </p>
          ) : (
            filtered.map(c => (
              <button
                key={c.key}
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 text-gray-800 flex items-center justify-between gap-2"
                onClick={() => handleAdd(c)}
              >
                <span className="truncate">{c.name}</span>
                {c.sub && <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[40%]">{c.sub}</span>}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  );
}
