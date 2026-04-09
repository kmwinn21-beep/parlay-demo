'use client';

import { useState, useRef, useEffect } from 'react';
import { type UserOption, getRepInitials } from '@/lib/useUserOptions';

interface RepMultiSelectProps {
  options: UserOption[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
  /** Called when the dropdown closes — useful for triggering a save */
  onClose?: (ids: number[]) => void;
  triggerClass?: string;
  placeholder?: string;
}

export function RepMultiSelect({
  options,
  selectedIds,
  onChange,
  onClose,
  triggerClass = 'w-full border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-procare-bright-blue bg-white text-left flex items-center justify-between gap-1',
  placeholder = 'Select reps...',
}: RepMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // snapshot the IDs when the dropdown opens so we can detect changes on close
  const openIdsRef = useRef<number[]>([]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (open) {
          setOpen(false);
          onClose?.(selectedIds);
        }
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, selectedIds]);

  const handleOpen = () => {
    if (!open) openIdsRef.current = [...selectedIds];
    setOpen(o => !o);
  };

  const toggle = (id: number) => {
    onChange(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id]);
  };

  const clear = () => {
    onChange([]);
  };

  const selectedUsers = options.filter(u => selectedIds.includes(u.id));

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={handleOpen} className={triggerClass}>
        <span className={selectedUsers.length === 0 ? 'text-gray-400 truncate' : 'text-gray-800 truncate'}>
          {selectedUsers.length === 0
            ? placeholder
            : selectedUsers.map(u => getRepInitials(u.value)).join(', ')}
        </span>
        <svg
          className={`w-3 h-3 text-gray-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute z-30 w-full min-w-[160px] mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400">No users configured</div>
          ) : (
            <>
              <button
                type="button"
                onClick={clear}
                className="w-full text-left px-3 py-1.5 text-xs text-gray-400 hover:bg-gray-50 border-b border-gray-100"
              >
                — Clear —
              </button>
              {options.map(u => (
                <label key={u.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer text-xs">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(u.id)}
                    onChange={() => toggle(u.id)}
                    className="accent-procare-bright-blue flex-shrink-0"
                  />
                  <span>{u.value}</span>
                </label>
              ))}
            </>
          )}
        </div>
      )}

      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200"
            >
              {getRepInitials(u.value)}
              <button
                type="button"
                onClick={() => toggle(u.id)}
                className="hover:text-red-500 leading-none"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
