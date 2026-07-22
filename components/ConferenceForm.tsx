'use client';

import { useState, useRef, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { ColumnMappingModal } from './ColumnMappingModal';
import { type ColumnMapping } from '@/lib/columnMapping';
import { SeriesSeasonCombobox, type SeriesOption } from './SeriesSeasonCombobox';
import { LocationAutocompleteInput, type LocationDetails } from './LocationAutocompleteInput';

interface ConferenceFormData {
  name: string;
  start_date: string;
  end_date: string;
  location: string;
  notes: string;
  conference_strategy_type_id: string;
}

type ConferenceMode = 'new' | 'historical';

interface TerritoryOption {
  id: number;
  name: string;
  color: string;
}

export function ConferenceForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirmedMapping, setConfirmedMapping] = useState<ColumnMapping | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<{
    headers: string[];
    suggestions: ColumnMapping;
    sampleRows: Record<string, string>[];
    totalRows: number;
  } | null>(null);
  const [selectedInternalAttendees, setSelectedInternalAttendees] = useState<string[]>([]);
  const [internalDropdownOpen, setInternalDropdownOpen] = useState(false);
  const internalDropdownRef = useRef<HTMLDivElement>(null);
  const configOptions = useConfigOptions('conference_form');
  const userOptions = configOptions.user ?? [];
  const [conferenceStrategyOptions, setConferenceStrategyOptions] = useState<{ id: number; value: string }[]>([]);
  const [conferenceMode, setConferenceMode] = useState<ConferenceMode>('new');
  const [selectedSeries, setSelectedSeries] = useState<SeriesOption | null>(null);
  const [selectedSeasonId, setSelectedSeasonId] = useState<string | null>(null);
  const [industryOptions, setIndustryOptions] = useState<{ id: number; value: string }[]>([]);
  const [industrySearch, setIndustrySearch] = useState('');
  const [industryDropdownOpen, setIndustryDropdownOpen] = useState(false);
  const [selectedIndustryFocus, setSelectedIndustryFocus] = useState('');
  const industryDropdownRef = useRef<HTMLDivElement>(null);
  const [conferenceTypeInput, setConferenceTypeInput] = useState('');
  const [websiteInput, setWebsiteInput] = useState('');
  const [sponsorshipOptions, setSponsorshipOptions] = useState<{ id: number; value: string; color: string | null; is_system: number }[]>([]);
  const [selectedSponsorshipLevel, setSelectedSponsorshipLevel] = useState('');
  const [sponsorshipAddOpen, setSponsorshipAddOpen] = useState(false);
  const [sponsorshipAddValue, setSponsorshipAddValue] = useState('');
  const [sponsorshipAdding, setSponsorshipAdding] = useState(false);
  const [boothPresent, setBoothPresent] = useState(false);
  const [boothWidth, setBoothWidth] = useState('');
  const [boothLength, setBoothLength] = useState('');
  const [boothNumber, setBoothNumber] = useState('');
  const [boothHall, setBoothHall] = useState('');
  const [territoryScope, setTerritoryScope] = useState<'' | 'national' | 'regional'>('');
  const [territoryOptions, setTerritoryOptions] = useState<TerritoryOption[]>([]);
  const [selectedTerritoryIds, setSelectedTerritoryIds] = useState<Set<number>>(new Set());
  const [territoryDropdownOpen, setTerritoryDropdownOpen] = useState(false);
  const territoryDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fetch('/api/config?category=industry')
      .then((r) => r.json())
      .then((rows) => setIndustryOptions((rows ?? []).map((r: { id: number; value: string }) => ({ id: Number(r.id), value: String(r.value) }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/admin/territories')
      .then((r) => r.json())
      .then((data: { territories: Array<{ id: number; name: string; color: string }> }) =>
        setTerritoryOptions((data.territories ?? []).map(t => ({ id: t.id, name: t.name, color: t.color }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/config/sponsorship-levels')
      .then((r) => r.json())
      .then((rows) => setSponsorshipOptions((rows ?? []).map((r: { id: number; value: string; color: string | null; is_system: number }) => ({ id: Number(r.id), value: String(r.value), color: r.color ?? null, is_system: Number(r.is_system ?? 0) }))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch('/api/config?category=conference_strategy_type&form=conference_form')
      .then((r) => r.json())
      .then((rows) => setConferenceStrategyOptions((rows ?? []).map((r: { id: number; value: string }) => ({ id: Number(r.id), value: String(r.value) }))))
      .catch(() => setConferenceStrategyOptions([]));
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (internalDropdownRef.current && !internalDropdownRef.current.contains(e.target as Node)) {
        setInternalDropdownOpen(false);
      }
      if (industryDropdownRef.current && !industryDropdownRef.current.contains(e.target as Node)) {
        setIndustryDropdownOpen(false);
      }
      if (territoryDropdownRef.current && !territoryDropdownRef.current.contains(e.target as Node)) {
        setTerritoryDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ConferenceFormData>();

  // 'location' is driven by LocationAutocompleteInput (a fully custom component) rather than
  // a native <input>, so register it without spreading its ref/onChange anywhere and drive its
  // value exclusively through setValue — the standard react-hook-form pattern for wiring up
  // non-native form controls without pulling in the Controller API.
  useEffect(() => {
    register('location', { required: 'Location is required' });
  }, [register]);
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    const ext = f.name.toLowerCase().split('.').pop();
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Please upload an Excel (.xlsx, .xls) or CSV file.');
      return;
    }
    setIsLoadingPreview(true);
    try {
      const fd = new FormData();
      fd.append('file', f);
      const res = await fetch('/api/upload-preview', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to read file');
      setPendingFile(f);
      setPreviewData(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const createIndustryOption = async (value: string) => {
    try {
      const res = await fetch('/api/config/industry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as { id: number; value: string };
      const newOpt = { id: Number(created.id), value: String(created.value) };
      setIndustryOptions((prev) => [...prev.filter(o => o.value !== newOpt.value), newOpt]);
      setSelectedIndustryFocus(newOpt.value);
      setIndustrySearch('');
      setIndustryDropdownOpen(false);
    } catch {
      toast.error('Failed to create industry option.');
    }
  };

  const createSponsorshipLevel = async () => {
    const value = sponsorshipAddValue.trim();
    if (!value) return;
    setSponsorshipAdding(true);
    try {
      const res = await fetch('/api/config/sponsorship-levels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error();
      const created = await res.json() as { id: number; value: string; color: string | null; is_system: number };
      const newOpt = { id: Number(created.id), value: String(created.value), color: created.color ?? null, is_system: 0 };
      setSponsorshipOptions((prev) => [...prev.filter((o) => o.id !== newOpt.id), newOpt]);
      setSelectedSponsorshipLevel(newOpt.value);
      setSponsorshipAddValue('');
      setSponsorshipAddOpen(false);
    } catch {
      toast.error('Failed to add sponsorship level.');
    } finally {
      setSponsorshipAdding(false);
    }
  };

  const deleteSponsorshipLevel = async (id: number, value: string) => {
    try {
      const res = await fetch(`/api/config/${id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        toast.error(data.error || 'Failed to delete.');
        return;
      }
      setSponsorshipOptions((prev) => prev.filter((o) => o.id !== id));
      if (selectedSponsorshipLevel === value) setSelectedSponsorshipLevel('');
    } catch {
      toast.error('Failed to delete sponsorship level.');
    }
  };

  const handleMappingConfirmed = (mapping: ColumnMapping) => {
    setConfirmedMapping(mapping);
    setFile(pendingFile);
    setPreviewData(null);
    setPendingFile(null);
  };

  const onSubmit = async (data: ConferenceFormData) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('start_date', data.start_date);
      formData.append('end_date', data.end_date);
      formData.append('location', data.location);
      // Only send structured location data if it still matches the current text — if the
      // user edited the field after picking a suggestion, the picked details are stale.
      if (locationDetails && locationDetails.formatted_address === data.location) {
        formData.append('location_place_id', locationDetails.place_id);
        if (locationDetails.lat != null) formData.append('location_lat', String(locationDetails.lat));
        if (locationDetails.lng != null) formData.append('location_lng', String(locationDetails.lng));
        if (locationDetails.city) formData.append('location_city', locationDetails.city);
        if (locationDetails.state) formData.append('location_state', locationDetails.state);
        if (locationDetails.country) formData.append('location_country', locationDetails.country);
        if (locationDetails.timezone) formData.append('location_timezone', locationDetails.timezone);
      }
      formData.append('notes', data.notes || '');
      formData.append('internal_attendees', selectedInternalAttendees.join(','));
      if (conferenceMode === 'new') formData.append('conference_strategy_type_id', data.conference_strategy_type_id);
      if (selectedSeries) formData.append('series_id', selectedSeries.id);
      if (selectedSeasonId) formData.append('season_id', selectedSeasonId);
      formData.append('is_historical', conferenceMode === 'historical' ? '1' : '0');
      if (selectedIndustryFocus) formData.append('industry_focus', selectedIndustryFocus);
      if (conferenceTypeInput) formData.append('conference_type', conferenceTypeInput);
      if (websiteInput) formData.append('website', websiteInput);
      if (selectedSponsorshipLevel) formData.append('sponsorship_level', selectedSponsorshipLevel);
      formData.append('booth_present', boothPresent ? '1' : '0');
      if (boothPresent && boothWidth) formData.append('booth_width', boothWidth);
      if (boothPresent && boothLength) formData.append('booth_length', boothLength);
      if (boothPresent && boothNumber) formData.append('booth_number', boothNumber);
      if (boothPresent && boothHall) formData.append('booth_hall', boothHall);
      if (territoryScope) formData.append('territory_scope', territoryScope);
      if (territoryScope === 'regional') formData.append('territory_ids', JSON.stringify(Array.from(selectedTerritoryIds)));

      if (file) {
        formData.append('file', file);
        if (confirmedMapping) formData.append('mapping', JSON.stringify(confirmedMapping));
      }

      const res = await fetch('/api/conferences', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to create conference';
        if (res.status === 413) errMsg = 'File is too large. Please try a smaller file.';
        else { try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text */ } }
        throw new Error(errMsg);
      }

      const result = await res.json();

      if (result.status === 'processing') {
        localStorage.setItem('upload_job_in_progress', JSON.stringify({
          jobId: result.job_id,
          conferenceId: result.id,
          conferenceName: result.conference_name,
          totalRows: result.total_rows,
        }));
        toast('Large file upload started — you\'ll be notified when it\'s complete.', { duration: 6000, icon: '⏳' });
        router.push(`/conferences/${result.id}`);
        return;
      }

      toast.success(
        `Conference created!${result.parsed_count > 0 ? ` ${result.parsed_count} attendees imported.` : ''}`
      );
      router.push(`/conferences/${result.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create conference');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
    {previewData && pendingFile && (
      <ColumnMappingModal
        fileName={pendingFile.name}
        totalRows={previewData.totalRows}
        headers={previewData.headers}
        suggestions={previewData.suggestions}
        sampleRows={previewData.sampleRows}
        onConfirm={handleMappingConfirmed}
        onCancel={() => { setPreviewData(null); setPendingFile(null); }}
      />
    )}
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Basic Info */}
      <div className="card">
        <h2 className="text-lg font-semibold text-brand-primary mb-5 font-serif">Conference Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="label !mb-0">Conference Name *</label>
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white">
                <button type="button" onClick={() => setConferenceMode('new')} className={`px-3 py-1 text-xs sm:text-sm rounded-md ${conferenceMode === 'new' ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>New Conference</button>
                <button type="button" onClick={() => setConferenceMode('historical')} className={`px-3 py-1 text-xs sm:text-sm rounded-md ${conferenceMode === 'historical' ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Historical Conference</button>
              </div>
            </div>
            <input
              {...register('name', { required: 'Conference name is required' })}
              className="input-field"
              placeholder="e.g., Argentum Senior Living Conference 2025"
            />
            {errors.name && <p className="text-red-500 text-xs mt-1">{errors.name.message}</p>}
          </div>

          <SeriesSeasonCombobox
            seriesId={selectedSeries?.id ?? null}
            seasonId={selectedSeasonId}
            onSeriesChange={(s) => {
              setSelectedSeries(s);
              if (!s) setSelectedSeasonId(null);
              if (s?.industry_focus) setSelectedIndustryFocus(s.industry_focus);
              if (s?.conference_type) setConferenceTypeInput(s.conference_type);
            }}
            onSeasonChange={setSelectedSeasonId}
          />

          <div className="md:col-span-2" ref={industryDropdownRef}>
            <label className="label flex items-center gap-2">
              Industry Focus
              {selectedSeries && <span className="text-xs font-normal text-teal-600">• Synced to series</span>}
            </label>
            <div className="relative">
              <input
                type="text"
                value={industryDropdownOpen ? industrySearch : selectedIndustryFocus}
                onFocus={() => { setIndustryDropdownOpen(true); setIndustrySearch(selectedIndustryFocus); }}
                onChange={(e) => { setIndustrySearch(e.target.value); setSelectedIndustryFocus(e.target.value); }}
                placeholder="Search or add industry..."
                className="input-field pr-8"
                autoComplete="off"
              />
              {selectedIndustryFocus && !industryDropdownOpen && (
                <button type="button" onClick={() => { setSelectedIndustryFocus(''); setIndustrySearch(''); }} className="absolute inset-y-0 right-0 flex items-center pr-3">
                  <svg className="h-4 w-4 text-gray-400 hover:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              )}
              {industryDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {industryOptions
                    .filter((o) => !industrySearch || o.value.toLowerCase().includes(industrySearch.toLowerCase()))
                    .map((opt) => (
                      <button key={opt.id} type="button" onClick={() => { setSelectedIndustryFocus(opt.value); setIndustryDropdownOpen(false); setIndustrySearch(''); }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50">
                        {opt.value}
                      </button>
                    ))}
                  {industrySearch && !industryOptions.some((o) => o.value.toLowerCase() === industrySearch.toLowerCase()) && (
                    <button type="button" onClick={() => void createIndustryOption(industrySearch)} className="w-full text-left px-3 py-2 text-sm text-brand-secondary hover:bg-blue-50 flex items-center gap-2 font-medium">
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                      Create &ldquo;{industrySearch}&rdquo;
                    </button>
                  )}
                  {industryOptions.length === 0 && !industrySearch && (
                    <div className="px-3 py-2 text-sm text-gray-400">No industry options configured. Type to create one.</div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="label flex items-center gap-2">
              Conference Type
              {selectedSeries && <span className="text-xs font-normal text-teal-600">• Synced to series</span>}
            </label>
            <select
              value={conferenceTypeInput}
              onChange={(e) => setConferenceTypeInput(e.target.value)}
              className="input-field"
            >
              <option value="">Select type...</option>
              <option>Trade show</option>
              <option>User conference</option>
              <option>Executive summit</option>
              <option>Hosted dinner / private event</option>
              <option>Roundtable</option>
              <option>Field event</option>
              <option>Industry association conference</option>
              <option>Analyst conference</option>
              <option>Partner / ecosystem event</option>
              <option>Other</option>
            </select>
          </div>

          <div>
            <label className="label">Website</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9" /></svg>
              </div>
              <input
                type="url"
                value={websiteInput}
                onChange={(e) => setWebsiteInput(e.target.value)}
                className="input-field pl-9"
                placeholder="https://example.com"
              />
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Sponsorship Level</label>
            <div className="flex flex-wrap items-center gap-2">
              {sponsorshipOptions.map((opt) => {
                const isSelected = selectedSponsorshipLevel === opt.value;
                return (
                  <div key={opt.id} className="relative inline-flex">
                    <button
                      type="button"
                      onClick={() => setSelectedSponsorshipLevel(isSelected ? '' : opt.value)}
                      className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium border transition-all ${isSelected ? 'border-transparent text-white shadow-sm' : 'border-gray-300 bg-white text-gray-700 hover:border-gray-400'} ${!opt.is_system ? 'pr-6' : ''}`}
                      style={isSelected && opt.color ? { backgroundColor: opt.color } : {}}
                    >
                      {opt.is_system ? (
                        <svg className="w-3 h-3 flex-shrink-0 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                      ) : (
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: isSelected ? 'rgba(255,255,255,0.55)' : '#9ca3af' }} />
                      )}
                      {opt.value}
                    </button>
                    {!opt.is_system && (
                      <button
                        type="button"
                        onClick={() => void deleteSponsorshipLevel(opt.id, opt.value)}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 transition-colors"
                        title={`Remove ${opt.value}`}
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                  </div>
                );
              })}
              {!sponsorshipAddOpen ? (
                <button
                  type="button"
                  onClick={() => setSponsorshipAddOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm text-brand-secondary border border-dashed border-brand-secondary/50 hover:bg-blue-50 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                  Add custom level
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={sponsorshipAddValue}
                    onChange={(e) => setSponsorshipAddValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void createSponsorshipLevel(); } if (e.key === 'Escape') { setSponsorshipAddOpen(false); setSponsorshipAddValue(''); } }}
                    placeholder="Level name..."
                    className="input-field text-sm py-1 h-8 w-36"
                    autoFocus
                  />
                  <button type="button" onClick={() => void createSponsorshipLevel()} disabled={!sponsorshipAddValue.trim() || sponsorshipAdding} className="btn-primary text-xs px-3 h-8 disabled:opacity-50">
                    {sponsorshipAdding ? '…' : 'Add'}
                  </button>
                  <button type="button" onClick={() => { setSponsorshipAddOpen(false); setSponsorshipAddValue(''); }} className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="label">Booth</label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={boothPresent}
                onClick={() => setBoothPresent(!boothPresent)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none ${boothPresent ? 'bg-brand-secondary' : 'bg-gray-200'}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${boothPresent ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
              <span className="text-sm text-gray-700">{boothPresent ? 'We have a booth' : 'No booth'}</span>
            </div>
            {boothPresent && (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="label text-xs !mb-1">Length (ft)</label>
                  <input type="number" min="1" value={boothLength} onChange={(e) => setBoothLength(e.target.value)} className="input-field w-24" placeholder="10" />
                </div>
                <span className="pb-2.5 text-gray-400 text-sm">×</span>
                <div>
                  <label className="label text-xs !mb-1">Width (ft)</label>
                  <input type="number" min="1" value={boothWidth} onChange={(e) => setBoothWidth(e.target.value)} className="input-field w-24" placeholder="10" />
                </div>
                <div>
                  <label className="label text-xs !mb-1">Booth #</label>
                  <input type="text" value={boothNumber} onChange={(e) => setBoothNumber(e.target.value)} className="input-field w-28" placeholder="e.g., 412" />
                </div>
                <div>
                  <label className="label text-xs !mb-1">Hall</label>
                  <input type="text" value={boothHall} onChange={(e) => setBoothHall(e.target.value)} className="input-field w-36" placeholder="e.g., Hall B" />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="label">Start Date *</label>
            <input
              type="date"
              {...register('start_date', {
                required: 'Start date is required',
                onChange: (e) => {
                  const newStart = e.target.value;
                  if (!newStart) return;
                  const d = new Date(newStart + 'T00:00:00');
                  d.setDate(d.getDate() + 3);
                  setValue('end_date', d.toISOString().slice(0, 10));
                },
              })}
              className="input-field"
            />
            {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date.message}</p>}
          </div>

          <div>
            <label className="label">End Date *</label>
            <input
              type="date"
              {...register('end_date', { required: 'End date is required' })}
              className="input-field"
            />
            {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date.message}</p>}
          </div>

          <div className="md:col-span-2">
            <label className="label">Location *</label>
            <LocationAutocompleteInput
              value={watch('location') || ''}
              onChange={(v) => setValue('location', v, { shouldValidate: true })}
              onSelect={(details) => setLocationDetails(details)}
              placeholder="e.g., Las Vegas Convention Center, NV"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
          </div>

          <div>
            <label className="label">Market Coverage</label>
            <select
              value={territoryScope}
              onChange={(e) => {
                const v = e.target.value as '' | 'national' | 'regional';
                setTerritoryScope(v);
                if (v !== 'regional') setSelectedTerritoryIds(new Set());
              }}
              className="input-field"
            >
              <option value="">Select territory scope...</option>
              <option value="national">National</option>
              <option value="regional">Regional</option>
            </select>
          </div>

          <div ref={territoryDropdownRef}>
            <label className="label">Select Territories {territoryScope === 'regional' ? '*' : ''}</label>
            <div className="relative">
              <button
                type="button"
                disabled={territoryScope !== 'regional'}
                onClick={() => setTerritoryDropdownOpen((o) => !o)}
                className={`input-field text-left flex items-center justify-between gap-2 ${
                  territoryScope !== 'regional' ? 'bg-gray-50 text-gray-400 cursor-not-allowed' : ''
                }`}
              >
                <span className={selectedTerritoryIds.size === 0 ? 'text-gray-400' : 'text-gray-800'}>
                  {territoryScope !== 'regional'
                    ? 'Select Regional to choose territories'
                    : selectedTerritoryIds.size === 0
                      ? 'Select one or more territories...'
                      : territoryOptions.filter((t) => selectedTerritoryIds.has(t.id)).map((t) => t.name).join(', ')}
                </span>
                <svg className={`w-3.5 h-3.5 text-gray-400 flex-shrink-0 transition-transform ${territoryDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {territoryDropdownOpen && territoryScope === 'regional' && (
                <div className="absolute z-30 top-full mt-1 left-0 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                  {territoryOptions.length === 0 ? (
                    <p className="px-3 py-2 text-xs text-gray-400">No territories configured. Set them up in Admin Settings → Sales Reps.</p>
                  ) : territoryOptions.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTerritoryIds.has(t.id)}
                        onChange={() => setSelectedTerritoryIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(t.id)) next.delete(t.id); else next.add(t.id);
                          return next;
                        })}
                        className="accent-brand-secondary w-3.5 h-3.5 flex-shrink-0"
                      />
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: t.color }} />
                      {t.name}
                    </label>
                  ))}
                </div>
              )}
            </div>
          </div>

          {conferenceMode === 'new' && (
          <div className="md:col-span-2">
            <label className="label">Conference Strategy *</label>
            <select {...register('conference_strategy_type_id', { required: conferenceMode === 'new' ? 'Conference strategy is required' : false })} className="input-field">
              <option value="">Select conference strategy...</option>
              {conferenceStrategyOptions.map((opt) => <option key={opt.id} value={String(opt.id)}>{opt.value}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-1">Select the primary reason your team is attending this conference. This helps Parlay evaluate the event using the right success lens.</p>
            {conferenceStrategyOptions.length === 0 && <p className="text-xs text-amber-600 mt-1">No Conference Strategy options configured. Configure in Admin Settings → Types.</p>}
            {errors.conference_strategy_type_id && <p className="text-red-500 text-xs mt-1">{errors.conference_strategy_type_id.message}</p>}
          </div>
          )}

          <div className="md:col-span-2">
            <label className="label">Notes</label>
            <textarea
              {...register('notes')}
              className="input-field resize-none"
              rows={3}
              placeholder="Any additional notes about this conference..."
            />
          </div>

          <div className="md:col-span-2">
            <label className="label">Conference Agenda <span className="text-gray-400 font-normal">(optional)</span></label>
            <p className="text-xs text-gray-500 mb-2">Upload the conference agenda to share with all internal attendees. Can be added from the conference detail page after creating.</p>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-400">
              <svg className="h-4 w-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              Available after the conference is created
            </div>
          </div>

          <div className="md:col-span-2" ref={internalDropdownRef}>
            <label className="label">Internal Attendees</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setInternalDropdownOpen(!internalDropdownOpen)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className={selectedInternalAttendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                  {selectedInternalAttendees.length === 0
                    ? 'Select internal attendees...'
                    : `${selectedInternalAttendees.length} selected`}
                </span>
                <svg className={`w-4 h-4 text-gray-400 transition-transform ${internalDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {internalDropdownOpen && (
                <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {userOptions.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-gray-500">No users configured. Add users in the Admin panel.</div>
                  ) : (
                    userOptions.map((user) => {
                      const isSelected = selectedInternalAttendees.includes(user);
                      return (
                        <button
                          key={user}
                          type="button"
                          onClick={() => {
                            setSelectedInternalAttendees((prev) =>
                              isSelected ? prev.filter((u) => u !== user) : [...prev, user]
                            );
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                          <span className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center ${isSelected ? 'bg-brand-secondary border-brand-secondary' : 'border-gray-300'}`}>
                            {isSelected && (
                              <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </span>
                          {user}
                        </button>
                      );
                    })
                  )}
                </div>
              )}
            </div>
            {selectedInternalAttendees.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {selectedInternalAttendees.map((user) => (
                  <span
                    key={user}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200"
                  >
                    {user}
                    <button
                      type="button"
                      onClick={() => setSelectedInternalAttendees((prev) => prev.filter((u) => u !== user))}
                      className="hover:text-red-500"
                    >
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* File Upload */}
      <div className="card">
        <h2 className="text-lg font-semibold text-brand-primary mb-2 font-serif">Import Attendees</h2>
        <p className="text-sm text-gray-500 mb-4">
          Upload an Excel (.xlsx, .xls) or CSV file. You&apos;ll map your column names to system fields before the conference is created.
        </p>

        <div
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            file ? 'border-brand-secondary bg-blue-50' : 'border-gray-300 hover:border-gray-400'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={async (e) => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (!f) return;
            const ext = f.name.toLowerCase().split('.').pop();
            if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
              toast.error('Please upload an Excel or CSV file.');
              return;
            }
            setIsLoadingPreview(true);
            try {
              const fd = new FormData();
              fd.append('file', f);
              const res = await fetch('/api/upload-preview', { method: 'POST', body: fd });
              const data = await res.json();
              if (!res.ok) throw new Error(data.error || 'Failed to read file');
              setPendingFile(f);
              setPreviewData(data);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : 'Failed to read file');
            } finally {
              setIsLoadingPreview(false);
            }
          }}
        >
          {isLoadingPreview ? (
            <div className="flex items-center justify-center gap-3 text-sm text-gray-500">
              <svg className="animate-spin w-5 h-5 text-brand-secondary" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Reading file…
            </div>
          ) : file ? (
            <div className="flex items-center justify-center gap-3">
              <svg className="w-8 h-8 text-brand-secondary flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div className="text-left min-w-0">
                <p className="text-sm font-medium text-brand-primary truncate">{file.name}</p>
                <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB &middot; columns mapped</p>
              </div>
              <button
                type="button"
                onClick={() => { setFile(null); setConfirmedMapping(null); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <>
              <svg className="w-10 h-10 text-gray-400 mx-auto mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              <p className="text-sm text-gray-600">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-brand-secondary hover:underline font-medium"
                >
                  Click to upload
                </button>
                {' '}or drag and drop
              </p>
              <p className="text-xs text-gray-400 mt-1">Excel (.xlsx, .xls) or CSV files</p>
            </>
          )}
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* Submit */}
      <div className="flex gap-3 justify-end">
        <button
          type="button"
          onClick={() => router.push('/conferences')}
          className="btn-secondary"
          disabled={isSubmitting}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className="btn-primary flex items-center gap-2"
        >
          {isSubmitting ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              Creating...
            </>
          ) : (
            'Create Conference'
          )}
        </button>
      </div>
    </form>
    </>
  );
}
