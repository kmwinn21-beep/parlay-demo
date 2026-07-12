'use client';

import { useEffect, useRef, useState } from 'react';
import { useGlobalSearch } from '@/lib/useGlobalSearch';
import { GlobalSearchResultsList } from './GlobalSearchResultsList';
import { QuickViewDrawer, type QuickViewTarget } from './QuickViewDrawer';

export function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const { query, setQuery, results, loading, searched } = useGlobalSearch();
  const [quickView, setQuickView] = useState<QuickViewTarget | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <>
      <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[10vh] px-4" onClick={onClose}>
        <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
        <div
          className="relative w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden"
          onClick={e => e.stopPropagation()}
        >
          {/* Input row */}
          <div className="flex items-center gap-3 px-4 py-3.5 border-b border-gray-100">
            <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search attendees, companies, conferences, meetings…"
              className="flex-1 text-sm text-gray-900 placeholder-gray-400 bg-transparent outline-none"
            />
            {loading
              ? <div className="w-4 h-4 border-2 border-brand-secondary border-t-transparent rounded-full animate-spin flex-shrink-0" />
              : query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-gray-300 hover:text-gray-500 transition-colors flex-shrink-0"
                  tabIndex={-1}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )
            }
            <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium text-gray-400 border border-gray-200 select-none">
              ESC
            </kbd>
          </div>

          <GlobalSearchResultsList
            results={results}
            loading={loading}
            searched={searched}
            query={query}
            onClose={onClose}
            onQuickView={setQuickView}
          />
        </div>
      </div>

      {quickView && (
        <QuickViewDrawer target={quickView} onClose={() => setQuickView(null)} />
      )}
    </>
  );
}
