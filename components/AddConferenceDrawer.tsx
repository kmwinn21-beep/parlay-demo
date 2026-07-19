'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useForm } from 'react-hook-form';
import toast from 'react-hot-toast';
import { useConfigOptions } from '@/lib/useConfigOptions';
import { useDrawerResize } from '@/lib/useDrawerResize';
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
type PlanDecision = 'attend' | 'evaluating';

interface AddConferenceDrawerProps {
  planYear: number;
  onClose: () => void;
  onCreated: () => void;
}

// Same fields/behavior as ConferenceForm.tsx (used by /conferences/new), minus the
// Website field, Conference Agenda block, and Import Attendees section — this drawer
// is a quick-add path from the Program Planner, not a full conference setup flow.
// Adds a Decision dropdown (Attending/Evaluating) so the new conference lands in the
// right Plan-view group immediately.
export function AddConferenceDrawer({ planYear, onClose, onCreated }: AddConferenceDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const { panelStyle, handleResizeStart } = useDrawerResize(520);
  useEffect(() => { setMounted(true); }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
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
  const [planDecision, setPlanDecision] = useState<PlanDecision>('attend');

  useEffect(() => {
    fetch('/api/config?category=industry')
      .then((r) => r.json())
      .then((rows) => setIndustryOptions((rows ?? []).map((r: { id: number; value: string }) => ({ id: Number(r.id), value: String(r.value) }))))
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

  useEffect(() => {
    register('location', { required: 'Location is required' });
  }, [register]);
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);

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

  const onSubmit = async (data: ConferenceFormData) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      formData.append('name', data.name);
      formData.append('start_date', data.start_date);
      formData.append('end_date', data.end_date);
      formData.append('location', data.location);
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
      if (selectedSponsorshipLevel) formData.append('sponsorship_level', selectedSponsorshipLevel);
      formData.append('booth_present', boothPresent ? '1' : '0');
      if (boothPresent && boothWidth) formData.append('booth_width', boothWidth);
      if (boothPresent && boothLength) formData.append('booth_length', boothLength);
      if (boothPresent && boothNumber) formData.append('booth_number', boothNumber);
      if (boothPresent && boothHall) formData.append('booth_hall', boothHall);

      const res = await fetch('/api/conferences', { method: 'POST', body: formData });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        let errMsg = 'Failed to create conference';
        try { errMsg = JSON.parse(text)?.error ?? errMsg; } catch { /* plain-text */ }
        throw new Error(errMsg);
      }
      const result = await res.json();
      const newConferenceId = Number(result.id);

      // File this conference into the Plan view's Attending/Evaluating group for the
      // year being planned.
      await fetch(`/api/program-planner/conferences/${newConferenceId}/decision`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: planYear, decision: planDecision }),
      }).catch(() => {});

      toast.success('Conference created.');
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create conference');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end sm:items-stretch sm:justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      <div
        className="drawer-mobile-responsive relative flex flex-col bg-white w-full sm:w-[520px] h-[92vh] sm:h-full shadow-2xl rounded-t-2xl sm:rounded-tl-2xl sm:rounded-bl-2xl sm:rounded-tr-none sm:rounded-br-none overflow-hidden"
        style={panelStyle}
      >
        <div className="hidden sm:block absolute left-0 inset-y-0 w-1 cursor-col-resize z-10 group/rh" onMouseDown={handleResizeStart}>
          <div className="absolute inset-y-0 left-0 w-0.5 bg-brand-secondary/0 group-hover/rh:bg-brand-secondary/40 transition-colors" />
        </div>

        {/* Header */}
        <div className="flex-shrink-0 px-5 py-4 border-b border-gray-200 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-brand-primary font-serif leading-tight">Add Conference</p>
            <p className="text-[11px] text-gray-500 mt-0.5">Adding to FY{planYear} plan</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none flex-shrink-0" aria-label="Close">×</button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="flex-1 overflow-y-auto scrollbar-hide px-5 py-4 space-y-5">
          <div>
            <label className="label">Plan decision *</label>
            <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white">
              <button type="button" onClick={() => setPlanDecision('attend')} className={`px-3 py-1 text-xs sm:text-sm rounded-md ${planDecision === 'attend' ? 'bg-green-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Attending</button>
              <button type="button" onClick={() => setPlanDecision('evaluating')} className={`px-3 py-1 text-xs sm:text-sm rounded-md ${planDecision === 'evaluating' ? 'bg-gray-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Evaluating</button>
            </div>
            <p className="text-xs text-gray-500 mt-1">Determines which Plan view group this conference lands in for FY{planYear}.</p>
          </div>

          <div>
            <div className="flex items-center justify-between gap-3 mb-1">
              <label className="label !mb-0">Conference Name *</label>
              <div className="inline-flex rounded-lg border border-gray-300 p-0.5 bg-white">
                <button type="button" onClick={() => setConferenceMode('new')} className={`px-3 py-1 text-xs rounded-md ${conferenceMode === 'new' ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>New</button>
                <button type="button" onClick={() => setConferenceMode('historical')} className={`px-3 py-1 text-xs rounded-md ${conferenceMode === 'historical' ? 'bg-brand-secondary text-white' : 'text-gray-600 hover:bg-gray-100'}`}>Historical</button>
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

          <div ref={industryDropdownRef}>
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

          <div>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date *</label>
              <input type="date" {...register('start_date', { required: 'Start date is required' })} className="input-field" />
              {errors.start_date && <p className="text-red-500 text-xs mt-1">{errors.start_date.message}</p>}
            </div>
            <div>
              <label className="label">End Date *</label>
              <input type="date" {...register('end_date', { required: 'End date is required' })} className="input-field" />
              {errors.end_date && <p className="text-red-500 text-xs mt-1">{errors.end_date.message}</p>}
            </div>
          </div>

          <div>
            <label className="label">Location *</label>
            <LocationAutocompleteInput
              value={watch('location') || ''}
              onChange={(v) => setValue('location', v, { shouldValidate: true })}
              onSelect={(details) => setLocationDetails(details)}
              placeholder="e.g., Las Vegas Convention Center, NV"
            />
            {errors.location && <p className="text-red-500 text-xs mt-1">{errors.location.message}</p>}
          </div>

          {conferenceMode === 'new' && (
            <div>
              <label className="label">Conference Strategy *</label>
              <select {...register('conference_strategy_type_id', { required: conferenceMode === 'new' ? 'Conference strategy is required' : false })} className="input-field">
                <option value="">Select conference strategy...</option>
                {conferenceStrategyOptions.map((opt) => <option key={opt.id} value={String(opt.id)}>{opt.value}</option>)}
              </select>
              {conferenceStrategyOptions.length === 0 && <p className="text-xs text-amber-600 mt-1">No Conference Strategy options configured. Configure in Admin Settings → Types.</p>}
              {errors.conference_strategy_type_id && <p className="text-red-500 text-xs mt-1">{errors.conference_strategy_type_id.message}</p>}
            </div>
          )}

          <div>
            <label className="label">Notes</label>
            <textarea {...register('notes')} className="input-field resize-none" rows={3} placeholder="Any additional notes about this conference..." />
          </div>

          <div ref={internalDropdownRef}>
            <label className="label">Internal Attendees</label>
            <div className="relative">
              <button
                type="button"
                onClick={() => setInternalDropdownOpen(!internalDropdownOpen)}
                className="input-field w-full text-left flex items-center justify-between"
              >
                <span className={selectedInternalAttendees.length === 0 ? 'text-gray-400' : 'text-gray-800'}>
                  {selectedInternalAttendees.length === 0 ? 'Select internal attendees...' : `${selectedInternalAttendees.length} selected`}
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
                          onClick={() => setSelectedInternalAttendees((prev) => isSelected ? prev.filter((u) => u !== user) : [...prev, user])}
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
                  <span key={user} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-50 text-brand-secondary border border-blue-200">
                    {user}
                    <button type="button" onClick={() => setSelectedInternalAttendees((prev) => prev.filter((u) => u !== user))} className="hover:text-red-500">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
        </form>

        {/* Footer */}
        <div className="flex-shrink-0 flex gap-3 justify-end px-5 py-4 border-t border-gray-200">
          <button type="button" onClick={onClose} className="btn-secondary" disabled={isSubmitting}>Cancel</button>
          <button type="button" onClick={handleSubmit(onSubmit)} disabled={isSubmitting} className="btn-primary flex items-center gap-2">
            {isSubmitting ? (
              <>
                <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Creating...
              </>
            ) : 'Create Conference'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
