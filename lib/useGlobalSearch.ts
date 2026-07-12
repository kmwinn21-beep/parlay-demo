'use client';

import { useEffect, useRef, useState } from 'react';

export interface SearchResults {
  attendees: Array<{ id: number; name: string; subtitle: string | null }>;
  companies: Array<{ id: number; name: string; subtitle: string | null }>;
  conferences: Array<{ id: number; name: string; subtitle: string | null }>;
  events: Array<{ id: number; name: string; subtitle: string | null; conference_id: number }>;
  meetings: Array<{ id: number; name: string; subtitle: string | null }>;
  followUps: Array<{ id: number; attendee_id: number; name: string; subtitle: string | null }>;
}

export const EMPTY_SEARCH_RESULTS: SearchResults = {
  attendees: [], companies: [], conferences: [], events: [], meetings: [], followUps: [],
};

export function totalResultCount(results: SearchResults): number {
  return results.attendees.length + results.companies.length + results.conferences.length +
    results.events.length + results.meetings.length + results.followUps.length;
}

/** Shared debounced global-search state, used by both the GlobalSearchModal and the
 *  mobile header's inline search bar so both stay in sync with the same API/behavior. */
export function useGlobalSearch() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResults>(EMPTY_SEARCH_RESULTS);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults(EMPTY_SEARCH_RESULTS);
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

  return { query, setQuery, results, loading, searched };
}
