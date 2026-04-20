'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface SearchResults {
  attendees: Array<{ id: number; name: string; subtitle: string | null }>;
  companies: Array<{ id: number; name: string; subtitle: string | null }>;
  conferences: Array<{ id: number; name: string; subtitle: string | null }>;
  events: Array<{ id: number; name: string; subtitle: string | null; conference_id: number }>;
}

const EMPTY: SearchResults = { attendees: [], companies: [], conferences: [], events: [] };

function PersonIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
    </svg>
  );
}
function BuildingIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  );
}
function CalendarIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
    </svg>
  );
}
function EventIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-orange-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
    </svg>
  );
}

function ResultRow({ href, icon, iconBg, name, subtitle, onClose }: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  name: string;
  subtitle: string | null;
  onClose: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 transition-colors"
    >
      <div className={`w-7 h-7 rounded-full ${iconBg} flex items-center justify-center flex-shrink-0`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
        {subtitle && <p className="text-xs text-gray-500 truncate">{subtitle}</p>}
      </div>
    </Link>
  );
}

export function GlobalSearchModal({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-focus input
  useEffect(() => { inputRef.current?.focus(); }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  // Debounced search
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY);
      setSearched(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
        if (res.ok) setResults(await res.json());
      } catch {
        // silently ignore
      } finally {
        setLoading(false);
        setSearched(true);
      }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  const totalResults = results.attendees.length + results.companies.length + results.conferences.length + results.events.length;
  const hasResults = totalResults > 0;
  const isShortQuery = query.trim().length < 2;

  return (
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
            placeholder="Search attendees, companies, conferences, events…"
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

        {/* Body */}
        {isShortQuery ? (
          <div className="py-8 text-center text-sm text-gray-400">
            Type at least 2 characters to search
          </div>
        ) : !loading && searched && !hasResults ? (
          <div className="py-8 text-center text-sm text-gray-400">
            No results for &ldquo;{query.trim()}&rdquo;
          </div>
        ) : hasResults ? (
          <div className="max-h-[60vh] overflow-y-auto">
            {results.attendees.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Attendees
                </p>
                {results.attendees.map(r => (
                  <ResultRow
                    key={r.id}
                    href={`/attendees/${r.id}`}
                    icon={<PersonIcon />}
                    iconBg="bg-blue-100"
                    name={r.name}
                    subtitle={r.subtitle}
                    onClose={onClose}
                  />
                ))}
              </section>
            )}
            {results.companies.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Companies
                </p>
                {results.companies.map(r => (
                  <ResultRow
                    key={r.id}
                    href={`/companies/${r.id}`}
                    icon={<BuildingIcon />}
                    iconBg="bg-green-100"
                    name={r.name}
                    subtitle={r.subtitle}
                    onClose={onClose}
                  />
                ))}
              </section>
            )}
            {results.conferences.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Conferences
                </p>
                {results.conferences.map(r => (
                  <ResultRow
                    key={r.id}
                    href={`/conferences/${r.id}`}
                    icon={<CalendarIcon />}
                    iconBg="bg-purple-100"
                    name={r.name}
                    subtitle={r.subtitle}
                    onClose={onClose}
                  />
                ))}
              </section>
            )}
            {results.events.length > 0 && (
              <section>
                <p className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Events
                </p>
                {results.events.map(r => (
                  <ResultRow
                    key={r.id}
                    href={`/conferences/${r.conference_id}`}
                    icon={<EventIcon />}
                    iconBg="bg-orange-100"
                    name={r.name}
                    subtitle={r.subtitle}
                    onClose={onClose}
                  />
                ))}
              </section>
            )}
            <div className="h-2" />
          </div>
        ) : null}
      </div>
    </div>
  );
}
