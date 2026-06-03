'use client';

import { useState, useCallback } from 'react';

interface ConferenceItem {
  id: number;
  name: string;
  status: string | null;
  strategy: string | null;
  totalCost: number | null;
  attendeeCount: number;
  currentCes: number | null;
  hasSimulatedActivity: boolean;
}

interface RepItem {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface DimensionBreakdown {
  dim1_icp_quality: number;
  dim2_meeting_execution: number;
  dim3_pipeline_influence: number;
  dim4_breadth: number;
  dim5_followup_execution: number;
  dim6_net_new: number;
  dim7_cost_efficiency: number;
}

interface SimulationPlan {
  meetingsScheduled: number;
  meetingsHeld: number;
  meetingsWithOutcomes: number;
  followUpsCreated: number;
  followUpsCompleted: number;
  touchpoints: number;
  companiesEngaged: number;
  netNewLogos: number;
  pipelineInfluenced: number;
}

interface SimulationResult {
  projectedScore: number;
  projectedDimensions: DimensionBreakdown;
  weightedContributions: DimensionBreakdown;
  plan: SimulationPlan;
  written: boolean;
  recordsWritten?: {
    meetings: number;
    followUps: number;
    touchpoints: number;
  };
  convergenceWarning?: string;
  dim3Warning?: string;
}

type Density = 'light' | 'moderate' | 'heavy';

const densityDescriptions: Record<Density, string> = {
  light: 'Fewer meetings, lower follow-up rates — conservative simulation.',
  moderate: 'Balanced activity mix — recommended for most conferences.',
  heavy: 'High meeting volume and follow-up completion — aggressive simulation.',
};

function scoreTier(score: number): { label: string; color: string } {
  if (score >= 90) return { label: 'Exceptional', color: 'bg-green-500' };
  if (score >= 75) return { label: 'Strong', color: 'bg-blue-500' };
  if (score >= 60) return { label: 'Moderate', color: 'bg-amber-500' };
  return { label: 'Weak', color: 'bg-red-500' };
}

function formatPipeline(val: number): string {
  if (val >= 1_000_000) return `$${(val / 1_000_000).toFixed(1)}M`;
  if (val >= 1_000) return `$${(val / 1_000).toFixed(0)}K`;
  return `$${val}`;
}


export default function SimulatorPage() {
  const [accountId, setAccountId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [conferences, setConferences] = useState<ConferenceItem[]>([]);
  const [reps, setReps] = useState<RepItem[]>([]);
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [accountError, setAccountError] = useState('');

  const [selectedConference, setSelectedConference] = useState<ConferenceItem | null>(null);
  const [targetMin, setTargetMin] = useState(75);
  const [targetMax, setTargetMax] = useState(85);
  const [selectedRepIds, setSelectedRepIds] = useState<Set<number>>(new Set());
  const [coverage, setCoverage] = useState(70);
  const [density, setDensity] = useState<Density>('moderate');

  const [previewResult, setPreviewResult] = useState<SimulationResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');

  const [confirmWrite, setConfirmWrite] = useState(false);
  const [writeLoading, setWriteLoading] = useState(false);
  const [writeStatus, setWriteStatus] = useState('');

  const [confirmReset, setConfirmReset] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetStatus, setResetStatus] = useState('');

  const loadAccount = useCallback(async () => {
    if (!accountId.trim()) return;
    setLoadingAccount(true);
    setAccountError('');
    setConferences([]);
    setReps([]);
    setSelectedConference(null);
    setPreviewResult(null);
    setWriteStatus('');
    setResetStatus('');

    try {
      const [confsRes, repsRes] = await Promise.all([
        fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`),
        fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/reps`),
      ]);

      if (!confsRes.ok) {
        const err = await confsRes.json().catch(() => ({ error: 'Unknown error' }));
        setAccountError(err.error ?? 'Failed to load conferences');
        return;
      }
      if (!repsRes.ok) {
        const err = await repsRes.json().catch(() => ({ error: 'Unknown error' }));
        setAccountError(err.error ?? 'Failed to load reps');
        return;
      }

      const confsData = await confsRes.json();
      const repsData = await repsRes.json();

      setCompanyName(confsData.companyName ?? '');
      setConferences(confsData.conferences ?? []);
      setReps(repsData.reps ?? []);
      setSelectedRepIds(new Set((repsData.reps ?? []).map((r: RepItem) => r.id)));
    } catch (e) {
      setAccountError(e instanceof Error ? e.message : 'Failed to load account');
    } finally {
      setLoadingAccount(false);
    }
  }, [accountId]);

