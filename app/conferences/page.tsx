'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { BackButton } from '@/components/BackButton';

interface Conference {
  id: number;
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes?: string;
  created_at: string;
  attendee_count: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatDate(dateStr: string) {
  if (!dateStr) return '';
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

// Parse "Some Venue, City, ST" → { city, state }
function parseLocation(location: string): { city: string; state: string } {
  const parts = location.split(',').map((p) => p.trim());
  if (parts.length >= 3) {
    return { city: parts[parts.length - 2], state: parts[parts.length - 1] };
  }
  if (parts.length === 2) {
    return { city: parts[0], state: parts[1] };
  }
  return { city: location, state: '' };
}

export default function ConferencesPage() {
  const [conferences, setConferences] = useState<Conference[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Filters
  const [filterYear, setFilterYear] = useState('');
  const [filterMonth, setFilterMonth] = useState('');
  const [filterCity, setFilterCity] = useState('');
  const [filterState, setFilterState] = useState('');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  useEffect(() => {
    fetch('/api/conferences')
      .then((r) => r.json())
      .then((data: Conference[]) => {
        const sorted = data.sort(
          (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
        );
        setConferences(sorted);
      })
      .finally(() => setIsLoading(false));
  }, []);

  // Derived filter options
  const years = useMemo(() => {
    const s = new Set(conferences.map((c) => new Date(c.start_date + 'T00:00:00').getFullYear().toString()));
    return Array.from(s).sort((a, b) => Number(b) - Number(a));
  }, [conferences]);

  const cities = useMemo(() => {
    const s = new Set(conferences.map((c) => parseLocation(c.location).city).filter(Boolean));
    return Array.from(s).sort();
  }, [conferences]);

  const states = useMemo(() => {
    const s = new Set(conferences.map((c) => parseLocation(c.location).state).filter(Boolean));
    return Array.from(s).sort();
  }, [conferences]);

  const filteredConferences = useMemo(() => {
    return conferences.filter((c) => {
      const d = new Date(c.start_date + 'T00:00:00');
      const year = d.getFullYear().toString();
      const month = (d.getMonth() + 1).toString();
      const { city, state } = parseLocation(c.location);

      if (filterYear && year !== filterYear) return false;
      if (filterMonth && month !== filterMonth) return false;
      if (filterCity && city.toLowerCase() !== filterCity.toLowerCase()) return false;
      if (filterState && state.toLowerCase() !== filterState.toLowerCase()) return false;

      // Date range: show conference if start_date OR end_date falls within [from, to]
      if (filterDateFrom || filterDateTo) {
        const startInRange =
          (!filterDateFrom || c.start_date >= filterDateFrom) &&
          (!filterDateTo || c.start_date <= filterDateTo);
        const endInRange =
          (!filterDateFrom || c.end_date >= filterDateFrom) &&
          (!filterDateTo || c.end_date <= filterDateTo);
        if (!startInRange && !endInRange) return false;
      }

      return true;
    });
  }, [conferences, filterYear, filterMonth, filterCity, filterState, filterDateFrom, filterDateTo]);

  // Group by year → month (descending)
  const grouped = useMemo(() => {
    const byYear = new Map<string, Map<string, Conference[]>>();
    for (const conf of filteredConferences) {
      const d = new Date(conf.start_date + 'T00:00:00');
      const year = d.getFullYear().toString();
      const monthIdx = d.getMonth(); // 0-based
      const monthKey = monthIdx.toString();
      if (!byYear.has(year)) byYear.set(year, new Map());
      const byMonth = byYear.get(year)!;
      if (!byMonth.has(monthKey)) byMonth.set(monthKey, []);
      byMonth.get(monthKey)!.push(conf);
    }
    // Sort years descending
    const sortedYears = Array.from(byYear.keys()).sort((a, b) => Number(b) - Number(a));
    return sortedYears.map((year) => {
      const monthMap = byYear.get(year)!;
      // Sort months descending
      const sortedMonths = Array.from(monthMap.keys()).sort((a, b) => Number(b) - Number(a));
      return {
        year,
        months: sortedMonths.map((monthKey) => ({
          monthKey,
          monthName: MONTH_NAMES[Number(monthKey)],
          conferences: monthMap.get(monthKey)!,
        })),
      };
    });
  }, [filteredConferences]);

  const hasFilters = filterYear || filterMonth || filterCity || filterState || filterDateFrom || filterDateTo;

  const clearFilters = () => {
    setFilterYear('');
    setFilterMonth('');
    setFilterCity('');
    setFilterState('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <BackButton />
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-procare-dark-blue font-serif">Conferences</h1>
          <p className="text-sm text-gray-500">
            {filteredConferences.length} of {conferences.length} conference{conferences.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Link href="/conferences/new" className="btn-primary flex items-center gap-2">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New Conference
        </Link>
      </div>

      {/* Filters */}
      {!isLoading && conferences.length > 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-procare-dark-blue">Filters</h2>
            {hasFilters && (
              <button onClick={clearFilters} className="text-xs text-procare-bright-blue hover:underline">
                Clear all
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Year */}
            <div>
              <label className="label text-xs">Year</label>
              <select
                value={filterYear}
                onChange={(e) => setFilterYear(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All years</option>
                {years.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Month */}
            <div>
              <label className="label text-xs">Month</label>
              <select
                value={filterMonth}
                onChange={(e) => setFilterMonth(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All months</option>
                {MONTH_NAMES.map((name, idx) => (
                  <option key={idx} value={(idx + 1).toString()}>{name}</option>
                ))}
              </select>
            </div>

            {/* City */}
            <div>
              <label className="label text-xs">City</label>
              <select
                value={filterCity}
                onChange={(e) => setFilterCity(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All cities</option>
                {cities.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* State */}
            <div>
              <label className="label text-xs">State</label>
              <select
                value={filterState}
                onChange={(e) => setFilterState(e.target.value)}
                className="input-field text-sm"
              >
                <option value="">All states</option>
                {states.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Date From */}
            <div>
              <label className="label text-xs">Date From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="input-field text-sm"
              />
            </div>

            {/* Date To */}
            <div>
              <label className="label text-xs">Date To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="input-field text-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin w-8 h-8 border-4 border-procare-bright-blue border-t-transparent rounded-full" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && conferences.length === 0 && (
        <div className="card text-center py-16">
          <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <h2 className="text-lg font-semibold text-gray-700 mb-2 font-serif">No conferences yet</h2>
          <p className="text-sm text-gray-400 mb-6">Create your first conference to start tracking attendees.</p>
          <Link href="/conferences/new" className="btn-primary inline-block">
            Add Your First Conference
          </Link>
        </div>
      )}

      {/* No results after filtering */}
      {!isLoading && conferences.length > 0 && filteredConferences.length === 0 && (
        <div className="card text-center py-10">
          <p className="text-gray-500 text-sm">No conferences match the current filters.</p>
          <button onClick={clearFilters} className="mt-3 text-procare-bright-blue text-sm hover:underline">
            Clear filters
          </button>
        </div>
      )}

      {/* Grouped list */}
      {!isLoading && grouped.map(({ year, months }) => (
        <div key={year} className="space-y-4">
          {/* Year header */}
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-procare-dark-blue font-serif">{year}</h2>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          {months.map(({ monthKey, monthName, conferences: monthConfs }) => (
            <div key={monthKey} className="space-y-2">
              {/* Month subheader */}
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider pl-1">{monthName}</h3>

              <div className="grid grid-cols-1 gap-3">
                {monthConfs.map((conf) => {
                  const { city, state } = parseLocation(conf.location);
                  return (
                    <Link
                      key={conf.id}
                      href={`/conferences/${conf.id}`}
                      className="card hover:shadow-md transition-all hover:border-procare-bright-blue border border-transparent group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <h4 className="text-base font-semibold text-procare-dark-blue group-hover:text-procare-bright-blue transition-colors font-serif truncate">
                            {conf.name}
                          </h4>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                            <span className="flex items-center gap-1 text-sm text-gray-600">
                              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              {formatDate(conf.start_date)}
                              {conf.end_date && conf.end_date !== conf.start_date
                                ? ` – ${formatDate(conf.end_date)}`
                                : ''}
                            </span>
                            <span className="flex items-center gap-1 text-sm text-gray-600">
                              <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                              </svg>
                              {conf.location}
                            </span>
                            {city && state && (
                              <span className="badge-blue text-xs">{city}, {state}</span>
                            )}
                          </div>
                          {conf.notes && (
                            <p className="text-sm text-gray-500 mt-1.5 line-clamp-1">{conf.notes}</p>
                          )}
                        </div>
                        <div className="ml-6 flex-shrink-0 text-right">
                          <div className="bg-procare-dark-blue text-white rounded-xl px-4 py-2 text-center min-w-[80px]">
                            <p className="text-2xl font-bold font-serif">{conf.attendee_count}</p>
                            <p className="text-xs text-blue-300">attendees</p>
                          </div>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
