'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getPreset } from '@/lib/colors';
import { TouchpointMap } from './TouchpointMap';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
}

interface TouchpointOption {
  id: number;
  value: string;
  color: string | null;
  sort_order: number;
  auto_follow_up: number;
}

interface Props {
  attendeeId: number;
  conferences: Conference[];
  sectionLabel?: string;
}

export function TouchpointsSection({ attendeeId, conferences, sectionLabel = 'Touchpoints' }: Props) {
  const [options, setOptions] = useState<TouchpointOption[]>([]);
  const [counts, setCounts] = useState<Record<number, number>>({});
  const [totalCount, setTotalCount] = useState(0);
  const [selectedConf, setSelectedConf] = useState<Conference | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [loadingOpts, setLoadingOpts] = useState(false);
  const [loadingCounts, setLoadingCounts] = useState(false);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [hoverOptId, setHoverOptId] = useState<number | null>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const mapBtnRef = useRef<HTMLButtonElement>(null);

  const today = new Date().toISOString().slice(0, 10);

  // Sort conferences: in-progress first, then descending by start_date
  const sortedConferences = [...conferences].sort((a, b) => {
    const aActive = a.start_date <= today && a.end_date >= today;
    const bActive = b.start_date <= today && b.end_date >= today;
    if (aActive && !bActive) return -1;
    if (!aActive && bActive) return 1;
    return b.start_date.localeCompare(a.start_date);
  });

  useEffect(() => {
    setLoadingOpts(true);
    fetch('/api/config?category=touchpoints')
      .then(r => r.json())
      .then((data: TouchpointOption[]) => setOptions(data.sort((a, b) => a.sort_order - b.sort_order)))
      .catch(() => {})
      .finally(() => setLoadingOpts(false));
  }, []);

  // Default to first conference in sorted list (in-progress first)
  useEffect(() => {
    if (selectedConf || sortedConferences.length === 0) return;
    setSelectedConf(sortedConferences[0]);
  }, [conferences]); // eslint-disable-line react-hooks/exhaustive-deps

  const fetchTotalCount = useCallback(() => {
    fetch(`/api/attendees/${attendeeId}/touchpoints`)
      .then(r => r.json())
      .then((d: { total: number }) => setTotalCount(d.total ?? 0))
      .catch(() => {});
  }, [attendeeId]);

  const fetchCounts = useCallback((confId: number) => {
    setLoadingCounts(true);
    fetch(`/api/attendees/${attendeeId}/touchpoints?conference_id=${confId}`)
      .then(r => r.json())
      .then((data: { counts: Record<number, number> }) => setCounts(data.counts ?? {}))
      .catch(() => {})
      .finally(() => setLoadingCounts(false));
  }, [attendeeId]);

  useEffect(() => {
    if (selectedConf) fetchCounts(selectedConf.id);
    else setCounts({});
  }, [selectedConf, fetchCounts]);

  useEffect(() => { fetchTotalCount(); }, [fetchTotalCount]);

  // Close picker on outside click
  useEffect(() => {
    if (!showPicker) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setShowPicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showPicker]);

  const handleAdd = async (opt: TouchpointOption) => {
    if (!selectedConf || pendingId !== null) return;
    setPendingId(opt.id);
    try {
      const res = await fetch(`/api/attendees/${attendeeId}/touchpoints`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conference_id: selectedConf.id, option_id: opt.id }),
      });
      if (res.ok) {
        setCounts(prev => ({ ...prev, [opt.id]: (prev[opt.id] ?? 0) + 1 }));
        setTotalCount(prev => prev + 1);
      }
    } catch { /* silent */ }
    finally { setPendingId(null); }
  };

  const handleRemove = async (opt: TouchpointOption) => {
    if (!selectedConf || pendingId !== null) return;
    if ((counts[opt.id] ?? 0) === 0) return;
    setPendingId(opt.id);
    try {
      const res = await fetch(`/api/attendees/${attendeeId}/touchpoints`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conference_id: selectedConf.id, option_id: opt.id }),
      });
      if (res.ok) {
        setCounts(prev => ({ ...prev, [opt.id]: Math.max(0, (prev[opt.id] ?? 0) - 1) }));
        setTotalCount(prev => Math.max(0, prev - 1));
      }
    } catch { /* silent */ }
    finally { setPendingId(null); }
  };

  const formatDate = (d: string) => {
    const [y, m, day] = d.split('-');
    return `${parseInt(m)}/${parseInt(day)}/${y.slice(2)}`;
  };

  const selectedIsActive = selectedConf ? selectedConf.start_date <= today && selectedConf.end_date >= today : false;

  return (
    <div className="card">
      {/* Header row */}
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold text-brand-primary font-serif">{sectionLabel}</h2>
        <div className="relative">
          <button
            ref={mapBtnRef}
            type="button"
            onClick={() => setShowMap(prev => !prev)}
            className="w-7 h-7 rounded-full border-2 border-brand-secondary bg-white flex items-center justify-center hover:bg-brand-secondary/10 transition-colors"
            title="View touchpoint map"
          >
            <span className="text-xs font-bold text-brand-secondary leading-none">{totalCount}</span>
          </button>
          <TouchpointMap
            attendeeId={attendeeId}
            open={showMap}
            onClose={() => setShowMap(false)}
            anchorRef={mapBtnRef as React.RefObject<HTMLElement>}
          />
        </div>
      </div>

      {/* Conference selector */}
      <div className="relative mb-4" ref={pickerRef}>
        <button
          type="button"
          onClick={() => setShowPicker(prev => !prev)}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:border-brand-secondary transition-colors text-sm"
          disabled={conferences.length === 0}
        >
          {selectedIsActive && (
            <span className="w-2 h-2 rounded-full bg-brand-secondary flex-shrink-0 animate-pulse" />
          )}
          <span className="flex-1 truncate text-left">
            {selectedConf ? selectedConf.name : conferences.length === 0 ? 'No conferences' : 'Select conference...'}
          </span>
          <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${showPicker ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {showPicker && (
          <div className="absolute z-30 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto divide-y divide-gray-50">
            {sortedConferences.map(conf => {
              const isActive = conf.start_date <= today && conf.end_date >= today;
              return (
                <button
                  key={conf.id}
                  type="button"
                  onClick={() => { setSelectedConf(conf); setShowPicker(false); }}
                  className={`w-full text-left px-3 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center gap-2 ${selectedConf?.id === conf.id ? 'bg-blue-50' : ''}`}
                >
                  {isActive ? (
                    <span className="w-2.5 h-2.5 rounded-full bg-brand-secondary flex-shrink-0 animate-pulse" />
                  ) : (
                    <span className="w-2.5 h-2.5 flex-shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="font-medium text-gray-800 truncate">{conf.name}</div>
                    <div className="text-xs text-gray-400">{formatDate(conf.start_date)}</div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Option buttons */}
      {loadingOpts || loadingCounts ? (
        <div className="flex justify-center py-4">
          <svg className="w-5 h-5 animate-spin text-brand-secondary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
        </div>
      ) : !selectedConf ? (
        <p className="text-xs text-gray-400 text-center py-3">Select a conference to log touchpoints.</p>
      ) : options.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-3">No touchpoint types configured.</p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {options.map(opt => {
            const count = counts[opt.id] ?? 0;
            const isActive = count > 0;
            const preset = getPreset(opt.color);
            const isPending = pendingId === opt.id;
            const isHovered = hoverOptId === opt.id;

            return (
              <div
                key={opt.id}
                className="relative"
                onMouseEnter={() => setHoverOptId(opt.id)}
                onMouseLeave={() => setHoverOptId(null)}
              >
                <button
                  type="button"
                  onClick={() => handleAdd(opt)}
                  disabled={isPending || !selectedConf}
                  className={`w-full rounded-lg border-2 transition-all text-xs font-medium py-2
                    ${isActive ? 'text-left pl-3 pr-8' : 'text-center px-2'}
                    ${isPending ? 'opacity-50 cursor-wait' : ''}
                  `}
                  style={isActive ? {
                    borderColor: preset.hex,
                    backgroundColor: `${preset.hex}18`,
                    color: preset.hex,
                  } : {
                    borderColor: '#e5e7eb',
                    backgroundColor: '#ffffff',
                    color: '#6b7280',
                  }}
                >
                  <span className="truncate block">{opt.value}</span>
                  {isActive && (
                    <span
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold min-w-[1.25rem] text-center"
                      style={{ color: preset.hex }}
                    >
                      {count}
                    </span>
                  )}
                </button>

                {/* Minus / undo on hover */}
                {isActive && isHovered && !isPending && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); handleRemove(opt); }}
                    className="absolute -top-1.5 -left-1.5 w-4 h-4 rounded-full bg-white border border-gray-300 flex items-center justify-center hover:border-red-400 hover:text-red-500 transition-colors text-gray-400 shadow-sm z-10"
                    title="Remove last"
                  >
                    <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M20 12H4" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
