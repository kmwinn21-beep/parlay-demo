'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

interface Season {
  id: string;
  season_name: string;
  season_key: string;
}

export interface SeriesOption {
  id: string;
  display_name: string;
  series_key: string;
  seasons: Season[];
}

interface Props {
  seriesId: string | null;
  seasonId: string | null;
  onSeriesChange: (series: SeriesOption | null) => void;
  onSeasonChange: (seasonId: string | null) => void;
}

export function SeriesSeasonCombobox({ seriesId, seasonId, onSeriesChange, onSeasonChange }: Props) {
  const [allSeries, setAllSeries] = useState<SeriesOption[]>([]);
  const [seriesQuery, setSeriesQuery] = useState('');
  const [seasonQuery, setSeasonQuery] = useState('');
  const [seriesOpen, setSeriesOpen] = useState(false);
  const [seasonOpen, setSeasonOpen] = useState(false);
  const [creating, setCreating] = useState<'series' | 'season' | null>(null);
  const seriesRef = useRef<HTMLDivElement>(null);
  const seasonRef = useRef<HTMLDivElement>(null);

  const selectedSeries = allSeries.find((s) => s.id === seriesId) ?? null;
  const selectedSeason = selectedSeries?.seasons.find((s) => s.id === seasonId) ?? null;

  const fetchSeries = useCallback(async () => {
    try {
      const res = await fetch('/api/conference-series');
      if (res.ok) setAllSeries(await res.json());
    } catch { /* non-fatal */ }
  }, []);

  useEffect(() => { fetchSeries(); }, [fetchSeries]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (seriesRef.current && !seriesRef.current.contains(e.target as Node)) setSeriesOpen(false);
      if (seasonRef.current && !seasonRef.current.contains(e.target as Node)) setSeasonOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // Keep query in sync with selected values when they change externally
  useEffect(() => {
    if (!seriesOpen) setSeriesQuery(selectedSeries?.display_name ?? '');
  }, [selectedSeries, seriesOpen]);

  useEffect(() => {
    if (!seasonOpen) setSeasonQuery(selectedSeason?.season_name ?? '');
  }, [selectedSeason, seasonOpen]);

  const filteredSeries = allSeries.filter((s) =>
    s.display_name.toLowerCase().includes(seriesQuery.toLowerCase()),
  );
  const showCreateSeries =
    seriesQuery.trim() &&
    !allSeries.some((s) => s.display_name.toLowerCase() === seriesQuery.trim().toLowerCase());

  const filteredSeasons = (selectedSeries?.seasons ?? []).filter((s) =>
    s.season_name.toLowerCase().includes(seasonQuery.toLowerCase()),
  );
  const showCreateSeason =
    seasonQuery.trim() &&
    !(selectedSeries?.seasons ?? []).some(
      (s) => s.season_name.toLowerCase() === seasonQuery.trim().toLowerCase(),
    );

  const handleCreateSeries = async () => {
    const name = seriesQuery.trim();
    if (!name) return;
    setCreating('series');
    try {
      const res = await fetch('/api/conference-series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: name }),
      });
      if (!res.ok) throw new Error('Failed to create series');
      const created: SeriesOption = await res.json();
      setAllSeries((prev) => [...prev, created]);
      onSeriesChange(created);
      onSeasonChange(null);
      setSeriesQuery(created.display_name);
      setSeriesOpen(false);
    } catch {
      toast.error('Failed to create series');
    } finally {
      setCreating(null);
    }
  };

  const handleCreateSeason = async () => {
    if (!selectedSeries) return;
    const name = seasonQuery.trim();
    if (!name) return;
    setCreating('season');
    try {
      const res = await fetch(`/api/conference-series/${selectedSeries.id}/seasons`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_name: name }),
      });
      if (!res.ok) throw new Error('Failed to create season');
      const created: Season = await res.json();
      const updatedSeries = {
        ...selectedSeries,
        seasons: [...selectedSeries.seasons, created],
      };
      setAllSeries((prev) => prev.map((s) => (s.id === selectedSeries.id ? updatedSeries : s)));
      onSeriesChange(updatedSeries);
      onSeasonChange(created.id);
      setSeasonQuery(created.season_name);
      setSeasonOpen(false);
    } catch {
      toast.error('Failed to create season');
    } finally {
      setCreating(null);
    }
  };

  const handleSelectSeries = (series: SeriesOption) => {
    onSeriesChange(series);
    onSeasonChange(null);
    setSeriesQuery(series.display_name);
    setSeriesOpen(false);
  };

  const handleClearSeries = () => {
    onSeriesChange(null);
    onSeasonChange(null);
    setSeriesQuery('');
    setSeasonQuery('');
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:col-span-2">
      {/* Series combobox */}
      <div ref={seriesRef} className="relative">
        <label className="label">Conference Series</label>
        <div className="relative">
          <input
            type="text"
            value={seriesQuery}
            onChange={(e) => { setSeriesQuery(e.target.value); setSeriesOpen(true); }}
            onFocus={() => setSeriesOpen(true)}
            placeholder="Search or create a series…"
            className="input-field pr-8"
            autoComplete="off"
          />
          {selectedSeries && (
            <button
              type="button"
              onClick={handleClearSeries}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear series"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {seriesOpen && (filteredSeries.length > 0 || showCreateSeries) && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {filteredSeries.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelectSeries(s)}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${s.id === seriesId ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-800'}`}
              >
                {s.display_name}
              </button>
            ))}
            {showCreateSeries && (
              <button
                type="button"
                onClick={handleCreateSeries}
                disabled={creating === 'series'}
                className="w-full text-left px-3 py-2 text-sm text-brand-secondary hover:bg-blue-50 flex items-center gap-2 border-t border-gray-100"
              >
                {creating === 'series' ? (
                  <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full inline-block" />
                ) : (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                Create series: <span className="font-medium">&ldquo;{seriesQuery.trim()}&rdquo;</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Track combobox — always visible, disabled when no series selected */}
      <div ref={seasonRef} className="relative">
        <label className={`label ${!selectedSeries ? 'text-gray-400' : ''}`}>
          Conference Track <span className="font-normal opacity-60">(optional)</span>
        </label>
        <div className="relative">
          <input
            type="text"
            value={seasonQuery}
            onChange={(e) => { setSeasonQuery(e.target.value); setSeasonOpen(true); }}
            onFocus={() => { if (selectedSeries) setSeasonOpen(true); }}
            placeholder="Search or create a track (ie, Spring, Northwest, Growth, etc.)"
            className={`input-field pr-8 text-[11px] placeholder:text-[11px] ${!selectedSeries ? 'opacity-50 cursor-not-allowed bg-gray-50' : ''}`}
            autoComplete="off"
            disabled={!selectedSeries}
          />
          {selectedSeason && (
            <button
              type="button"
              onClick={() => { onSeasonChange(null); setSeasonQuery(''); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              title="Clear track"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
        {selectedSeries && seasonOpen && (filteredSeasons.length > 0 || showCreateSeason) && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
            {filteredSeasons.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => { onSeasonChange(s.id); setSeasonQuery(s.season_name); setSeasonOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 ${s.id === seasonId ? 'bg-blue-50 text-brand-secondary font-medium' : 'text-gray-800'}`}
              >
                {s.season_name}
              </button>
            ))}
            {showCreateSeason && (
              <button
                type="button"
                onClick={handleCreateSeason}
                disabled={creating === 'season'}
                className="w-full text-left px-3 py-2 text-sm text-brand-secondary hover:bg-blue-50 flex items-center gap-2 border-t border-gray-100"
              >
                {creating === 'season' ? (
                  <span className="animate-spin w-3 h-3 border border-current border-t-transparent rounded-full inline-block" />
                ) : (
                  <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                )}
                Create track: <span className="font-medium">&ldquo;{seasonQuery.trim()}&rdquo;</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
