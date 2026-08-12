'use client';

import { useEffect, useRef, useState } from 'react';

export interface AdditionalAttendeeCandidate {
  key: string;
  name: string;
  sub: string;
}

interface AdditionalAttendeesSelectProps {
  candidates: AdditionalAttendeeCandidate[];
  selected: string[];
  onChange: (names: string[]) => void;
  inputClassName?: string;
  placeholder?: string;
}

// Searchable multi-select for the "Additional Attendees" field — matches
// candidates (conference attendees by name/company, plus config_options'
// 'user' category) against the typed query, and stores plain display names
// (comma-joined on submit) to stay compatible with meetings.additional_attendees'
// existing free-text format, which MeetingNotetaker already reads as a
// comma-separated name list.
export function AdditionalAttendeesSelect({
  candidates,
  selected,
  onChange,
  inputClassName = '',
  placeholder = 'Search attendees, companies, or users…',
}: AdditionalAttendeesSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch('');
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selectedSet = new Set(selected);
  const q = search.trim().toLowerCase();
  const filtered = candidates
    .filter(c => !selectedSet.has(c.name))
    .filter(c => !q || c.name.toLowerCase().includes(q) || c.sub.toLowerCase().includes(q))
    .slice(0, 50);

  const addName = (name: string) => {
    if (!selectedSet.has(name)) onChange([...selected, name]);
    setSearch('');
    inputRef.current?.focus();
  };

  const removeName = (name: string) => {
    onChange(selected.filter(n => n !== name));
  };

  return (
    <div className="relative" ref={containerRef}>
      <div
        className={`${inputClassName} flex flex-wrap items-center gap-1 min-h-[38px] h-auto cursor-text`}
        onClick={() => { setOpen(true); inputRef.current?.focus(); }}
      >
        {selected.map(name => (
          <span
            key={name}
            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] font-medium bg-blue-50 text-blue-700 border border-blue-200 whitespace-nowrap"
          >
            {name}
            <button
              type="button"
              onClick={e => { e.stopPropagation(); removeName(name); }}
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

      {open && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
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
                onClick={() => addName(c.name)}
              >
                <span className="truncate">{c.name}</span>
                {c.sub && <span className="text-xs text-gray-400 flex-shrink-0 truncate max-w-[40%]">{c.sub}</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
