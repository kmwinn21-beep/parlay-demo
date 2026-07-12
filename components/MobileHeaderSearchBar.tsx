'use client';

import { useEffect, useRef, useState } from 'react';
import { useGlobalSearch } from '@/lib/useGlobalSearch';
import { GlobalSearchResultsList } from './GlobalSearchResultsList';
import { QuickViewDrawer, type QuickViewTarget } from './QuickViewDrawer';

/** Slide-in-from-the-right search bar for the mobile header — covers the icon row it's
 *  layered on top of (the header's logo, positioned outside this component, is untouched). */
export function MobileHeaderSearchBar({ onClose }: { onClose: () => void }) {
  const { query, setQuery, results, loading, searched } = useGlobalSearch();
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const hasQuery = query.trim().length > 0;

  return (
    <>
      <style>{`
        @keyframes headerSearchSlideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
      <div
        className="lg:hidden absolute inset-0 z-20 bg-white flex items-center gap-2 pl-1"
        style={{ animation: 'headerSearchSlideIn 200ms ease-out' }}
      >
        <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search attendees, companies, meetings…"
          className="flex-1 min-w-0 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
        />
        {loading && <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin flex-shrink-0" />}
        <button
          type="button"
          onClick={onClose}
          className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg hover:bg-gray-100 transition-colors text-gray-500"
          aria-label="Close search"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        {hasQuery && (
          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl max-h-[70vh] overflow-hidden">
            <GlobalSearchResultsList
              results={results}
              loading={loading}
              searched={searched}
              query={query}
              onClose={onClose}
              onQuickView={setQuickView}
            />
          </div>
        )}
      </div>

      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}
