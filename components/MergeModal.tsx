'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface MergeItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchResult {
  id: number;
  name: string;
  subtitle: string | null;
}

interface MergeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onMerge: (masterId: number, duplicateIds: number[]) => Promise<void>;
  items: MergeItem[];
  title: string;
  description: string;
  searchType: 'company' | 'attendee';
}

export function MergeModal({
  isOpen,
  onClose,
  onMerge,
  items,
  title,
  description,
  searchType,
}: MergeModalProps) {
  useHideBottomNav(isOpen);
  const [masterId, setMasterId] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setMasterId(null);
      setSearchQuery('');
      setSearchResults([]);
    }
  }, [isOpen]);

  useEffect(() => {
    if (searchQuery.length < 2) {
      setSearchResults([]);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setIsSearching(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        const itemIds = new Set(items.map((i) => i.id));
        const results: SearchResult[] = searchType === 'company'
          ? (data.companies as SearchResult[]).filter((c) => !itemIds.has(c.id))
          : (data.attendees as SearchResult[]).filter((a) => !itemIds.has(a.id));
        setSearchResults(results);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, items, searchType]);

  if (!isOpen) return null;

  const handleMerge = async () => {
    if (!masterId) return;
    const duplicateIds = items.map((i) => i.id).filter((id) => id !== masterId);
    setIsLoading(true);
    try {
      await onMerge(masterId, duplicateIds);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  const searchLabel = searchType === 'company' ? 'or search all companies' : 'or search all attendees';
  const searchPlaceholder = searchType === 'company' ? 'Search by company name...' : 'Search by attendee name...';
  const noResultsLabel = searchType === 'company' ? 'No companies found' : 'No attendees found';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-white rounded-xl shadow-2xl border border-brand-highlight max-w-md w-full mx-4 flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-brand-primary font-serif">{title}</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm text-gray-600 mb-5">{description}</p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-3 mb-4">
            <p className="text-sm font-medium text-gray-700">Select the master record to keep:</p>
            {items.map((item) => (
              <label
                key={item.id}
                className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                  masterId === item.id
                    ? 'border-brand-secondary bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <input
                  type="radio"
                  name="master"
                  value={item.id}
                  checked={masterId === item.id}
                  onChange={() => setMasterId(item.id)}
                  className="mt-0.5 accent-brand-secondary"
                />
                <div>
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-gray-500">{item.sublabel}</p>
                  )}
                </div>
              </label>
            ))}
          </div>

          {/* Global search */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">{searchLabel}</span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              {isSearching && (
                <svg className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-secondary animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              )}
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (masterId && !items.find((i) => i.id === masterId)) {
                    setMasterId(null);
                  }
                }}
                placeholder={searchPlaceholder}
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary bg-white"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 mt-2">
                {searchResults.map((result) => (
                  <label
                    key={result.id}
                    className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-all ${
                      masterId === result.id
                        ? 'border-brand-secondary bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="radio"
                      name="master"
                      value={result.id}
                      checked={masterId === result.id}
                      onChange={() => setMasterId(result.id)}
                      className="mt-0.5 accent-brand-secondary"
                    />
                    <div>
                      <p className="text-sm font-medium text-gray-800">{result.name}</p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-500">{result.subtitle}</p>
                      )}
                    </div>
                  </label>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="text-sm text-gray-400 mt-2 text-center py-2">{noResultsLabel}</p>
            )}
          </div>

          {masterId && (
            <div className="mb-5 p-3 bg-yellow-50 rounded-lg border border-yellow-200">
              <p className="text-xs text-yellow-800">
                <strong>Warning:</strong> The non-selected records will be deleted. All associated data (conferences, attendees) will be moved to the master record.
              </p>
            </div>
          )}
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleMerge}
              disabled={!masterId || isLoading}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Merging...' : 'Merge Records'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
