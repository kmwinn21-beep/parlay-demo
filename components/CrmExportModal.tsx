'use client';

import { useState, useEffect, useRef } from 'react';

interface Props {
  conferenceId: number;
  conferenceName: string;
  startDate?: string;
  endDate?: string;
  onClose: () => void;
}

type Provider = 'hubspot' | 'salesforce';
type FilterMode = 'all' | 'filter';

function formatDateRange(start?: string, end?: string): string {
  const fmt = (s: string) => {
    try {
      return new Date(s.includes('T') ? s : `${s}T00:00:00Z`).toLocaleDateString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
      });
    } catch { return s; }
  };
  if (!start) return '—';
  if (!end || end === start) return fmt(start);
  return `${fmt(start)} – ${fmt(end)}`;
}

const CRM_FILES: Record<Provider, string[]> = {
  hubspot: [
    '1_companies.csv',
    '2_contacts.csv',
    '3_meetings.csv',
    '4_tasks.csv',
    '5_notes.csv',
    'HubSpot Import Instructions - READ ME.txt',
  ],
  salesforce: [
    '1_accounts.csv',
    '2_contacts.csv',
    '3_events.csv',
    '4_tasks.csv',
    '5_notes.csv',
    'Salesforce Import Instructions - READ ME.txt',
  ],
};