  const handleConferenceChange = (id: string) => {
    const conf = conferences.find(c => c.id === Number(id));
    setSelectedConference(conf ?? null);
    setPreviewResult(null);
    setWriteStatus('');
    setResetStatus('');
    setConfirmWrite(false);
    setConfirmReset(false);
  };

  const toggleRep = (id: number) => {
    setSelectedRepIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllReps = () => setSelectedRepIds(new Set(reps.map(r => r.id)));
  const deselectAllReps = () => setSelectedRepIds(new Set());

  const runPreview = async () => {
    if (!selectedConference) return;
    setPreviewLoading(true);
    setPreviewError('');
    setPreviewResult(null);
    setConfirmWrite(false);
    setWriteStatus('');

    try {
      const res = await fetch('/api/ops/simulate-conference-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
          targetScoreMin: targetMin,
          targetScoreMax: targetMax,
          repIds: Array.from(selectedRepIds),
          attendeeCoverage: coverage / 100,
          density,
          dryRun: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setPreviewError(data.error ?? 'Preview failed');
        return;
      }
      setPreviewResult(data as SimulationResult);
    } catch (e) {
      setPreviewError(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewLoading(false);
    }
  };

  const runWrite = async () => {
    if (!selectedConference || !previewResult) return;
    setWriteLoading(true);
    setWriteStatus('');

    try {
      const res = await fetch('/api/ops/simulate-conference-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
          targetScoreMin: targetMin,
          targetScoreMax: targetMax,
          repIds: Array.from(selectedRepIds),
          attendeeCoverage: coverage / 100,
          density,
          dryRun: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setWriteStatus(`Error: ${data.error ?? 'Write failed'}`);
        return;
      }
      const rw = data.recordsWritten;
      setWriteStatus(
        `Written: ${rw?.meetings ?? 0} meetings, ${rw?.followUps ?? 0} follow-ups, ${rw?.touchpoints ?? 0} touchpoints.`
      );
      setConfirmWrite(false);
      // Refresh conferences to update hasSimulatedActivity
      const confsRes = await fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`);
      if (confsRes.ok) {
        const confsData = await confsRes.json();
        setConferences(confsData.conferences ?? []);
        const updated = (confsData.conferences ?? []).find((c: ConferenceItem) => c.id === selectedConference.id);
        if (updated) setSelectedConference(updated);
      }
    } catch (e) {
      setWriteStatus(`Error: ${e instanceof Error ? e.message : 'Write failed'}`);
    } finally {
      setWriteLoading(false);
    }
  };

  const runReset = async () => {
    if (!selectedConference) return;
    setResetLoading(true);
    setResetStatus('');

    try {
      const res = await fetch('/api/ops/reset-simulated-activity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: accountId.trim(),
          conferenceId: selectedConference.id,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResetStatus(`Error: ${data.error ?? 'Reset failed'}`);
        return;
      }
      const d = data.deleted;
      setResetStatus(
        `Deleted: ${d?.meetings ?? 0} meetings, ${d?.followUps ?? 0} follow-ups, ${d?.touchpoints ?? 0} touchpoints.`
      );
      setConfirmReset(false);
      setPreviewResult(null);
      setWriteStatus('');
      // Refresh conferences
      const confsRes = await fetch(`/api/ops/simulate-conference-activity/accounts/${accountId.trim()}/conferences`);
      if (confsRes.ok) {
        const confsData = await confsRes.json();
        setConferences(confsData.conferences ?? []);
        const updated = (confsData.conferences ?? []).find((c: ConferenceItem) => c.id === selectedConference.id);
        if (updated) setSelectedConference(updated);
      }
    } catch (e) {
      setResetStatus(`Error: ${e instanceof Error ? e.message : 'Reset failed'}`);
    } finally {
      setResetLoading(false);
    }
  };

  const midScore = Math.round((targetMin + targetMax) / 2);
  const tier = scoreTier(midScore);

  const renderPreviewBlock = (result: SimulationResult) => {
    const dims = result.projectedDimensions;
    const wc = result.weightedContributions;
    const plan = result.plan;
    const scoreTierInfo = scoreTier(result.projectedScore);

    const dimRows: Array<{ label: string; val: number; weight: string; contrib: number }> = [
      { label: 'ICP & Target Quality', val: dims.dim1_icp_quality, weight: '20%', contrib: wc.dim1_icp_quality },
      { label: 'Meeting Execution', val: dims.dim2_meeting_execution, weight: '20%', contrib: wc.dim2_meeting_execution },
      { label: 'Pipeline Influence', val: dims.dim3_pipeline_influence, weight: '30%', contrib: wc.dim3_pipeline_influence },
      { label: 'Audience Breadth', val: dims.dim4_breadth, weight: '5%', contrib: wc.dim4_breadth },
      { label: 'Follow-up Execution', val: dims.dim5_followup_execution, weight: '10%', contrib: wc.dim5_followup_execution },
      { label: 'Net-New Logos', val: dims.dim6_net_new, weight: '5%', contrib: wc.dim6_net_new },
      { label: 'Cost Efficiency', val: dims.dim7_cost_efficiency, weight: '10%', contrib: wc.dim7_cost_efficiency },
    ];

    const total = dimRows.reduce((s, r) => s + r.contrib, 0);

    const activityItems = [
      { label: 'Meetings scheduled', value: `${plan.meetingsScheduled} (${plan.meetingsHeld} held)` },
      { label: 'Follow-ups', value: `${plan.followUpsCreated} (${plan.followUpsCompleted} done)` },
      { label: 'Touchpoints', value: plan.touchpoints },
      { label: 'Companies engaged', value: plan.companiesEngaged },
      { label: 'Net-new logos', value: plan.netNewLogos },
      { label: 'Pipeline influenced', value: formatPipeline(plan.pipelineInfluenced) },
    ];

    return (
      <div className="space-y-3">
        {/* Warnings */}
        {result.convergenceWarning && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
            ⚠ {result.convergenceWarning}
          </p>
        )}
        {result.dim3Warning && (
          <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            ℹ {result.dim3Warning}
          </p>
        )}

        {/* Score badge */}
        <div className="flex items-center gap-3">
          <span className="text-4xl font-bold text-gray-900">{result.projectedScore}</span>
          <span className={`text-sm font-semibold px-2.5 py-0.5 rounded-full text-white ${scoreTierInfo.color}`}>
            {scoreTierInfo.label}
          </span>
          <span className="text-xs text-gray-400">projected CES</span>
        </div>

        {/* Dimension breakdown */}
        <div className="border border-gray-200 rounded-md overflow-hidden">
          <div className="bg-gray-50 px-3 py-2 flex justify-between text-[10px] font-semibold text-gray-400 uppercase tracking-wide">
            <span>Dimension</span>
            <span>Score · Weight · Contribution</span>
          </div>
          {dimRows.map(r => (
            <div key={r.label} className="px-3 py-2.5 border-t border-gray-100">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs text-gray-700 font-medium">{r.label}</span>
                <span className="text-xs text-gray-400 tabular-nums flex-shrink-0">
                  {r.val.toFixed(1)} × {r.weight} = <span className="font-semibold text-gray-700">+{r.contrib.toFixed(1)}</span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full bg-blue-400"
                  style={{ width: `${Math.min(r.val, 100)}%` }}
                />
              </div>
            </div>
          ))}
          <div className="px-3 py-2 border-t border-gray-200 bg-gray-50 flex justify-between items-center">
            <span className="text-xs font-semibold text-gray-700">Weighted total</span>
            <span className="text-sm font-bold text-gray-900">{total.toFixed(1)}</span>
          </div>
        </div>

        {/* Activity plan */}
        <div className="grid grid-cols-2 gap-2">
          {activityItems.map(({ label, value }) => (
            <div key={label} className="bg-gray-50 border border-gray-100 rounded-md px-3 py-2">
              <div className="text-[10px] text-gray-400 uppercase tracking-wide mb-0.5">{label}</div>
              <div className="text-sm font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Conference Activity Simulator</h1>

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
          <p className="mt-2 text-sm text-gray-600">Account: <span className="font-medium text-gray-900">{companyName}</span></p>
        )}
      </div>

      {/* Step 2: Conference selector */}
      {conferences.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 2 — Conference</h2>
          <select
            value={selectedConference?.id ?? ''}
            onChange={e => handleConferenceChange(e.target.value)}
            className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
          >
            <option value="">Select a conference...</option>
            {conferences.map(c => (
              <option key={c.id} value={c.id}>
                {c.name} · CES {c.currentCes ?? '—'} · {c.status ?? 'unknown'}
              </option>
            ))}
          </select>
          {selectedConference?.hasSimulatedActivity && (
            <span className="mt-2 inline-block text-xs bg-amber-100 text-amber-800 border border-amber-300 rounded px-2 py-0.5">
              simulated data exists
            </span>
          )}
        </div>
      )}

      {/* Step 3: Target score range */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 3 — Target Score Range</h2>
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex-1 min-w-[80px]">
              <label className="block text-xs text-gray-500 mb-1">Min</label>
              <input
                type="number"
                min={0}
                max={100}
                value={targetMin}
                onChange={e => setTargetMin(Math.min(Number(e.target.value), targetMax))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
              />
            </div>
            <div className="flex-1 min-w-[80px]">
              <label className="block text-xs text-gray-500 mb-1">Max</label>
              <input
                type="number"
                min={0}
                max={100}
                value={targetMax}
                onChange={e => setTargetMax(Math.max(Number(e.target.value), targetMin))}
                className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full"
              />
            </div>
          </div>
          {/* Visual range bar */}
          <div className="relative h-3 bg-gray-100 rounded-full overflow-hidden mb-2">
            <div
              className={`absolute h-full rounded-full ${tier.color}`}
              style={{
                left: `${targetMin}%`,
                width: `${targetMax - targetMin}%`,
              }}
            />
          </div>
          <p className="text-xs text-gray-500">
            Targeting: <span className="font-medium text-gray-700">{tier.label} ({targetMin}–{targetMax})</span> · midpoint {midScore}
          </p>
        </div>
      )}

      {/* Step 4: Rep selector */}
      {selectedConference && reps.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 4 — Reps</h2>
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAllReps}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Select all
            </button>
            <span className="text-xs text-gray-400">/</span>
            <button
              onClick={deselectAllReps}
              className="text-xs text-blue-600 hover:text-blue-800 underline"
            >
              Deselect all
            </button>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {reps.map(rep => (
              <label key={rep.id} className="flex items-center gap-2 text-sm cursor-pointer min-w-0">
                <input
                  type="checkbox"
                  checked={selectedRepIds.has(rep.id)}
                  onChange={() => toggleRep(rep.id)}
                  className="rounded flex-shrink-0"
                />
                <span className="text-gray-900 flex-shrink-0">{rep.name}</span>
                <span className="text-gray-400 text-xs truncate">{rep.email}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Step 5: Coverage and density */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 5 — Coverage &amp; Density</h2>
          <div className="mb-4">
            <label className="block text-sm text-gray-700 mb-1">
              ICP attendee coverage: <span className="font-medium">{coverage}%</span>
            </label>
            <input
              type="number"
              min={10}
              max={100}
              step={5}
              value={coverage}
              onChange={e => setCoverage(Number(e.target.value))}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm w-full sm:w-32"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-700 mb-2">Activity density</label>
            <div className="space-y-2">
              {(['light', 'moderate', 'heavy'] as Density[]).map(d => (
                <label key={d} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="density"
                    value={d}
                    checked={density === d}
                    onChange={() => setDensity(d)}
                    className="mt-0.5 flex-shrink-0"
                  />
                  <div>
                    <span className="text-sm font-medium text-gray-900 capitalize">{d}</span>
                    <p className="text-xs text-gray-500 mt-0.5">{densityDescriptions[d]}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Step 6: Preview */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 6 — Preview</h2>
          <button
            onClick={runPreview}
            disabled={previewLoading}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {previewLoading ? 'Computing...' : 'Preview simulation'}
          </button>
          {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
          {previewResult && (
            <div className="mt-4">
              {renderPreviewBlock(previewResult)}
            </div>
          )}
        </div>
      )}

      {/* Step 7: Write */}
      {selectedConference && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 7 — Write</h2>
          {!previewResult ? (
            <p className="text-sm text-gray-500">Run preview first before writing.</p>
          ) : !confirmWrite ? (
            <button
              onClick={() => setConfirmWrite(true)}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 w-full sm:w-auto"
            >
              Write simulation to {selectedConference?.name}
            </button>
          ) : (
            <div className="space-y-3">
              <div className="text-sm text-gray-700 space-y-1">
                <p>Writing to <strong>{selectedConference.name}</strong> ({companyName || accountId}):</p>
                <ul className="list-disc list-inside text-gray-600 space-y-0.5 pl-1">
                  <li>{previewResult.plan.meetingsScheduled} meetings ({previewResult.plan.meetingsHeld} held)</li>
                  <li>{previewResult.plan.followUpsCreated} follow-ups</li>
                  <li>{previewResult.plan.touchpoints} touchpoints</li>
                </ul>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runWrite}
                  disabled={writeLoading}
                  className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-md hover:bg-green-700 disabled:opacity-50"
                >
                  {writeLoading ? 'Writing...' : 'Confirm write'}
                </button>
                <button
                  onClick={() => setConfirmWrite(false)}
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {writeStatus && (
            <p className={`mt-2 text-sm ${writeStatus.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {writeStatus}
            </p>
          )}
        </div>
      )}

      {/* Step 8: Reset */}
      {selectedConference?.hasSimulatedActivity && (
        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <h2 className="font-semibold text-gray-900 mb-4">Step 8 — Reset Simulated Activity</h2>
          {!confirmReset ? (
            <button
              onClick={() => setConfirmReset(true)}
              className="px-4 py-2 border border-red-300 text-red-700 text-sm rounded-md hover:bg-red-50 w-full sm:w-auto"
            >
              Reset simulated activity
            </button>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-700">
                Permanently delete all <code className="text-xs bg-gray-100 px-1 rounded">source=simulated</code> records for <strong>{selectedConference.name}</strong>. Cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={runReset}
                  disabled={resetLoading}
                  className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                >
                  {resetLoading ? 'Resetting...' : 'Confirm reset'}
                </button>
                <button
                  onClick={() => setConfirmReset(false)}
                  className="px-3 py-1.5 border border-gray-300 text-sm rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
          {resetStatus && (
            <p className={`mt-2 text-sm ${resetStatus.startsWith('Error') ? 'text-red-600' : 'text-green-700'}`}>
              {resetStatus}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
