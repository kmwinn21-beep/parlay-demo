'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  /** Adds an "Other (not in list)" entry at the top of the menu when provided. */
  onSelectOther?: () => void;
  otherLabel?: string;
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

// Module-level cache: the company types that define an ICP company, from the
// ICP Parameters rule in Admin > ICP. These groups sort above everything else.
let _icpTypesCache: string[] | undefined = undefined;
let _icpTypesFetch: Promise<string[]> | null = null;

async function fetchIcpTypes(): Promise<string[]> {
  if (_icpTypesFetch) return _icpTypesFetch;
  _icpTypesFetch = fetch('/api/admin/icp-rules', { cache: 'no-store' })
    .then(r => (r.ok ? r.json() : null))
    .then((data: { rules?: { category: string; conditions: { option_value: string }[] }[] } | null) => {
      const rule = data?.rules?.find(x => x.category === 'company_type');
      _icpTypesCache = rule ? rule.conditions.map(c => c.option_value).filter(Boolean) : [];
      return _icpTypesCache;
    })
    .catch(() => []);
  return _icpTypesFetch;
}

function groupAndSort(companies: CompanyOption[], primaryType: string | null, icpTypes: string[]) {
  const groups = new Map<string, CompanyOption[]>();

  for (const c of companies) {
    const key = c.company_type?.trim() || '';
    (groups.get(key) ?? (groups.set(key, []), groups.get(key)!)).push(c);
  }

  // Sort companies within each group
  groups.forEach(list => list.sort((a: CompanyOption, b: CompanyOption) => a.name.localeCompare(b.name)));

  // ICP types lead, in the order Admin lists them; everything else follows
  // alphabetically, with untyped companies last. The primary type leads the
  // ICP block (or the whole list when it isn't an ICP type).
  const icpRank = new Map(icpTypes.map((t, i) => [t, i]));
  const rank = (key: string): number => {
    if (key === '') return 3;
    if (primaryType && key === primaryType) return 0;
    if (icpRank.has(key)) return 1;
    return 2;
  };

  const keys = Array.from(groups.keys());
  keys.sort((a, b) => {
    const ra = rank(a), rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 1) return (icpRank.get(a) ?? 0) - (icpRank.get(b) ?? 0);
    return a.localeCompare(b);
  });

  return keys.map(key => ({
    label: key || 'No Type',
    key,
    isIcp: key !== '' && icpRank.has(key),
    companies: groups.get(key)!,
  }));
}

export function GroupedCompanyDropdown({
  companies,
  value,
  onChange,
  onClear,
  placeholder = 'Search companies…',
  disabled = false,
  inputClassName = '',
  onSelectOther,
  otherLabel = 'Other (not in list)',
}: GroupedCompanyDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [primaryType, setPrimaryType] = useState<string | null>(
    _primaryTypeCache !== undefined ? _primaryTypeCache : null
  );
  const [icpTypes, setIcpTypes] = useState<string[]>(_icpTypesCache ?? []);
  const containerRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  // The menu renders in a portal so a modal's overflow-y-auto body can't clip
  // it; that means positioning it against the field's viewport rect by hand.
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  // Fetch primary type once
  useEffect(() => {
    if (_primaryTypeCache !== undefined) {
      setPrimaryType(_primaryTypeCache);
      return;
    }
    fetchPrimaryType().then(setPrimaryType);
  }, []);

  useEffect(() => {
    if (_icpTypesCache !== undefined) { setIcpTypes(_icpTypesCache); return; }
    fetchIcpTypes().then(setIcpTypes);
  }, []);

  // Drop below the field, or flip above it when the space below is tighter.
  const positionMenu = useCallback(() => {
    const el = fieldRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom - 8;
    const above = r.top - 8;
    const flip = below < 200 && above > below;
    setMenuPos({
      top: flip ? 0 : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight: Math.max(140, Math.min(288, flip ? above : below)),
    });
    if (flip) {
      // Anchor the flipped menu by its bottom edge instead.
      setMenuPos({ top: r.top - 4 - Math.max(140, Math.min(288, above)), left: r.left, width: r.width, maxHeight: Math.max(140, Math.min(288, above)) });
    }
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
  }, [open, positionMenu]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inField = containerRef.current?.contains(t);
      const inMenu = menuRef.current?.contains(t);
      if (!inField && !inMenu) {
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

  const groups = groupAndSort(filtered, primaryType, icpTypes);

  return (
    <div className="relative" ref={containerRef}>
      <div className="relative" ref={fieldRef}>
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

      {open && !disabled && mounted && menuPos && createPortal(
        <div
          ref={menuRef}
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, width: menuPos.width, maxHeight: menuPos.maxHeight }}
          // Above app modals (z-[200]) — the menu portals to the body, so a
          // lower value leaves it stranded behind whatever opened it.
          className="z-[10000] bg-white border border-gray-200 rounded-lg shadow-lg overflow-y-auto"
        >
          {/* Search box inside panel when a value is not selected */}
          {value == null && (
            <div className="sticky top-0 bg-white border-b border-gray-100 px-2 py-1.5 z-10">
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

          {onSelectOther && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-gray-600 hover:bg-gray-50 border-b border-gray-100 font-medium"
              onClick={() => { onSelectOther(); setOpen(false); setSearch(''); }}
            >
              {otherLabel}
            </button>
          )}

          {groups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-3">No companies found</p>
          ) : (
            groups.map(group => (
              <div key={group.key}>
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border-b border-gray-100">
                  {primaryType && group.key === primaryType && (
                    <svg className="w-3 h-3 text-amber-500 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                    </svg>
                  )}
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    {group.label}
                  </span>
                  <span className="text-xs text-gray-400">({group.companies.length})</span>
                  {group.isIcp && group.key !== primaryType && (
                    <span className="ml-auto text-[9px] font-semibold text-brand-secondary uppercase tracking-wide">ICP</span>
                  )}
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
        </div>,
        document.body,
      )}
    </div>
  );
}
