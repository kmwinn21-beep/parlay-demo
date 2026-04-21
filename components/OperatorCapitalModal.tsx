'use client';

import { useState, useEffect, useRef } from 'react';
import { useHideBottomNav } from './BottomNavContext';

interface OperatorCapitalItem {
  id: number;
  label: string;
  sublabel?: string;
}

interface SearchResult {
  id: number;
  name: string;
  subtitle: string | null;
}

interface OperatorCapitalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (companyIds: number[]) => Promise<void>;
  items: OperatorCapitalItem[];
}

export function OperatorCapitalModal({
  isOpen,
  onClose,
  onSubmit,
  items,
}: OperatorCapitalModalProps) {
  useHideBottomNav(isOpen);
  const [isLoading, setIsLoading] = useState(false);
  const [additionalItems, setAdditionalItems] = useState<SearchResult[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setAdditionalItems([]);
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
        const existingIds = new Set([...items.map((i) => i.id), ...additionalItems.map((i) => i.id)]);
        const filtered = (data.companies as SearchResult[]).filter((c) => !existingIds.has(c.id));
        setSearchResults(filtered);
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [searchQuery, items, additionalItems]);

  if (!isOpen) return null;

  const totalCount = items.length + additionalItems.length;
  const pairCount = (totalCount * (totalCount - 1)) / 2;

  const handleAddCompany = (result: SearchResult) => {
    setAdditionalItems((prev) => [...prev, result]);
    setSearchQuery('');
    setSearchResults([]);
  };

  const handleRemoveAdditional = (id: number) => {
    setAdditionalItems((prev) => prev.filter((i) => i.id !== id));
  };

  const handleSubmit = async () => {
    setIsLoading(true);
    try {
      const allIds = [...items.map((i) => i.id), ...additionalItems.map((i) => i.id)];
      await onSubmit(allIds);
      onClose();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative bg-white rounded-xl shadow-2xl border border-brand-highlight max-w-md w-full mx-4 flex flex-col max-h-[90vh]">
        {/* Fixed header */}
        <div className="flex-shrink-0 p-6 pb-0">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-brand-primary font-serif">Create Operator / Capital Relationships</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <p className="text-sm text-gray-600 mb-5">
            This will create operator/capital relationships between all {totalCount} selected companies ({pairCount} relationship{pairCount !== 1 ? 's' : ''}). Each company will appear as a related company on the others&apos; detail pages.
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto px-6 min-h-0">
          <div className="space-y-2 mb-4">
            <p className="text-sm font-medium text-gray-700">Companies to be linked:</p>
            {items.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-gray-200 bg-gray-50"
              >
                <svg className="w-4 h-4 mt-0.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{item.label}</p>
                  {item.sublabel && (
                    <p className="text-xs text-gray-500">{item.sublabel}</p>
                  )}
                </div>
              </div>
            ))}
            {additionalItems.map((item) => (
              <div
                key={item.id}
                className="flex items-start gap-3 p-3 rounded-lg border border-brand-secondary bg-blue-50"
              >
                <svg className="w-4 h-4 mt-0.5 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800">{item.name}</p>
                  {item.subtitle && (
                    <p className="text-xs text-gray-500">{item.subtitle}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => handleRemoveAdditional(item.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          {/* Global company search */}
          <div className="mb-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400 font-medium whitespace-nowrap">or search all companies</span>
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by company name..."
                className="w-full pl-9 pr-9 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-secondary bg-white"
              />
            </div>

            {searchResults.length > 0 && (
              <div className="space-y-2 mt-2">
                {searchResults.map((result) => (
                  <button
                    key={result.id}
                    type="button"
                    onClick={() => handleAddCompany(result)}
                    className="w-full flex items-start gap-3 p-3 rounded-lg border-2 border-gray-200 hover:border-brand-secondary hover:bg-blue-50 cursor-pointer transition-all text-left"
                  >
                    <svg className="w-4 h-4 mt-0.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-gray-800">{result.name}</p>
                      {result.subtitle && (
                        <p className="text-xs text-gray-500">{result.subtitle}</p>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {searchQuery.length >= 2 && !isSearching && searchResults.length === 0 && (
              <p className="text-sm text-gray-400 mt-2 text-center py-2">No companies found</p>
            )}
          </div>

          <div className="mb-5 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-800">
              <strong>Note:</strong> Operator/Capital relationships are bidirectional. Each company will see the others listed in its &quot;Operator / Capital Relationships&quot; section. Duplicate relationships are automatically ignored.
            </p>
          </div>
        </div>

        {/* Fixed footer */}
        <div className="flex-shrink-0 p-6 pt-4">
          <div className="flex gap-3">
            <button onClick={onClose} className="btn-secondary flex-1" disabled={isLoading}>
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={isLoading || totalCount < 2}
              className="btn-primary flex-1 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating...' : `Create ${pairCount} Relationship${pairCount !== 1 ? 's' : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