function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {[1, 2, 3, 4].map((n, i) => (
        <div key={n} className="flex items-center">
          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-colors ${
            step === n
              ? 'bg-brand-primary text-white'
              : step > n
                ? 'bg-emerald-500 text-white'
                : 'bg-gray-100 text-gray-400'
          }`}>
            {step > n ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            ) : n}
          </div>
          {i < 3 && (
            <div className={`w-8 h-0.5 mx-0.5 ${step > n ? 'bg-emerald-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className="ml-3 text-xs text-gray-400 font-medium">Step {step} of 4</span>
    </div>
  );
}

export function CrmExportModal({ conferenceId, conferenceName, startDate, endDate, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>('all');
  const [selectedCompanyTypes, setSelectedCompanyTypes] = useState<string[]>([]);
  const [availableCompanyTypes, setAvailableCompanyTypes] = useState<string[]>([]);
  const [filterTypeError, setFilterTypeError] = useState(false);
  const [companyTypeDropdownOpen, setCompanyTypeDropdownOpen] = useState(false);
  const [campaignName, setCampaignName] = useState(conferenceName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch available company types on mount
  useEffect(() => {
    fetch('/api/config?category=company_type')
      .then(r => r.json())
      .then((d: { value: string }[]) => {
        setAvailableCompanyTypes(Array.isArray(d) ? d.map(x => x.value).filter(Boolean) : []);
      })
      .catch(() => {});
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    if (!companyTypeDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCompanyTypeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [companyTypeDropdownOpen]);

  // When provider changes on step 3 (campaign attribution), load stored mapping
  useEffect(() => {
    if (!provider || step !== 3) return;
    fetch(`/api/conferences/${conferenceId}/crm-mapping`)
      .then(r => r.json())
      .then((d: { hubspot: string | null; salesforce: string | null }) => {
        const stored = d[provider];
        if (stored) setCampaignName(stored);
        else setCampaignName(conferenceName);
      })
      .catch(() => setCampaignName(conferenceName));
  }, [provider, step]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async () => {
    if (!provider) return;
    setLoading(true);
    setError(null);
    const companyTypeFilter = filterMode === 'filter' && selectedCompanyTypes.length > 0
      ? selectedCompanyTypes
      : null;
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/crm-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, campaignName, companyTypeFilter }),
      });

      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Export failed');
      }

      const blob = await res.blob();
      const slug = conferenceName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      const folder = provider === 'hubspot' ? `hubspot-import-${slug}` : `salesforce-import-${slug}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${folder}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      fetch(`/api/conferences/${conferenceId}/crm-mapping`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, campaignName }),
      }).catch(e => console.error('Failed to persist CRM mapping:', e));

      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    if (step === 2) {
      if (filterMode === 'filter' && selectedCompanyTypes.length === 0) {
        setFilterTypeError(true);
        return;
      }
      setFilterTypeError(false);
    }
    setError(null);
    setStep(prev => (prev + 1) as 2 | 3 | 4);
  };

  const goBack = () => {
    setError(null);
    setFilterTypeError(false);
    setStep(prev => (prev - 1) as 1 | 2 | 3);
  };

  const toggleCompanyType = (t: string) => {
    setSelectedCompanyTypes(prev =>
      prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]
    );
    setFilterTypeError(false);
  };

  const providerLabel = provider === 'hubspot' ? 'HubSpot' : provider === 'salesforce' ? 'Salesforce' : '';
  const dateRange = formatDateRange(startDate, endDate);
  const filterSummary = filterMode === 'filter' && selectedCompanyTypes.length > 0
    ? selectedCompanyTypes.join(', ')
    : 'All companies and contacts';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* No click-outside dismiss */}
      <div className="absolute inset-0 bg-black/40" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-0">
          <div className="flex-1">
            <StepIndicator step={step} />
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors ml-4 mt-0.5 flex-shrink-0"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 pb-2">

          {/* ── STEP 1 — Select CRM ── */}
          {step === 1 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Select your CRM</h2>
              <p className="text-sm text-gray-500 mb-5">
                Choose the CRM you want to import this data into. Files will be formatted and named for the selected platform.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setProvider('hubspot')}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    provider === 'hubspot'
                      ? 'border-orange-500 bg-orange-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#ff7a59' }}>
                      <span className="text-white text-xs font-bold">HS</span>
                    </div>
                    <span className="font-semibold text-gray-900">HubSpot</span>
                    {provider === 'hubspot' && (
                      <svg className="w-4 h-4 text-orange-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Exports contacts, companies, meetings, tasks, and notes formatted for HubSpot&apos;s import wizard
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setProvider('salesforce')}
                  className={`rounded-xl border-2 p-4 text-left transition-all ${
                    provider === 'salesforce'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ backgroundColor: '#00a1e0' }}>
                      <span className="text-white text-xs font-bold">SF</span>
                    </div>
                    <span className="font-semibold text-gray-900">Salesforce</span>
                    {provider === 'salesforce' && (
                      <svg className="w-4 h-4 text-blue-500 ml-auto" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed">
                    Exports contacts, accounts, events, tasks, and notes formatted for Salesforce Data Import Wizard
                  </p>
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 2 — Filter by company type ── */}
          {step === 2 && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">Filter companies and contacts</h2>
              <p className="text-sm text-gray-500 mb-5">
                By default, all companies and contacts from this conference will be exported. You can filter to only include specific company types — for example, only your prospects or target accounts. This filter applies to both the companies file and the contacts file.
              </p>

              <div className="space-y-3">
                {/* Option A */}
                <button
                  type="button"
                  onClick={() => { setFilterMode('all'); setFilterTypeError(false); }}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                    filterMode === 'all'
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      filterMode === 'all' ? 'border-brand-primary' : 'border-gray-300'
                    }`}>
                      {filterMode === 'all' && <div className="w-2 h-2 rounded-full bg-brand-primary" />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">Export everything</p>
                      <p className="text-xs text-gray-500 mt-0.5">Include all companies and contacts from this conference regardless of company type</p>
                    </div>
                  </div>
                </button>

                {/* Option B */}
                <button
                  type="button"
                  onClick={() => setFilterMode('filter')}
                  className={`w-full rounded-xl border-2 p-4 text-left transition-all ${
                    filterMode === 'filter'
                      ? 'border-brand-primary bg-brand-primary/5'
                      : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-full border-2 flex-shrink-0 flex items-center justify-center ${
                      filterMode === 'filter' ? 'border-brand-primary' : 'border-gray-300'
                    }`}>
                      {filterMode === 'filter' && <div className="w-2 h-2 rounded-full bg-brand-primary" />}
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 text-sm">Filter by company type</p>
                      <p className="text-xs text-gray-500 mt-0.5">Only include companies and contacts that match one or more company types</p>
                    </div>
                  </div>
                </button>
              </div>

              {/* Multi-select dropdown — shown when Option B is selected */}
              {filterMode === 'filter' && (
                <div className="mt-4" ref={dropdownRef}>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setCompanyTypeDropdownOpen(v => !v)}
                      className={`input-field text-sm w-full text-left flex items-center flex-wrap gap-1.5 min-h-[40px] pr-8 ${
                        filterTypeError ? 'border-red-400 focus:ring-red-300' : ''
                      }`}
                    >
                      {selectedCompanyTypes.length === 0 ? (
                        <span className="text-gray-400">Select company types…</span>
                      ) : (
                        selectedCompanyTypes.map(t => (
                          <span
                            key={t}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                            style={{ backgroundColor: 'rgb(var(--brand-primary-rgb) / 0.12)', color: 'rgb(var(--brand-primary-rgb))' }}
                          >
                            {t}
                            <span
                              role="button"
                              tabIndex={0}
                              onClick={e => { e.stopPropagation(); toggleCompanyType(t); }}
                              onKeyDown={e => e.key === 'Enter' && (e.stopPropagation(), toggleCompanyType(t))}
                              className="cursor-pointer hover:opacity-70 leading-none"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </span>
                          </span>
                        ))
                      )}
                      <svg
                        className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${companyTypeDropdownOpen ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {companyTypeDropdownOpen && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-48 overflow-y-auto">
                        {availableCompanyTypes.length === 0 ? (
                          <p className="text-sm text-gray-400 px-3 py-2">No company types configured.</p>
                        ) : (
                          availableCompanyTypes.map(t => (
                            <button
                              key={t}
                              type="button"
                              onClick={() => toggleCompanyType(t)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-gray-50 transition-colors"
                            >
                              {selectedCompanyTypes.includes(t) ? (
                                <svg className="w-4 h-4 text-brand-primary flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                              ) : (
                                <div className="w-4 h-4 flex-shrink-0" />
                              )}
                              {t}
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </div>

                  {filterTypeError && (
                    <p className="text-xs text-red-600 mt-1.5">Select at least one company type to continue.</p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── STEP 3 — Campaign Attribution ── */}
          {step === 3 && provider && (
            <div>
              <h2 className="text-lg font-bold text-gray-900 mb-1">
                Conference attribution in {providerLabel}
              </h2>
              <div className="rounded-lg bg-gray-50 border border-gray-200 px-4 py-3 text-sm text-gray-700 mb-5 space-y-2">
                <p>
                  Every export file includes a <strong>Campaign Name</strong> column. This links your contacts, meetings, and tasks to a specific conference campaign in your CRM — enabling conference-level attribution in reporting.
                </p>
                <p className="text-gray-500">
                  {provider === 'hubspot'
                    ? 'Your campaign must already exist before importing. After import, enroll the contacts into the campaign via bulk action in HubSpot.'
                    : 'Your Campaign record must exist before importing. The Data Import Wizard will automatically create Campaign Member records when it finds a matching Campaign Name.'}
                </p>
              </div>

              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Parlay Conference</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Dates</th>
                      <th className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">Campaign Name</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="bg-white">
                      <td className="px-4 py-3 font-medium text-gray-900">{conferenceName}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{dateRange}</td>
                      <td className="px-4 py-3">
                        <input
                          type="text"
                          value={campaignName}
                          onChange={e => setCampaignName(e.target.value)}
                          className="input-field text-sm w-full min-w-[180px]"
                          placeholder={conferenceName}
                        />
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400 mt-2">
                Must match exactly — spelling, capitalization, and spacing all matter.
              </p>
            </div>
          )}

          {/* ── STEP 4 — Confirm & Export ── */}
          {step === 4 && provider && (
            <div>
              {done ? (
                <div className="text-center py-6">
                  <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-7 h-7 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h2 className="text-lg font-bold text-gray-900 mb-1">Download started</h2>
                  <p className="text-sm text-gray-500 mb-6">
                    Your ZIP file is downloading. Import the files in the order listed in the README inside the ZIP.
                  </p>
                  <button onClick={onClose} className="btn-primary text-sm">Done</button>
                </div>
              ) : (
                <>
                  <h2 className="text-lg font-bold text-gray-900 mb-4">Ready to export</h2>

                  <div className="rounded-xl border border-gray-200 bg-gray-50 divide-y divide-gray-200 mb-4">
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-gray-500 font-medium">CRM</span>
                      <span className="text-gray-900 font-semibold">{providerLabel}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-gray-500 font-medium">Conference</span>
                      <span className="text-gray-900 font-semibold">{conferenceName}</span>
                    </div>
                    <div className="flex items-center justify-between px-4 py-3 text-sm">
                      <span className="text-gray-500 font-medium">Campaign name</span>
                      <span className="text-gray-900 font-semibold">{campaignName}</span>
                    </div>
                    <div className="flex items-start justify-between px-4 py-3 text-sm">
                      <span className="text-gray-500 font-medium flex-shrink-0">Company filter</span>
                      <span className="text-gray-900 font-semibold text-right ml-4">{filterSummary}</span>
                    </div>
                    <div className="px-4 py-3">
                      <p className="text-xs font-medium text-gray-500 mb-2 uppercase tracking-wide">Files that will be generated</p>
                      <ul className="space-y-1">
                        {CRM_FILES[provider].map(f => (
                          <li key={f} className="flex items-center gap-2 text-sm text-gray-700">
                            <svg className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  <p className="text-xs text-gray-500 mb-4">
                    Your files will download as a ZIP. Import them in the order listed inside the README file.
                  </p>

                  {error && (
                    <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-700 mb-3">
                      {error}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {!done && (
          <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
            <div>
              {step > 1 && (
                <button
                  type="button"
                  onClick={goBack}
                  className="btn-secondary text-sm"
                  disabled={loading}
                >
                  ← Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 4 && (
                <button
                  type="button"
                  onClick={onClose}
                  className="btn-secondary text-sm"
                  disabled={loading}
                >
                  Cancel
                </button>
              )}
              {step === 1 && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={!provider}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  Next →
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={filterMode === 'filter' && selectedCompanyTypes.length === 0}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  Next →
                </button>
              )}
              {step === 3 && (
                <button
                  type="button"
                  onClick={goNext}
                  className="btn-primary text-sm"
                >
                  Next →
                </button>
              )}
              {step === 4 && (
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={loading}
                  className="btn-primary text-sm flex items-center gap-2 disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Generating files…
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Download ZIP
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
