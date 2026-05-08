'use client';

import { useEffect, useRef, useState } from 'react';

export interface CompanyOption {
  id: number;
  name: string;
  company_type?: string | null;
}

interface GroupedCompanyDropdownProps {
  companies: CompanyOption[];
  value: number | null;
  onChange: (id: number, name: string) => void;
  onClear?: () => void;
  placeholder?: string;
  disabled?: boolean;
  inputClassName?: string;
}

// Module-level cache: primary company type value
let _primaryTypeCache: string | null | undefined = undefined; // undefined = not yet fetched
let _primaryTypeFetch: Promise<string | null> | null = null;

async function fetchPrimaryType(): Promise<string | null> {
  if (_primaryTypeFetch) return _primaryTypeFetch;
  _primaryTypeFetch = fetch('/api/config?category=company_type')
    .then(r => r.json())
    .then((opts: { value: string; is_primary?: number }[]) => {
      const primary = opts.find(o => o.is_primary === 1);
      _primaryTypeCache = primary?.value ?? null;
      return _primaryTypeCache;
    })
    .catch(() => null);
  return _primaryTypeFetch;
}

function groupAndSort(companies: CompanyOption[], primaryType: string | null) {
  const groups = new Map<string, CompanyOption[]>();

  for (const c of companies) {
    const key = c.company_type?.trim() || '';
    (groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(c);
  }

  // Sort companies within each group
  groups.forEach(list => list.sort((a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name)));

  // Build ordered group list: primary first, then alphabetical, '' (no type) last
  const keys = Array.from(groups.keys());
  keys.sort((a, b) => {
    if (a === b) return 0;
    if (primaryType && a === primaryType) return -1;
    if (primaryType && b === primaryType) return 1;
    if (a === '') return 1;
    if (b === '') return -1;
    return a.localeCompare(b);
  });

  return keys.map(key => ({ label: key || 'No Type', key, companies: groups.get(key)! }));
}

export function GroupedCompanyDropdown({
  companies,
  value,
  onChange,
  onClear,
  placeholder = 'Search companies…',
  disabled = false,
  inputClassName = '',
}: GroupedCompanyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [primaryType, setPrimaryType] = useState<string | null>(
    _primaryTypeCache !== undefined ? _primaryTypeCache : null
  );
  const containerRef = useRef<HTMLDivElement>(null);

  // Fetch primary type once
  useEffect(() => {
    if (_primaryTypeCache !== undefined) {
      setPrimaryType(_primaryTypeCache);
      return;
    }
    fetchPrimaryType().then(setPrimaryType);
  }, []);

  // Close on outside click
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

  const selectedName = value != null ? (companies.find(c => c.id === value)?.name ?? '') : '';

  // Filter then group
  const filtered = search.trim()
    ? companies.filter(c => c.name.toLowerCase().includes(search.toLowerCase()))
    : companies;

  const groups = groupAndSort(filtered, primaryType);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative">
        <input
          type="text"
          className={inputClassName || 'input-field w-full text-sm'}
          placeholder={placeholder}
          disabled={disabled}
          value={value != null ? selectedName : search}
          onChange={e => {
            if (value != null && onClear) onClear();
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => { if (!disabled) setOpen(true); }}
          readOnly={value != null}
          onClick={() => { if (value != null && !disabled) { if (onClear) onClear(); setOpen(true); } }}
        />
        {value != null && (
          <button
            type="button"
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
            onClick={e => { e.stopPropagation(); if (onClear) onClear(); setSearch(''); setOpen(false); }}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>

      {open && !disabled && (
        <div className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-y-auto">
          {/* Search box inside panel when a value is not selected */}
          {value == null && (
            <div className="sticky top-0 bg-white border-b border-gray-100 px-2 py-1.5">
              <input
                autoFocus
                type="text"
                className="w-full text-sm px-2 py-1 rounded border border-gray-200 focus:outline-none focus:ring-1 focus:ring-brand-secondary"
                placeholder="Search…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          )}

          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">No companies found</p>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-100 sticky top-0">
                  {primaryType && group.key === primaryType && (
                    <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {group.label}
                  </span>
                  <span className="text-xs text-gray-400">({group.companies.length})</span>
                </div>
                {group.companies.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                      value === c.id ? 'bg-blue-50 text-brand-secondary font-medium' : 'hover:bg-blue-50 text-gray-800'
                    }`}
                    onClick={() => {
                      onChange(c.id, c.name);
                      setOpen(false);
                      setSearch('');
                    }}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
