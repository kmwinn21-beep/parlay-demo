'use client';

import React, { useState, useCallback, useMemo, useRef } from 'react';
import { companyPools } from '@/lib/dummy-data/company-pools';
import type { CustomColumnDef } from '@/lib/dummy-data/generate-attendees';

type Vertical = 'healthcare' | 'senior_living' | 'generic_b2b';

interface RepItem {
  id: number;
  name: string;
}

interface ConferenceItem {
  id: number;
  name: string;
  attendeeCount: number;
  prospectCount: number;
  partnerCount: number;
  vendorCount: number;
}

const COLUMN_TYPES = ['text', 'number', 'date', 'boolean', 'email', 'phone', 'url', 'picklist'] as const;
const MAX_CUSTOM_COLUMNS = 10;

const VERTICAL_LABELS: Record<Vertical, string> = {
  healthcare: 'Healthcare',
  senior_living: 'Senior Living',
  generic_b2b: 'Generic B2B',
};

function poolMax(vertical: Vertical) {
  return {
    prospects: companyPools[vertical].prospects.length,
    partners: companyPools[vertical].partners.length,
    vendors: companyPools[vertical].vendors.length,
  };
}

export default function GeneratorPage() {
  // ── Step 1: Account ──────────────────────────────────────────────────────
  const [accountId, setAccountId] = useState('');
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [reps, setReps] = useState<RepItem[]>([]);
  const [conferences, setConferences] = useState<ConferenceItem[]>([]);

  // ── Step 2: Conference details ───────────────────────────────────────────
  const [conferenceName, setConferenceName] = useState('');
  const [vertical, setVertical] = useState<Vertical>('healthcare');
  const [keywordsRaw, setKeywordsRaw] = useState('');

  // ── Step 3: Company counts ───────────────────────────────────────────────
  const [prospectCount, setProspectCount] = useState(20);
  const [prospectAttendees, setProspectAttendees] = useState<2 | 3 | 4>(2);
  const [partnerCount, setPartnerCount] = useState(10);
  const [partnerAttendees, setPartnerAttendees] = useState(2);
  const [vendorCount, setVendorCount] = useState(10);
  const [vendorAttendees, setVendorAttendees] = useState(2);
  const [competitorCount, setCompetitorCount] = useState(0);
  const [competitorAttendees, setCompetitorAttendees] = useState(2);

  // ── Step 4: Reps ─────────────────────────────────────────────────────────
  const [selectedRepNames, setSelectedRepNames] = useState<Set<string>>(new Set());

  // ── Step 5: Custom columns ───────────────────────────────────────────────
  const [customColumnsOpen, setCustomColumnsOpen] = useState(false);
  const [customColumns, setCustomColumns] = useState<CustomColumnDef[]>([]);
  const dragIdxRef = useRef<number | null>(null);

  // ── Step 6: Overlap ──────────────────────────────────────────────────────
  const [overlapEnabled, setOverlapEnabled] = useState(false);
  const [sourceConferenceIds, setSourceConferenceIds] = useState<Set<number>>(new Set());
  const [prospectOverlapPct, setProspectOverlapPct] = useState(10);
  const [partnerOverlapPct, setPartnerOverlapPct] = useState(10);
  const [vendorOverlapPct, setVendorOverlapPct] = useState(0);

  // ── Step 7: Generate ─────────────────────────────────────────────────────
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState('');
  const [genSuccess, setGenSuccess] = useState('');

  const MAX_COMPANIES = 2000;
  // poolMax kept for display info only — generator fills beyond pool with synthetic names
  const maxCounts = useMemo(() => poolMax(vertical), [vertical]);

  const estimatedRows = useMemo(() => {
    const p = prospectCount * prospectAttendees;
    const pa = partnerCount * partnerAttendees;
    const v = vendorCount * vendorAttendees;
    const c = competitorCount * competitorAttendees;
    return { prospects: p, partners: pa, vendors: v, competitors: c, total: p + pa + v + c };
  }, [prospectCount, prospectAttendees, partnerCount, partnerAttendees, vendorCount, vendorAttendees, competitorCount, competitorAttendees]);

  const accountLoaded = !!companyName;

  // ── Load account ─────────────────────────────────────────────────────────
  const loadAccount = useCallback(async () => {
    const id = accountId.trim();
    if (!id) return;
    setLoadingAccount(true);
    setAccountError('');
    setCompanyName('');
    setReps([]);
    setConferences([]);

    try {
      const [repsRes, confsRes] = await Promise.all([
        fetch(`/api/ops/simulate-conference-activity/accounts/${id}/reps`),
        fetch(`/api/ops/generate-dummy-data/conferences?accountId=${id}`),
      ]);

      if (!repsRes.ok) throw new Error('Account not found or not accessible.');
      const repsData = await repsRes.json();
      if (repsData.error) throw new Error(repsData.error);

      const repsList: RepItem[] = Array.isArray(repsData) ? repsData : (repsData.reps ?? []);
      setReps(repsList);
      setSelectedRepNames(new Set(repsList.map((r: RepItem) => r.name)));
      setCompanyName(repsList.length > 0 ? 'Account loaded' : 'Account loaded (no reps)');

      if (confsRes.ok) {
        const confsData = await confsRes.json();
        setConferences(Array.isArray(confsData) ? confsData : []);
      }
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setLoadingAccount(false);
    }
  }, [accountId]);

  // ── Rep toggles ──────────────────────────────────────────────────────────
  const toggleRep = (name: string) => {
    setSelectedRepNames(prev => {
      const n = new Set(prev);
      n.has(name) ? n.delete(name) : n.add(name);
      return n;
    });
  };
  const selectAllReps = () => setSelectedRepNames(new Set(reps.map(r => r.name)));
  const deselectAllReps = () => setSelectedRepNames(new Set());

  // ── Custom columns ───────────────────────────────────────────────────────
  const addCustomColumn = () => {
    if (customColumns.length >= MAX_CUSTOM_COLUMNS) return;
    setCustomColumns(prev => [...prev, { name: '', type: 'text', smartGenerate: false }]);
  };
  const removeCustomColumn = (i: number) => setCustomColumns(prev => prev.filter((_, idx) => idx !== i));
  const updateCustomColumn = (i: number, patch: Partial<CustomColumnDef>) => {
    setCustomColumns(prev => prev.map((col, idx) => idx === i ? { ...col, ...patch } : col));
  };

  // ── Overlap toggles ──────────────────────────────────────────────────────
  const toggleSourceConference = (id: number) => {
    setSourceConferenceIds(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  };

  // ── Generate & download ──────────────────────────────────────────────────
  const generate = async () => {
    if (!conferenceName.trim()) { setGenError('Conference name is required.'); return; }

    setGenerating(true);
    setGenError('');
    setGenSuccess('');

    try {
      const keywords = keywordsRaw.split(',').map(s => s.trim()).filter(Boolean);
      const body = {
        accountId: accountId.trim(),
        conferenceName: conferenceName.trim(),
        vertical,
        keywords: keywords.length > 0 ? keywords : undefined,
        prospects: { companyCount: prospectCount, attendeesPerCompany: prospectAttendees },
        partners: { companyCount: partnerCount, attendeesPerCompany: partnerAttendees },
        vendors: { companyCount: vendorCount, attendeesPerCompany: vendorAttendees },
        competitors: competitorCount > 0 ? { companyCount: competitorCount, attendeesPerCompany: competitorAttendees } : undefined,
        reps: Array.from(selectedRepNames),
        customColumns: customColumns.filter(c => c.name.trim()),
        overlap: overlapEnabled ? {
          enabled: true,
          sourceConferenceIds: Array.from(sourceConferenceIds),
          prospectOverlapPct,
          partnerOverlapPct,
          vendorOverlapPct,
        } : { enabled: false, sourceConferenceIds: [], prospectOverlapPct: 0, partnerOverlapPct: 0, vendorOverlapPct: 0 },
      };

      const res = await fetch('/api/ops/generate-dummy-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Server error ${res.status}`);
      }

      const statsHeader = res.headers.get('X-Stats');
      const stats = statsHeader ? JSON.parse(statsHeader) : null;
      const blob = await res.blob();
      const filename = `${conferenceName.trim().replace(/\s+/g, '_')}_DummyData.xlsx`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      if (stats) {
        const parts = [
          `${stats.prospectRows} prospects`,
          `${stats.partnerRows} partners`,
          `${stats.vendorRows} vendors`,
          ...(stats.competitorRows > 0 ? [`${stats.competitorRows} competitors`] : []),
        ];
        setGenSuccess(
          `${filename} downloaded · ${stats.totalRows} rows (${parts.join(', ')}) · ${stats.returningAttendees} returning · ${stats.newAttendees} new`
        );
      } else {
        setGenSuccess(`${filename} downloaded`);
      }
    } catch (e) {
      setGenError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  };

  // ── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="mb-2">
        <h1 className="text-2xl font-bold text-gray-900">Dummy Data Generator</h1>
        <p className="text-sm text-gray-500 mt-0.5">Generate a realistic attendee list XLSX for import into any conference.</p>
      </div>

      {/* Step 1: Account */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 1 — Account</h2>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={accountId}
            onChange={e => setAccountId(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && loadAccount()}
            onBlur={loadAccount}
            placeholder="Account ID"
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-64"
          />
          <button
            onClick={loadAccount}
            disabled={loadingAccount}
            className="px-3 py-1.5 bg-gray-900 text-white text-sm rounded-md hover:bg-gray-700 disabled:opacity-50 sm:flex-shrink-0"
          >
            {loadingAccount ? 'Loading...' : 'Load'}
          </button>
        </div>
        {accountError && <p className="mt-2 text-sm text-red-600">{accountError}</p>}
        {companyName && !accountError && (
          <p className="mt-2 text-sm text-gray-600">
            ✓ <span className="font-medium text-gray-900">{reps.length} reps</span> · <span className="font-medium text-gray-900">{conferences.length} conferences</span> loaded
          </p>
        )}
      </div>

      {/* Step 2: Conference details */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 2 — Conference Details</h2>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Conference Name</label>
            <input
              type="text"
              value={conferenceName}
              onChange={e => setConferenceName(e.target.value)}
              placeholder="e.g. HIMSS 2027"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-80"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Vertical</label>
            <select
              value={vertical}
              onChange={e => setVertical(e.target.value as Vertical)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-auto"
            >
              {(Object.entries(VERTICAL_LABELS) as [Vertical, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Industry Keywords <span className="normal-case font-normal text-gray-400">(optional — used as company name suffixes)</span>
            </label>
            <input
              type="text"
              value={keywordsRaw}
              onChange={e => setKeywordsRaw(e.target.value)}
              placeholder="e.g. Hotels, Resorts, Hospitality, Properties"
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
            />
          </div>
        </div>
      </div>

      {/* Step 3: Company counts */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 3 — Company Counts</h2>

        <div className="space-y-5">
          {/* Prospects */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Prospects</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_COMPANIES}
                  value={prospectCount}
                  onChange={e => setProspectCount(Math.min(MAX_COMPANIES, Math.max(1, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 tabular-nums"
                />
                <span className="text-xs text-gray-400">companies</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-gray-500">Attendees/co.</span>
                <div className="flex gap-1">
                  {([2, 3, 4] as const).map(n => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setProspectAttendees(n)}
                      className={`w-8 h-8 text-sm rounded border font-medium transition-colors ${
                        prospectAttendees === n
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-300 hover:border-gray-500'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-gray-400 hidden sm:inline">(C-Suite + VP always included)</span>
              </div>
            </div>
          </div>

          {/* Partners */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Partners</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_COMPANIES}
                  value={partnerCount}
                  onChange={e => setPartnerCount(Math.min(MAX_COMPANIES, Math.max(1, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 tabular-nums"
                />
                <span className="text-xs text-gray-400">companies</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Attendees/co.</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={partnerAttendees}
                  onChange={e => setPartnerAttendees(Math.min(8, Math.max(1, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-16 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Vendors */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Vendors</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1}
                  max={MAX_COMPANIES}
                  value={vendorCount}
                  onChange={e => setVendorCount(Math.min(MAX_COMPANIES, Math.max(1, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 tabular-nums"
                />
                <span className="text-xs text-gray-400">companies</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Attendees/co.</span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={vendorAttendees}
                  onChange={e => setVendorAttendees(Math.min(8, Math.max(1, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-16 tabular-nums"
                />
              </div>
            </div>
          </div>

          {/* Competitors */}
          <div className="space-y-2">
            <span className="text-sm font-medium text-gray-700">Competitors</span>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={MAX_COMPANIES}
                  value={competitorCount}
                  onChange={e => setCompetitorCount(Math.min(MAX_COMPANIES, Math.max(0, Number(e.target.value))))}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-20 tabular-nums"
                />
                <span className="text-xs text-gray-400">companies</span>
              </div>
              {competitorCount > 0 && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-500">Attendees/co.</span>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={competitorAttendees}
                    onChange={e => setCompetitorAttendees(Math.min(8, Math.max(1, Number(e.target.value))))}
                    className="border border-gray-300 rounded px-2 py-1 text-sm w-16 tabular-nums"
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Live row count */}
        <div className="mt-4 pt-4 border-t border-gray-100 text-sm text-gray-600 flex flex-wrap gap-x-3 gap-y-1">
          <span className="font-medium text-gray-900">Est. rows:</span>
          <span>{estimatedRows.prospects.toLocaleString()} prospects</span>
          <span>{estimatedRows.partners.toLocaleString()} partners</span>
          <span>{estimatedRows.vendors.toLocaleString()} vendors</span>
          {competitorCount > 0 && <span>{estimatedRows.competitors.toLocaleString()} competitors</span>}
          <span className="font-semibold text-gray-900">{estimatedRows.total.toLocaleString()} total</span>
        </div>
      </div>

      {/* Step 4: Reps */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 4 — Reps</h2>
        {!accountLoaded ? (
          <p className="text-sm text-gray-400">Load an account first to see reps.</p>
        ) : reps.length === 0 ? (
          <p className="text-sm text-gray-400">No reps found for this account. Attendees will be generated without rep assignment.</p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray-600">Select which reps to assign.</p>
              <div className="flex items-center gap-2">
                <button onClick={selectAllReps} className="text-xs text-blue-600 hover:text-blue-800 underline">Select all</button>
                <span className="text-xs text-gray-400">/</span>
                <button onClick={deselectAllReps} className="text-xs text-blue-600 hover:text-blue-800 underline">Deselect all</button>
              </div>
            </div>
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {reps.map(rep => (
                <label key={rep.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedRepNames.has(rep.name)}
                    onChange={() => toggleRep(rep.name)}
                    className="rounded flex-shrink-0"
                  />
                  <span className="text-gray-900">{rep.name}</span>
                  <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Rep</span>
                </label>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Step 5: Custom columns (collapsible) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <button
          type="button"
          onClick={() => setCustomColumnsOpen(v => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <h2 className="font-semibold text-gray-900">Step 5 — Custom Columns</h2>
          <span className="text-xs text-gray-400 ml-1">(optional)</span>
          <svg
            className={`w-4 h-4 text-gray-400 ml-auto transition-transform ${customColumnsOpen ? 'rotate-180' : ''}`}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
          {customColumns.length > 0 && (
            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{customColumns.length}</span>
          )}
        </button>

        {customColumnsOpen && (
          <div className="mt-4 space-y-2">
            {customColumns.map((col, i) => (
              <div
                key={i}
                draggable
                onDragStart={() => { dragIdxRef.current = i; }}
                onDragOver={e => e.preventDefault()}
                onDrop={() => {
                  const from = dragIdxRef.current;
                  if (from == null || from === i) return;
                  setCustomColumns(prev => {
                    const a = prev.slice();
                    const [item] = a.splice(from, 1);
                    a.splice(i, 0, item);
                    return a;
                  });
                  dragIdxRef.current = null;
                }}
                className="flex flex-wrap items-center gap-2 p-2 border border-gray-200 rounded-md bg-gray-50 cursor-move"
              >
                <span className="text-gray-300 text-xs">⠿</span>
                <input
                  type="text"
                  value={col.name}
                  onChange={e => updateCustomColumn(i, { name: e.target.value })}
                  placeholder="Column name"
                  className="border border-gray-300 rounded px-2 py-1 text-xs flex-1 min-w-[120px]"
                />
                <select
                  value={col.type}
                  onChange={e => updateCustomColumn(i, { type: e.target.value as CustomColumnDef['type'] })}
                  className="border border-gray-300 rounded px-2 py-1 text-xs"
                >
                  {COLUMN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
                {col.type === 'picklist' && (
                  <input
                    type="text"
                    value={col.options?.join(', ') ?? ''}
                    onChange={e => updateCustomColumn(i, { options: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })}
                    placeholder="Option 1, Option 2, ..."
                    className="border border-gray-300 rounded px-2 py-1 text-xs w-full sm:w-52"
                  />
                )}
                <label className="flex items-center gap-1 text-xs text-gray-600 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={col.smartGenerate}
                    onChange={e => updateCustomColumn(i, { smartGenerate: e.target.checked })}
                    className="rounded"
                  />
                  Smart
                </label>
                <button
                  type="button"
                  onClick={() => removeCustomColumn(i)}
                  className="text-gray-300 hover:text-red-500 text-sm ml-auto"
                >✕</button>
              </div>
            ))}
            {customColumns.length < MAX_CUSTOM_COLUMNS && (
              <button
                type="button"
                onClick={addCustomColumn}
                className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium mt-1"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                Add column
              </button>
            )}
            <p className="text-xs text-gray-400">Max {MAX_CUSTOM_COLUMNS} custom columns. Drag rows to reorder.</p>
          </div>
        )}
      </div>

      {/* Step 6: Returning attendees (only shown if account has prior conferences) */}
      {accountLoaded && conferences.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 6 — Returning Attendees</h2>
          <label className="flex items-center gap-2 text-sm cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={overlapEnabled}
              onChange={e => setOverlapEnabled(e.target.checked)}
              className="rounded"
            />
            <span className="font-medium text-gray-700">Pull returning attendees from prior conferences</span>
          </label>

          {overlapEnabled && (
            <div className="space-y-4 pl-4 sm:pl-5">
              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Source conferences</p>
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  {conferences.map(c => (
                    <label key={c.id} className="flex items-start gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={sourceConferenceIds.has(c.id)}
                        onChange={() => toggleSourceConference(c.id)}
                        className="rounded mt-0.5 flex-shrink-0"
                      />
                      <span>
                        <span className="text-gray-800">{c.name}</span>
                        <span className="text-xs text-gray-400 block sm:inline sm:ml-1">
                          ({c.attendeeCount} attendees: {c.prospectCount}P / {c.partnerCount}Pa / {c.vendorCount}V)
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3">Overlap by type</p>
                <div className="space-y-3">
                  {[
                    { label: 'Prospects', value: prospectOverlapPct, set: setProspectOverlapPct },
                    { label: 'Partners', value: partnerOverlapPct, set: setPartnerOverlapPct },
                    { label: 'Vendors', value: vendorOverlapPct, set: setVendorOverlapPct },
                  ].map(({ label, value, set }) => (
                    <div key={label} className="flex items-center gap-3">
                      <span className="text-sm text-gray-700 w-16 flex-shrink-0">{label}</span>
                      <input
                        type="range"
                        min={0}
                        max={80}
                        step={5}
                        value={value}
                        onChange={e => set(Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-sm font-medium text-gray-900 tabular-nums w-10 text-right">{value}%</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-gray-400 mt-2">Returning attendees keep their original assigned rep.</p>
              </div>

              {sourceConferenceIds.size > 0 && (
                <div className="text-sm text-gray-600">
                  <span className="font-medium text-gray-900">~{estimatedRows.total} total rows</span>
                  {' · '}returning attendees deducted from new company generation
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Step 7: Generate */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <h2 className="font-semibold text-gray-900 mb-4">Step 7 — Generate & Download</h2>
        <button
          onClick={generate}
          disabled={generating || !conferenceName.trim()}
          className="w-full sm:w-auto px-5 py-2 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-700 disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {generating ? (
            <>
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Generating {estimatedRows.total} rows...
            </>
          ) : 'Generate & Download'}
        </button>
        {genError && <p className="mt-3 text-sm text-red-600">{genError}</p>}
        {genSuccess && <p className="mt-3 text-sm text-green-700 font-medium break-words">✓ {genSuccess}</p>}
      </div>
    </div>
  );
}
