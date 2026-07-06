'use client';

import { useEffect, useRef, useState } from 'react';

export interface LocationDetails {
  formatted_address: string;
  place_id: string;
  lat: number | null;
  lng: number | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
}

interface Prediction {
  place_id: string;
  description: string;
}

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSelect: (details: LocationDetails) => void;
  placeholder?: string;
  className?: string;
}

function newSessionToken(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2);
}

export function LocationAutocompleteInput({ value, onChange, onSelect, placeholder, className }: Props) {
  const [query, setQuery] = useState(value);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resolving, setResolving] = useState(false);
  const sessionTokenRef = useRef(newSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Keep local query text in sync when the value is changed externally
  // (e.g. form reset, or loading an existing conference into the edit form).
  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setPredictions([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams({ input: query, sessiontoken: sessionTokenRef.current });
        const res = await fetch(`/api/places/autocomplete?${params}`);
        const data = await res.json();
        setPredictions(data.predictions ?? []);
        setOpen(true);
      } catch {
        setPredictions([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  const handleSelect = async (prediction: Prediction) => {
    setOpen(false);
    setResolving(true);
    try {
      const params = new URLSearchParams({ place_id: prediction.place_id, sessiontoken: sessionTokenRef.current });
      const res = await fetch(`/api/places/details?${params}`);
      if (!res.ok) throw new Error('Failed to resolve place');
      const details: LocationDetails = await res.json();
      setQuery(details.formatted_address);
      onChange(details.formatted_address);
      onSelect(details);
    } catch {
      // Fall back to the typed suggestion text as plain free text
      setQuery(prediction.description);
      onChange(prediction.description);
    } finally {
      sessionTokenRef.current = newSessionToken();
      setPredictions([]);
      setResolving(false);
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
        onFocus={() => { if (predictions.length > 0) setOpen(true); }}
        placeholder={placeholder}
        className={className ?? 'input-field'}
        autoComplete="off"
      />
      {(loading || resolving) && (
        <div className="absolute right-3 top-1/2 -translate-y-1/2">
          <span className="animate-spin w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full inline-block" />
        </div>
      )}
      {open && predictions.length > 0 && (
        <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {predictions.map((p) => (
            <button
              key={p.place_id}
              type="button"
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 text-gray-800 flex items-center gap-2"
            >
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a2 2 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span className="truncate">{p.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
