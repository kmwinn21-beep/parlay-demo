'use client';

import { useState, useEffect } from 'react';

interface Props {
  conferenceId: number;
  conferenceName: string;
  startDate?: string;
  endDate?: string;
  onClose: () => void;
}

type Provider = 'hubspot' | 'salesforce';

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

// Step indicator
function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-0 mb-6">
      {[1, 2, 3].map((n, i) => (
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
          {i < 2 && (
            <div className={`w-10 h-0.5 mx-0.5 ${step > n ? 'bg-emerald-400' : 'bg-gray-200'}`} />
          )}
        </div>
      ))}
      <span className="ml-3 text-xs text-gray-400 font-medium">Step {step} of 3</span>
    </div>
  );
}

export function CrmExportModal({ conferenceId, conferenceName, startDate, endDate, onClose }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [provider, setProvider] = useState<Provider | null>(null);
  const [campaignName, setCampaignName] = useState(conferenceName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  // Load stored campaign name mapping on mount
  useEffect(() => {
    fetch(`/api/conferences/${conferenceId}/crm-mapping`)
      .then(r => r.json())
      .then((d: { hubspot: string | null; salesforce: string | null }) => {
        // Will be applied when provider is selected
        if (provider && d[provider]) setCampaignName(d[provider]!);
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When provider changes on step 2, try to load stored mapping
  useEffect(() => {
    if (!provider || step !== 2) return;
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
    try {
      const res = await fetch(`/api/conferences/${conferenceId}/crm-export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, campaignName }),
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

      // Fire-and-forget: persist campaign name mapping
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

  const providerLabel = provider === 'hubspot' ? 'HubSpot' : provider === 'salesforce' ? 'Salesforce' : '';
  const dateRange = formatDateRange(startDate, endDate);

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
      {/* No click-outside dismiss — user must explicitly cancel */}
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
                {/* HubSpot */}
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

                {/* Salesforce */}
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

          {/* ── STEP 2 — Campaign Attribution ── */}
          {step === 2 && provider && (
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

          {/* ── STEP 3 — Confirm & Export ── */}
          {step === 3 && provider && (
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

                  {/* Summary card */}
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
                  onClick={() => { setStep(prev => (prev - 1) as 1 | 2 | 3); setError(null); }}
                  className="btn-secondary text-sm"
                  disabled={loading}
                >
                  ← Back
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {step < 3 && (
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
                  onClick={() => setStep(2)}
                  disabled={!provider}
                  className="btn-primary text-sm disabled:opacity-50"
                >
                  Next →
                </button>
              )}
              {step === 2 && (
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-primary text-sm"
                >
                  Next →
                </button>
              )}
              {step === 3 && (
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
